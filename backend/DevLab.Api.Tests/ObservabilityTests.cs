using System.Net.Http.Json;
using DevLab.Api.Features.Observability;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace DevLab.Api.Tests;

public sealed class ObservabilityTests : IClassFixture<LabApiFactory>, IDisposable
{
    private readonly WebApplicationFactory<Program> _app;
    private readonly HttpClient _client;

    public ObservabilityTests(LabApiFactory factory)
    {
        // The checkout calls the inventory endpoint over HTTP. In-memory there is no Kestrel to reach:
        // route that HttpClient into the TestServer instead (resolved lazily, once the server exists).
        WebApplicationFactory<Program>? app = null;
        app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
            s.AddHttpClient(ObservabilityLesson.InventoryClient)
             .ConfigurePrimaryHttpMessageHandler(() => app!.Server.CreateHandler())));
        _app = app;
        _client = _app.CreateClient();
    }

    [Fact]
    public async Task Checkout_produces_a_trace_with_nested_custom_spans_and_correlated_logs()
    {
        var result = await CheckoutAsync("/api/observability/checkout");
        var trace = await FindTraceAsync(result.TraceId);

        var checkout = Assert.Single(trace.Spans, s => s.Name == "checkout");
        var children = trace.Spans.Where(s => s.ParentSpanId == checkout.SpanId).Select(s => s.Name).ToList();
        Assert.Equal(["validate-cart", "db.query products", "reserve-stock", "charge-payment"], children);

        // checkout itself hangs under the ASP.NET Core server span of POST /checkout.
        var server = Assert.Single(trace.Spans, s => s.SpanId == checkout.ParentSpanId);
        Assert.Equal("Server", server.Kind);

        var db = Assert.Single(trace.Spans, s => s.Name == "db.query products");
        Assert.Contains("SELECT", db.Tags["db.query.text"]);

        Assert.Contains(trace.Logs, l => l.Message.Contains("completed", StringComparison.Ordinal) && l.Scopes.ContainsKey("OrderId"));
    }

    [Fact]
    public async Task Incoming_traceparent_is_continued_and_echoed()
    {
        const string traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/observability/checkout");
        request.Headers.Add("traceparent", $"00-{traceId}-00f067aa0ba902b7-01");

        var response = await _client.SendAsync(request);
        var result = await response.Content.ReadFromJsonAsync<CheckoutResult>();

        Assert.Equal(traceId, result!.TraceId);
        Assert.StartsWith($"00-{traceId}-", response.Headers.GetValues("traceparent").Single(), StringComparison.Ordinal);
        var trace = await FindTraceAsync(traceId);
        Assert.Contains(trace.Spans, s => s.ParentSpanId == "00f067aa0ba902b7");
    }

    [Fact]
    public async Task Failed_payment_marks_the_span_as_error()
    {
        var result = await CheckoutAsync("/api/observability/checkout?fail=true");
        Assert.Equal("payment_declined", result.Outcome);

        var trace = await FindTraceAsync(result.TraceId);
        var payment = Assert.Single(trace.Spans, s => s.Name == "charge-payment");
        Assert.Equal("Error", payment.Status);
        Assert.Contains(payment.Events, e => e.Name == "exception");
        Assert.True(trace.HasError);
    }

    [Fact]
    public async Task Metrics_are_aggregated_by_outcome()
    {
        await CheckoutAsync("/api/observability/checkout");

        var points = await _client.GetFromJsonAsync<List<MetricPoint>>("/api/observability/metrics");
        Assert.Contains(points!, p => p.Instrument == "devlab.checkout.count" && p.Outcome == "success" && p.Sum >= 1);
        Assert.Contains(points!, p => p.Instrument == "devlab.checkout.duration" && p.Max > 0);
    }

    private async Task<CheckoutResult> CheckoutAsync(string url)
    {
        var response = await _client.PostAsync(url, null);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<CheckoutResult>();
        Assert.False(string.IsNullOrEmpty(result!.TraceId));
        return result;
    }

    private async Task<TraceView> FindTraceAsync(string traceId)
    {
        // The server span ends just AFTER the response is written: poll briefly.
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var traces = await _client.GetFromJsonAsync<List<TraceView>>("/api/observability/traces?limit=30");
            var trace = traces!.FirstOrDefault(t => t.TraceId == traceId);
            var checkout = trace?.Spans.FirstOrDefault(s => s.Name == "checkout");
            if (checkout is not null && trace!.Spans.Any(s => s.SpanId == checkout.ParentSpanId))
                return trace;
            await Task.Delay(50);
        }
        throw new Xunit.Sdk.XunitException($"Trace {traceId} not found in /api/observability/traces");
    }

    public void Dispose()
    {
        _client.Dispose();
        _app.Dispose();
    }
}
