using System.Net.Http.Json;
using DevLab.Api.Features.CSharp;
using DevLab.Api.Features.Linq;

namespace DevLab.Api.Tests;

public class CollectionsLinqTests : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client;

    public CollectionsLinqTests(LabApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Deferred_execution_runs_nothing_until_enumerated()
    {
        var demo = await _client.GetFromJsonAsync<DeferredDemo>("/api/linq/deferred");

        Assert.NotNull(demo);
        var defined = demo.Phases.Single(p => p.Step == "define");
        Assert.Empty(defined.Trace);                                    // building the query pulls nothing

        var first = demo.Phases.Single(p => p.Step == "enumerate #1");
        var second = demo.Phases.Single(p => p.Step == "enumerate #2");
        Assert.NotEmpty(first.Trace);
        Assert.Equal(first.Trace, second.Trace);                        // enumerating twice re-runs the whole pipeline

        var materialized = demo.Phases.Single(p => p.Step == "ToList + read twice");
        Assert.Equal(first.Trace.Count, materialized.Trace.Count);      // pulled once, then served from memory
    }

    [Fact]
    public async Task Deferred_execution_is_lazy_and_short_circuits()
    {
        var demo = await _client.GetFromJsonAsync<DeferredDemo>("/api/linq/deferred");

        // First() stops pulling as soon as one element passes the filter.
        var first = demo!.Phases.Single(p => p.Step == "First()");
        var full = demo.Phases.Single(p => p.Step == "enumerate #1");
        Assert.True(first.Trace.Count < full.Trace.Count);
        // Elements flow one by one: yield 1 → Where(1) before yield 2.
        Assert.StartsWith("yield 1", full.Trace[0], StringComparison.Ordinal);
        Assert.StartsWith("  Where(1)", full.Trace[1], StringComparison.Ordinal);
    }

    [Fact]
    public async Task HashSet_lookup_is_faster_than_list_lookup()
    {
        var bench = await _client.GetFromJsonAsync<LookupBenchmark>("/api/linq/hashset-vs-list?n=50000");

        Assert.NotNull(bench);
        Assert.Equal(50000, bench.N);
        Assert.Equal(bench.ListHits, bench.HashSetHits);                // same answers, different complexity
        Assert.True(bench.HashSetMs < bench.ListMs, $"HashSet {bench.HashSetMs} ms vs List {bench.ListMs} ms");
    }

    [Fact]
    public async Task Benchmark_clamps_n()
    {
        var bench = await _client.GetFromJsonAsync<LookupBenchmark>("/api/linq/hashset-vs-list?n=-3");
        Assert.Equal(1, bench!.N);
    }

    [Theory]
    [InlineData("fr", "True → France")]
    [InlineData("xx", "False → (null)")]
    public async Task Dictionary_try_get_value(string key, string expected)
    {
        var snippets = await _client.GetFromJsonAsync<List<Snippet>>($"/api/linq/collections?key={key}");
        Assert.Equal(expected, snippets!.Single(s => s.Concept == "TryGetValue").Result);
    }

    [Fact]
    public async Task Collections_expose_read_only_views()
    {
        var snippets = await _client.GetFromJsonAsync<List<Snippet>>("/api/linq/collections?key=xx");

        Assert.NotNull(snippets);
        Assert.Equal("True", snippets.Single(s => s.Concept == "leaky IReadOnlyList").Result);
        Assert.Equal("False", snippets.Single(s => s.Concept == "AsReadOnly").Result);
        Assert.Contains("KeyNotFoundException", snippets.Single(s => s.Concept == "indexer").Result);
    }

    [Fact]
    public async Task Operators_run_on_the_sample_orders()
    {
        var snippets = await _client.GetFromJsonAsync<List<Snippet>>("/api/linq/operators");
        Assert.NotNull(snippets);
        string R(string c) => snippets.Single(s => s.Concept == c).Result;

        Assert.Contains("InvalidOperationException", R("First"));
        Assert.Equal("(null)", R("FirstOrDefault"));
        Assert.Equal("True", R("Any"));
        Assert.Equal("False", R("All"));
        Assert.Contains("ArgumentException", R("ToDictionary (duplicate key)"));
        Assert.Equal("[1, 2, 3] [4, 5, 6] [7]", R("Chunk"));
    }
}
