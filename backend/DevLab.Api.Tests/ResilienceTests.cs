using System.Net.Http.Json;
using DevLab.Api.Features.Resilience;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;

namespace DevLab.Api.Tests;

/// <summary>
/// The resilience demo makes the API call ITSELF over HTTP. Under WebApplicationFactory there is
/// no socket to call, so every IHttpClientFactory client gets the TestServer handler as its
/// primary handler: the resilience pipelines above it run unchanged.
/// </summary>
public sealed class ResilienceTests : IClassFixture<LabApiFactory>, IDisposable
{
    private readonly WebApplicationFactory<Program> _app;
    private readonly HttpClient _client;

    public ResilienceTests(LabApiFactory factory)
    {
        // One host per test: circuit breakers and the flaky state start fresh every time.
        _app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
            services.ConfigureAll<HttpClientFactoryOptions>(o => o.HttpMessageHandlerBuilderActions.Add(h =>
                h.PrimaryHandler = ((TestServer)h.Services.GetRequiredService<IServer>()).CreateHandler()))));
        _client = _app.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _app.Dispose();
    }

    [Fact]
    public async Task Without_resilience_a_transient_failure_reaches_the_caller()
    {
        await ArrangeAsync(new FlakyConfig(FailureRate: 0, LatencyMs: 0, FailNext: 1));

        var report = await RunAsync("none", calls: 1);

        Assert.False(report.Calls[0].Success);
        Assert.Single(report.Calls[0].Attempts);
    }

    [Theory]
    [InlineData("standard")]
    [InlineData("custom")]
    public async Task Retry_recovers_from_transient_failures(string pipeline)
    {
        await ArrangeAsync(new FlakyConfig(FailureRate: 0, LatencyMs: 0, FailNext: 2));

        var report = await RunAsync(pipeline, calls: 1);

        var call = Assert.Single(report.Calls);
        Assert.True(call.Success);
        Assert.Equal(3, call.Attempts.Count);                       // 2 failures + 1 success
        Assert.All(call.Attempts.Take(2), a => Assert.NotNull(a.RetryDelayMs));
        Assert.Equal(1, report.SuccessRate);
    }

    [Fact]
    public async Task Attempt_timeout_cuts_a_slow_call()
    {
        await ArrangeAsync(new FlakyConfig(FailureRate: 0, LatencyMs: 1500, FailNext: 0));

        var report = await RunAsync("custom", calls: 1);

        Assert.False(report.Calls[0].Success);
        Assert.Contains(report.Calls[0].Attempts, a => a.Outcome == "timeout");
    }

    [Fact]
    public async Task Circuit_opens_after_threshold_and_rejects_calls_fast()
    {
        await ArrangeAsync(new FlakyConfig(FailureRate: 1, LatencyMs: 0, FailNext: 0));

        var report = await RunAsync("custom", calls: 6);

        Assert.Equal("Open", report.Circuit);
        Assert.Contains(report.Calls, c => c.Outcome == "circuit-open");
        Assert.Equal(0, report.SuccessRate);

        var state = await _client.GetFromJsonAsync<ResilienceState>("/api/resilience/state");
        Assert.Contains(state!.Events, e => e.Pipeline == "custom" && e.Kind == "circuit-opened");
        Assert.Equal("Open", state.Circuits["custom"]);

        // Reset closes the breaker manually (CircuitBreakerManualControl).
        await _client.PostAsync("/api/resilience/reset", null);
        state = await _client.GetFromJsonAsync<ResilienceState>("/api/resilience/state");
        Assert.Equal("Closed", state!.Circuits["custom"]);
    }

    [Fact]
    public async Task Config_is_clamped_to_safe_bounds()
    {
        await _client.PostAsync("/api/resilience/reset", null);
        var response = await _client.PutAsJsonAsync("/api/resilience/flaky/config", new FlakyConfig(5, 999_999, 1000));
        var config = await response.Content.ReadFromJsonAsync<FlakyConfig>();

        Assert.Equal(new FlakyConfig(1, FlakyEndpointState.MaxLatencyMs, FlakyEndpointState.MaxFailNext), config);
    }

    private async Task ArrangeAsync(FlakyConfig config)
    {
        (await _client.PostAsync("/api/resilience/reset", null)).EnsureSuccessStatusCode();
        (await _client.PutAsJsonAsync("/api/resilience/flaky/config", config)).EnsureSuccessStatusCode();
    }

    private async Task<RunReport> RunAsync(string pipeline, int calls)
    {
        var response = await _client.PostAsJsonAsync("/api/resilience/run", new RunRequest(pipeline, calls));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RunReport>())!;
    }
}
