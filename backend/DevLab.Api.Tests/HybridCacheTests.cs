using System.Net.Http.Json;
using DevLab.Api.Features.Caching;

namespace DevLab.Api.Tests;

public sealed class HybridCacheTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task HybridCache_runs_the_factory_once_under_10_concurrent_requests()
    {
        var client = factory.CreateClient();
        var name = $"stampede-{Guid.NewGuid():N}";

        // 10 real HTTP requests, in flight at the same time, for the same uncached key.
        var responses = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => client.GetFromJsonAsync<ExpensiveResult>($"/api/cache/hybrid?name={name}")));

        Assert.Single(responses.Select(r => r!.ComputedAt).Distinct());
        var stats = await client.GetFromJsonAsync<FactoryStats>($"/api/cache/hybrid/stats?name={name}");
        Assert.Equal(1, stats!.FactoryRuns);
    }

    [Fact]
    public async Task Stampede_demo_hybrid_runs_once_memory_runs_several_times()
    {
        var client = factory.CreateClient();

        var hybrid = await PostAsync(client, "/api/cache/stampede?mode=hybrid");
        var memory = await PostAsync(client, "/api/cache/stampede?mode=memory");

        Assert.Equal(10, hybrid.Requests);
        Assert.Equal(1, hybrid.FactoryRuns);
        Assert.True(memory.FactoryRuns > 1, $"IMemoryCache ran the factory {memory.FactoryRuns} time(s)");
    }

    [Fact]
    public async Task RemoveByTag_invalidates_the_entry()
    {
        var client = factory.CreateClient();
        var name = $"tag-{Guid.NewGuid():N}";

        var first = await client.GetFromJsonAsync<ExpensiveResult>($"/api/cache/hybrid?name={name}");
        var cached = await client.GetFromJsonAsync<ExpensiveResult>($"/api/cache/hybrid?name={name}");
        Assert.Equal(first!.ComputedAt, cached!.ComputedAt);

        (await client.DeleteAsync("/api/cache/hybrid/tags/greetings")).EnsureSuccessStatusCode();

        var recomputed = await client.GetFromJsonAsync<ExpensiveResult>($"/api/cache/hybrid?name={name}");
        Assert.NotEqual(first.ComputedAt, recomputed!.ComputedAt);
    }

    private static async Task<StampedeReport> PostAsync(HttpClient client, string url)
    {
        var response = await client.PostAsync(url, null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StampedeReport>())!;
    }
}
