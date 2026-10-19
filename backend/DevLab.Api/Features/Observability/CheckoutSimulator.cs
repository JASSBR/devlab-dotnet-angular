using System.Diagnostics;
using DevLab.Api.Features.Products;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Observability;

public record CheckoutResult(string OrderId, string TraceId, string Outcome, double DurationMs, decimal Total);

public sealed class PaymentDeclinedException(string message) : Exception(message);

/// <summary>
/// A fake checkout in four steps. Each step is a span (Activity) nested under "checkout",
/// itself nested under the ASP.NET Core server span — the waterfall you see in the lesson.
/// </summary>
public sealed class CheckoutSimulator(
    AppDbContext db,
    IHttpClientFactory httpClientFactory,
    IServer server,
    CheckoutMetrics metrics,
    ILogger<CheckoutSimulator> logger)
{
    // One ActivitySource per component, named like a namespace; registered with AddSource(...).
    // Static: an ActivitySource is cheap, thread-safe and lives as long as the process.
    public static readonly ActivitySource Source = new(CheckoutMetrics.MeterName, "1.0.0");

    public async Task<CheckoutResult> RunAsync(bool failPayment, CancellationToken ct)
    {
        var orderId = $"ORD-{Random.Shared.Next(1000, 9999)}";
        var started = Stopwatch.GetTimestamp();

        // A scope adds OrderId to EVERY log line written inside it, without repeating it in each message.
        using var scope = logger.BeginScope(new Dictionary<string, object> { ["OrderId"] = orderId });

        // StartActivity returns null when nobody listens (no OpenTelemetry) or the trace is not sampled:
        // hence the ?. everywhere — instrumentation must never cost anything when it is off.
        using var checkout = Source.StartActivity("checkout");
        checkout?.SetTag("order.id", orderId);
        logger.LogInformation("Checkout {OrderId} started", orderId);

        try
        {
            await ValidateCartAsync(ct);
            var products = await LoadProductsAsync(ct);
            await ReserveStockAsync(products[0].Id, ct);
            var total = products.Sum(p => p.Price);
            await ChargePaymentAsync(orderId, total, failPayment, ct);

            checkout?.SetStatus(ActivityStatusCode.Ok);
            var ms = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            metrics.Record("success", ms);
            logger.LogInformation("Checkout {OrderId} completed in {ElapsedMs:F0} ms for {Total} EUR", orderId, ms, total);
            return new CheckoutResult(orderId, checkout?.TraceId.ToHexString() ?? "", "success", ms, total);
        }
        catch (PaymentDeclinedException ex)
        {
            checkout?.SetStatus(ActivityStatusCode.Error, ex.Message);
            var ms = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            metrics.Record("payment_declined", ms);
            logger.LogWarning(ex, "Checkout {OrderId} failed: {Reason}", orderId, ex.Message);
            return new CheckoutResult(orderId, checkout?.TraceId.ToHexString() ?? "", "payment_declined", ms, 0);
        }
    }

    private static async Task ValidateCartAsync(CancellationToken ct)
    {
        using var span = Source.StartActivity("validate-cart");
        span?.SetTag("cart.items", 3);
        await Task.Delay(Random.Shared.Next(10, 25), ct);
        // An event = a timestamped point inside a span (cheaper than a child span).
        span?.AddEvent(new ActivityEvent("cart.validated"));
    }

    private async Task<List<Product>> LoadProductsAsync(CancellationToken ct)
    {
        // EF Core emits no spans by itself (OpenTelemetry.Instrumentation.EntityFrameworkCore is still
        // beta): we wrap the query by hand, with the OpenTelemetry semantic-convention tag names.
        using var span = Source.StartActivity("db.query products", ActivityKind.Client);
        var query = db.Products.AsNoTracking().OrderBy(p => p.Id).Take(3);
        span?.SetTag("db.system.name", "sqlite");
        span?.SetTag("db.query.text", query.ToQueryString());
        var products = await query.ToListAsync(ct);
        span?.SetTag("db.response.returned_rows", products.Count);
        return products;
    }

    private async Task ReserveStockAsync(int productId, CancellationToken ct)
    {
        using var span = Source.StartActivity("reserve-stock");
        span?.SetTag("product.id", productId);
        // A real HTTP call (to ourselves): HttpClient instrumentation adds a CLIENT span and injects
        // the `traceparent` header, the inventory endpoint continues the SAME trace (SERVER span).
        var client = httpClientFactory.CreateClient(ObservabilityLesson.InventoryClient);
        using var response = await client.GetAsync(new Uri(SelfBaseUri(), $"/api/observability/inventory/{productId}"), ct);
        response.EnsureSuccessStatusCode();
    }

    private static async Task ChargePaymentAsync(string orderId, decimal total, bool fail, CancellationToken ct)
    {
        using var span = Source.StartActivity("charge-payment", ActivityKind.Client);
        span?.SetTag("payment.provider", "fake-psp");
        span?.SetTag("payment.amount", total);
        await Task.Delay(Random.Shared.Next(40, 120), ct);
        if (!fail) return;

        var ex = new PaymentDeclinedException($"Card declined for {orderId}");
        // Status Error + an "exception" event (type, message, stack): what the dashboards turn red.
        span?.SetStatus(ActivityStatusCode.Error, ex.Message);
        span?.AddException(ex);
        throw ex;
    }

    /// <summary>Loopback address of this very process (Kestrel), whatever the public host name is.</summary>
    private Uri SelfBaseUri()
    {
        var address = server.Features.Get<IServerAddressesFeature>()?.Addresses
            .FirstOrDefault(a => a.StartsWith("http://", StringComparison.Ordinal)) ?? "http://localhost";
        var uri = new UriBuilder(address.Replace("://+", "://localhost").Replace("://*", "://localhost")
            .Replace("://[::]", "://localhost").Replace("://0.0.0.0", "://localhost"));
        return uri.Uri;
    }
}
