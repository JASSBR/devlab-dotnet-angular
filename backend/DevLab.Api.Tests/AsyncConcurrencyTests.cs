using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DevLab.Api.Features.AsyncConcurrency;

namespace DevLab.Api.Tests;

/// <summary>
/// Every demo of the async lesson is a measurement, so the tests assert on the measurements:
/// WhenAll ≈ max not sum, the semaphore really caps the in-flight count, the channel really
/// makes the producer wait, Interlocked/Lock never lose an increment, cancellation is recorded.
/// </summary>
public class AsyncConcurrencyTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task WhenAll_takes_about_the_max_while_sequential_takes_the_sum()
    {
        var r = await _client.GetFromJsonAsync<WhenAllResult>("/api/async/whenall");

        Assert.NotNull(r);
        Assert.Equal(5, r.Calls.Count);
        var sum = r.Calls.Sum(c => c.DelayMs);
        var max = r.Calls.Max(c => c.DelayMs);
        Assert.True(r.SequentialMs >= sum, $"sequential {r.SequentialMs} ms < sum {sum} ms");
        Assert.True(r.ParallelMs >= max, $"parallel {r.ParallelMs} ms < max {max} ms");
        Assert.True(r.ParallelMs < sum, $"parallel {r.ParallelMs} ms should be well under the sum {sum} ms");
    }

    [Theory]
    [InlineData(100, 600, "service")]
    [InlineData(600, 100, "timeout")]
    public async Task WhenAny_returns_the_first_task_to_finish(int serviceMs, int timeoutMs, string winner)
    {
        var r = await _client.GetFromJsonAsync<WhenAnyResult>($"/api/async/whenany?serviceMs={serviceMs}&timeoutMs={timeoutMs}");

        Assert.NotNull(r);
        Assert.Equal(winner, r.Winner);
        Assert.True(r.ElapsedMs < Math.Max(serviceMs, timeoutMs), $"waited {r.ElapsedMs} ms: the loser was awaited");
    }

    [Theory]
    [InlineData(1)]
    [InlineData(4)]
    public async Task Semaphore_caps_the_number_of_jobs_in_flight(int max)
    {
        var r = await _client.GetFromJsonAsync<ThrottleResult>($"/api/async/throttle?max={max}");

        Assert.NotNull(r);
        Assert.Equal(20, r.Jobs.Count);
        Assert.True(r.ObservedMaxInFlight <= max, $"observed {r.ObservedMaxInFlight} jobs in flight with max={max}");
        Assert.True(r.ObservedMaxInFlight >= 1);
    }

    [Fact]
    public async Task Bounded_channel_makes_a_fast_producer_wait()
    {
        var r = await _client.GetFromJsonAsync<ChannelResult>("/api/async/channel?capacity=2&items=8&producerDelayMs=0&consumerDelayMs=50");

        Assert.NotNull(r);
        Assert.Equal(8, r.Events.Count(e => e.Kind == "produced"));
        Assert.Equal(8, r.Events.Count(e => e.Kind == "consumed"));
        Assert.True(r.ProducerWaits > 0, "a producer faster than its consumer must hit the full buffer");
        Assert.All(r.Events, e => Assert.True(e.Buffered <= 2, $"buffer held {e.Buffered} items with capacity 2"));
    }

    [Fact]
    public async Task Stream_yields_the_requested_number_of_items()
    {
        using var response = await _client.GetAsync("/api/async/stream?count=4&delayMs=10", HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        await using var body = await response.Content.ReadAsStreamAsync();

        var items = new List<StreamItem>();
        await foreach (var item in JsonSerializer.DeserializeAsyncEnumerable<StreamItem>(body, Json))
            items.Add(item!);

        Assert.Equal([1, 2, 3, 4], items.Select(i => i.Index));
    }

    [Fact]
    public async Task Aborted_request_is_recorded_as_cancelled_at_its_step()
    {
        var runId = Guid.NewGuid().ToString("N");
        using (var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(450)))
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
                _client.GetAsync($"/api/async/slow?runId={runId}&steps=10&stepMs=200", cts.Token));
        }

        // The server notices the abort asynchronously: poll the log briefly.
        SlowRun? run = null;
        for (var i = 0; i < 20 && run is null; i++)
        {
            var log = await _client.GetFromJsonAsync<List<SlowRun>>("/api/async/slow/log");
            run = log!.FirstOrDefault(r => r.RunId == runId);
            if (run is null) await Task.Delay(100);
        }

        Assert.NotNull(run);
        Assert.Equal("cancelled", run.Status);
        Assert.InRange(run.StepReached, 1, 9);
    }

    [Fact]
    public async Task Slow_run_that_completes_is_logged_as_completed()
    {
        var runId = Guid.NewGuid().ToString("N");
        var r = await _client.GetFromJsonAsync<SlowRun>($"/api/async/slow?runId={runId}&steps=2&stepMs=10");

        Assert.NotNull(r);
        Assert.Equal("completed", r.Status);
        Assert.Equal(2, r.StepReached);
    }

    [Fact]
    public async Task ValueTask_completes_synchronously_on_a_cache_hit()
    {
        var key = Guid.NewGuid().ToString("N")[..8];
        var miss = await _client.GetFromJsonAsync<ValueTaskResult>($"/api/async/valuetask?key={key}");
        var hit = await _client.GetFromJsonAsync<ValueTaskResult>($"/api/async/valuetask?key={key}");

        Assert.False(miss!.CompletedSynchronously);
        Assert.True(hit!.CompletedSynchronously);
        Assert.Equal(miss.Value, hit.Value);
        Assert.True(hit.ValueTaskBytes < hit.TaskBytes / 10, $"ValueTask {hit.ValueTaskBytes} B vs Task {hit.TaskBytes} B: the synchronous ValueTask path must not allocate");
    }

    [Fact]
    public async Task Interlocked_and_lock_never_lose_an_increment()
    {
        var r = await _client.GetFromJsonAsync<List<RaceResult>>("/api/async/race?n=10000");

        Assert.NotNull(r);
        Assert.Equal(["counter++", "Interlocked", "lock"], r.Select(x => x.Mode));
        Assert.All(r, x => Assert.Equal(10_000, x.Expected));
        Assert.True(r[0].Actual <= 10_000);
        Assert.Equal(10_000, r[1].Actual);
        Assert.Equal(10_000, r[2].Actual);
    }

    [Fact]
    public async Task ThreadPool_snapshot_reports_live_counters()
    {
        var s = await _client.GetFromJsonAsync<ThreadPoolSnapshot>("/api/async/threadpool");

        Assert.NotNull(s);
        Assert.True(s.ThreadCount > 0);
        Assert.True(s.MaxWorkerThreads >= s.AvailableWorkerThreads);
        Assert.True(s.ProcessorCount > 0);
    }

    [Theory]
    [InlineData("async")]
    [InlineData("sleep")]
    [InlineData("sync-over-async")]
    public async Task ThreadPool_load_runs_every_mode(string mode)
    {
        var r = await _client.PostAsync($"/api/async/threadpool/load?mode={mode}&n=8&ms=100", null);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadFromJsonAsync<ThreadPoolLoadResult>();
        Assert.NotNull(body);
        Assert.Equal(mode, body.Mode);
        Assert.Equal(8, body.N);
        Assert.True(body.TotalMs >= 100);
    }

    [Fact]
    public async Task ThreadPool_load_rejects_an_unknown_mode()
    {
        var r = await _client.PostAsync("/api/async/threadpool/load?mode=fork-bomb&n=8&ms=100", null);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }
}
