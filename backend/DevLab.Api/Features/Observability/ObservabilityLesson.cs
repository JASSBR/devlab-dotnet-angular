using Microsoft.AspNetCore.Http.Features;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace DevLab.Api.Features.Observability;

/// <summary>
/// Plugs the lesson into the OpenTelemetry pipeline that AddServiceDefaults() created:
/// our ActivitySource and Meter, plus two in-memory processors feeding the in-app trace viewer.
/// The OTLP exporter (Aspire dashboard, Jaeger, Grafana…) receives exactly the same data.
/// </summary>
public static class ObservabilityLesson
{
    public const string InventoryClient = "inventory";

    public static IServiceCollection AddObservabilityLesson(this IServiceCollection services)
    {
        services.AddSingleton<TelemetryStore>();
        services.AddSingleton<CheckoutMetrics>();
        services.AddSingleton<InAppMetricsListener>();
        services.AddScoped<CheckoutSimulator>();
        services.AddHttpClient(InventoryClient);

        // Configure* = "add to the provider, whoever builds it" — no second AddOpenTelemetry() call needed.
        services.ConfigureOpenTelemetryTracerProvider(t => t
            .AddSource(CheckoutMetrics.MeterName)
            .AddProcessor(sp => new InMemorySpanProcessor(sp.GetRequiredService<TelemetryStore>())));
        services.ConfigureOpenTelemetryMeterProvider(m => m.AddMeter(CheckoutMetrics.MeterName));
        services.ConfigureOpenTelemetryLoggerProvider(l => l
            .AddProcessor(sp => new InMemoryLogProcessor(sp.GetRequiredService<TelemetryStore>())));
        return services;
    }

    /// <summary>
    /// Echoes the server span's W3C context in a response header, so the browser (and you, in the
    /// network panel) can see which trace a response belongs to. W3C Trace Context Level 2 drafts
    /// a dedicated `traceresponse` header for this; the lab reuses the familiar `traceparent` name.
    /// </summary>
    public static IApplicationBuilder UseTraceparentResponseHeader(this IApplicationBuilder app) =>
        app.Use((ctx, next) =>
        {
            var activity = ctx.Features.Get<IHttpActivityFeature>()?.Activity;
            if (activity is not null)
                ctx.Response.OnStarting(() =>
                {
                    ctx.Response.Headers["traceparent"] = activity.Id;
                    return Task.CompletedTask;
                });
            return next(ctx);
        });

    public static IEndpointRouteBuilder MapObservabilityEndpoints(this IEndpointRouteBuilder app)
    {
        // Created now, not on first use: a MeterListener only sees measurements made after it starts.
        app.ServiceProvider.GetRequiredService<InAppMetricsListener>();

        var group = app.MapGroup("/api/observability").WithTags("Observability");

        // ?fail=true → the payment step fails: a red span, an exception event, a Warning log.
        group.MapPost("/checkout", async (bool? fail, CheckoutSimulator simulator, CancellationToken ct) =>
            TypedResults.Ok(await simulator.RunAsync(fail ?? false, ct)));

        // Called BY the checkout over HTTP: its server span is a child of the HttpClient span.
        group.MapGet("/inventory/{productId:int}", async (int productId, HttpRequest request, ILogger<CheckoutSimulator> logger, CancellationToken ct) =>
        {
            await Task.Delay(Random.Shared.Next(15, 40), ct);
            logger.LogInformation("Stock reserved for product {ProductId} (incoming traceparent {Traceparent})",
                productId, request.Headers.TraceParent.ToString());
            return TypedResults.Ok(new { productId, reserved = true, traceparent = request.Headers.TraceParent.ToString() });
        });

        // ?traceId= looks one trace up, like a trace backend's search: the "recent" list alone
        // can push it out when other traffic (or parallel test hosts) is also being traced.
        group.MapGet("/traces", (TelemetryStore store, int? limit, string? traceId) =>
            TypedResults.Ok(store.RecentTraces(Math.Clamp(limit ?? 8, 1, 30), traceId)));

        group.MapGet("/metrics", (InAppMetricsListener listener) => TypedResults.Ok(listener.Snapshot()));

        return app;
    }
}
