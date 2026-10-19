using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using DevLab.Api.Features.Performance;

namespace DevLab.Api.Tests;

public class PerformanceEndpointsTests : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client;

    public PerformanceEndpointsTests(LabApiFactory factory) => _client = factory.CreateClient();

    private async Task<AllocationResult> MeasureAsync(string mode)
    {
        // First call warms the code paths up (JIT, type loading) so the second one measures only the work.
        await _client.GetAsync($"/api/perf/allocations?mode={mode}&iterations=100");
        var result = await _client.GetFromJsonAsync<AllocationResult>($"/api/perf/allocations?mode={mode}&iterations=5000");
        Assert.NotNull(result);
        return result;
    }

    [Fact]
    public async Task Span_parsing_allocates_far_less_than_substring_parsing()
    {
        var substring = await MeasureAsync("substring");
        var span = await MeasureAsync("span");

        Assert.Equal(substring.Checksum, span.Checksum);   // same work, same answer
        Assert.True(substring.AllocatedBytes > 100_000, $"substring allocated only {substring.AllocatedBytes} B");
        Assert.True(span.AllocatedBytes * 10 < substring.AllocatedBytes, $"span {span.AllocatedBytes} B vs substring {substring.AllocatedBytes} B");
    }

    [Fact]
    public async Task Pooled_buffers_allocate_far_less_than_new_arrays()
    {
        var array = await MeasureAsync("array");
        var pool = await MeasureAsync("pool");

        Assert.True(array.AllocatedBytes >= 5000L * 4096, $"array allocated only {array.AllocatedBytes} B");
        Assert.True(pool.AllocatedBytes * 10 < array.AllocatedBytes, $"pool {pool.AllocatedBytes} B vs array {array.AllocatedBytes} B");
    }

    [Theory]
    [InlineData("/api/perf/allocations?mode=nope")]
    [InlineData("/api/perf/allocations?mode=span&iterations=0")]
    [InlineData("/api/perf/allocations?mode=span&iterations=10000000")]
    public async Task Invalid_parameters_are_rejected(string url)
    {
        var response = await _client.GetAsync(url);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Runtime_info_describes_gc_and_jit()
    {
        var info = await _client.GetFromJsonAsync<RuntimeInfo>("/api/perf/runtime");

        Assert.NotNull(info);
        Assert.StartsWith(".NET", info.Framework, StringComparison.Ordinal);
        Assert.True(info.ProcessorCount > 0);
        Assert.True(info.TotalAllocatedBytes > 0);
        Assert.True(info.Jit.CompiledMethods > 0);
        Assert.True(info.Jit.DynamicCodeCompiled);
        Assert.Equal(85_000, info.Gc.LargeObjectThresholdBytes);
        Assert.Contains(info.Gc.Mode, new[] { "Workstation", "Server" });
    }

    [Fact]
    public async Task Tiering_demo_compiles_a_fresh_method_every_run()
    {
        var first = await _client.GetFromJsonAsync<TieringResult>("/api/perf/tiering?durationMs=150");
        var second = await _client.GetFromJsonAsync<TieringResult>("/api/perf/tiering?durationMs=150&loop=true");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.NotEqual(first.Instantiation, second.Instantiation);   // a new generic instantiation → cold again
        Assert.Equal("call", first.Variant);
        Assert.Equal("loop", second.Variant);
        Assert.True(first.JitMethodsCompiled >= 1);
        Assert.True(first.Count > 30);
        Assert.NotEmpty(first.Timeline);
        Assert.True(first.FirstCallUs > 0);
    }

    [Fact]
    public async Task Demo_runs_are_published_on_the_DevLab_meter()
    {
        var runs = 0L;
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (instrument.Meter.Name == PerfMetrics.MeterName && instrument.Name == "devlab.perf.demo.runs")
                l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, value, _, _) => Interlocked.Add(ref runs, value));
        listener.Start();

        await _client.GetAsync("/api/perf/allocations?mode=span&iterations=10");

        Assert.True(Interlocked.Read(ref runs) >= 1);
    }
}
