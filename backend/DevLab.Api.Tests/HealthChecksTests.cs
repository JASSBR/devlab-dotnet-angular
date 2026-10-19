using System.Net;
using System.Text.Json;
using DevLab.Api.Features.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace DevLab.Api.Tests;

public class HealthChecksTests : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client;

    public HealthChecksTests(LabApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Historic_health_endpoint_still_answers_200()
    {
        // railway.json, deploy-azure.sh and the AppHost poll /health: it must not move.
        var response = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Readiness_lists_each_check_with_its_status()
    {
        var (status, report) = await GetReportAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, status);
        var names = report.GetProperty("checks").EnumerateArray().Select(c => c.GetProperty("name").GetString()).ToList();
        Assert.Contains("database", names);
        Assert.Contains("payment-gateway", names);
        Assert.DoesNotContain("self", names);
    }

    [Fact]
    public async Task Dependency_down_fails_readiness_but_not_liveness()
    {
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await _client.PostAsync("/api/health-lab/dependency/unhealthy", null)).StatusCode);

            var (readyStatus, ready) = await GetReportAsync("/health/ready");
            Assert.Equal(HttpStatusCode.ServiceUnavailable, readyStatus);
            Assert.Equal("Unhealthy", ready.GetProperty("status").GetString());

            var (liveStatus, _) = await GetReportAsync("/health/live");
            Assert.Equal(HttpStatusCode.OK, liveStatus);
            // The /api alias used by the browser demo answers exactly like the platform probe.
            var (aliasStatus, _) = await GetReportAsync("/api/health-lab/probes/ready");
            Assert.Equal(HttpStatusCode.ServiceUnavailable, aliasStatus);
            Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/health")).StatusCode);
        }
        finally
        {
            await _client.PostAsync("/api/health-lab/dependency/healthy", null);
        }
    }

    [Fact]
    public async Task Degraded_dependency_keeps_readiness_at_200()
    {
        try
        {
            await _client.PostAsync("/api/health-lab/dependency/degraded", null);

            var (status, report) = await GetReportAsync("/health/ready");
            Assert.Equal(HttpStatusCode.OK, status);
            Assert.Equal("Degraded", report.GetProperty("status").GetString());
        }
        finally
        {
            await _client.PostAsync("/api/health-lab/dependency/healthy", null);
        }
    }

    [Fact]
    public async Task Unknown_state_is_rejected()
    {
        var response = await _client.PostAsync("/api/health-lab/dependency/broken", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Startup_probe_is_healthy_once_the_host_has_started()
    {
        var (status, _) = await GetReportAsync("/health/startup");
        Assert.Equal(HttpStatusCode.OK, status);
    }

    [Fact]
    public void Broken_dependency_resets_itself_after_its_duration()
    {
        var clock = new ManualClock(DateTimeOffset.Parse("2026-01-01T00:00:00Z", System.Globalization.CultureInfo.InvariantCulture));
        var dependency = new DependencySimulator(clock);

        dependency.Set(HealthStatus.Unhealthy, TimeSpan.FromSeconds(60));
        clock.Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(HealthStatus.Unhealthy, dependency.CurrentStatus());

        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(HealthStatus.Healthy, dependency.CurrentStatus());
    }

    private async Task<(HttpStatusCode Status, JsonElement Report)> GetReportAsync(string path)
    {
        var response = await _client.GetAsync(path);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
        return (response.StatusCode, json);
    }

    private sealed class ManualClock(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }
}
