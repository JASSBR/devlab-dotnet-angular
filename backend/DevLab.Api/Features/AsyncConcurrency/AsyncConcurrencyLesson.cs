using System.Diagnostics;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Caching.Memory;

namespace DevLab.Api.Features.AsyncConcurrency;

public record IoCall(string Name, int DelayMs, int ThreadBefore, int ThreadAfter);
public record WhenAllResult(long SequentialMs, long ParallelMs, IReadOnlyList<IoCall> Calls);
public record WhenAnyResult(string Winner, long ElapsedMs, int ServiceMs, int TimeoutMs);
public record StreamItem(int Index, DateTimeOffset ProducedAt, int Thread);
public record SlowRun(string RunId, string Status, int StepReached, int Steps, DateTimeOffset At);
public record ValueTaskResult(string Key, decimal Value, bool CompletedSynchronously, double Ms, long TaskBytes, long ValueTaskBytes, int Iterations);

/// <summary>
/// Async &amp; concurrency lesson. Every endpoint MEASURES something: durations, thread ids,
/// in-flight counts, allocations. All inputs are clamped: this runs on a shared instance.
/// </summary>
public static class AsyncConcurrencyLesson
{
    public static IServiceCollection AddAsyncConcurrencyLesson(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddSingleton<SlowRunLog>();
        services.AddSingleton<PriceCache>();
        services.AddSingleton<ThreadPoolDemo>();
        return services;
    }

    public static IEndpointRouteBuilder MapAsyncConcurrencyEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/async").WithTags("Async");

        group.MapGet("/whenall", WhenAllAsync);
        group.MapGet("/whenany", WhenAnyAsync);

        // IAsyncEnumerable<T>: System.Text.Json writes the JSON array element by element
        // and flushes while the next element is pending → the client sees items arrive.
        group.MapGet("/stream", (int? count, int? delayMs, CancellationToken ct) =>
            ProduceAsync(Math.Clamp(count ?? 8, 1, 20), Math.Clamp(delayMs ?? 400, 10, 1000), ct));

        group.MapGet("/slow", SlowAsync);
        group.MapGet("/slow/log", (SlowRunLog log) => TypedResults.Ok(log.Recent()));
        group.MapGet("/valuetask", ValueTaskAsync);

        ConcurrencyDemos.Map(group);
        ThreadPoolDemo.Map(group);
        return app;
    }

    private const int Iterations = 100_000;

    // 1. Sequential awaits (≈ sum of delays) vs Task.WhenAll (≈ max of delays).
    private static async Task<IResult> WhenAllAsync(CancellationToken ct)
    {
        (string Name, int DelayMs)[] calls = [("users", 300), ("orders", 450), ("stock", 200), ("prices", 350), ("reviews", 250)];

        var sw = Stopwatch.StartNew();
        foreach (var (name, delay) in calls)
            await SimulatedIoAsync(name, delay, ct);       // each await waits for the previous one
        var sequentialMs = sw.ElapsedMilliseconds;

        sw.Restart();
        var tasks = calls.Select(c => SimulatedIoAsync(c.Name, c.DelayMs, ct)).ToArray(); // all started NOW
        var results = await Task.WhenAll(tasks);                                           // then awaited together
        var parallelMs = sw.ElapsedMilliseconds;

        return TypedResults.Ok(new WhenAllResult(sequentialMs, parallelMs, results));
    }

    // 2. Task.WhenAny: first one wins — here a timeout racing a slow service.
    private static async Task<IResult> WhenAnyAsync(int? serviceMs, int? timeoutMs, CancellationToken ct)
    {
        var service = Math.Clamp(serviceMs ?? 800, 10, 2000);
        var timeout = Math.Clamp(timeoutMs ?? 500, 10, 2000);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);

        var sw = Stopwatch.StartNew();
        var serviceTask = Task.Delay(service, cts.Token);
        var timeoutTask = Task.Delay(timeout, cts.Token);
        var first = await Task.WhenAny(serviceTask, timeoutTask);
        await cts.CancelAsync();   // the loser keeps running unless YOU cancel it

        // Shortcut since .NET 6: await serviceTask.WaitAsync(TimeSpan.FromMilliseconds(timeout), ct)
        return TypedResults.Ok(new WhenAnyResult(first == serviceTask ? "service" : "timeout", sw.ElapsedMilliseconds, service, timeout));
    }

    // 3. CancellationToken: bound to HttpContext.RequestAborted. Client aborts → token fires →
    //    Task.Delay throws OperationCanceledException → we stop working for nobody.
    private static async Task<IResult> SlowAsync(string runId, int? steps, int? stepMs, SlowRunLog log, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(runId) || runId.Length > 64)
            return TypedResults.BadRequest(new { error = "runId is required (≤ 64 chars)." });

        var total = Math.Clamp(steps ?? 10, 1, 10);
        var delay = Math.Clamp(stepMs ?? 500, 10, 1000);
        var step = 0;
        try
        {
            for (step = 1; step <= total; step++)
                await Task.Delay(delay, ct);    // a real handler passes ct to EF Core / HttpClient the same way
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            log.Add(new SlowRun(runId, "cancelled", step, total, DateTimeOffset.UtcNow));
            return TypedResults.Empty;          // the client is gone: nothing to send
        }

        var run = new SlowRun(runId, "completed", total, total, DateTimeOffset.UtcNow);
        log.Add(run);
        return TypedResults.Ok(run);
    }

    // 4. ValueTask<T>: a cache hit completes synchronously → no Task allocation at all.
    private static async Task<IResult> ValueTaskAsync(string key, PriceCache cache)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 32)
            return TypedResults.BadRequest(new { error = "key is required (≤ 32 chars)." });

        var sw = Stopwatch.StartNew();
        var pending = cache.GetPriceAsync(key);
        var sync = pending.IsCompletedSuccessfully;   // inspect BEFORE awaiting…
        var value = await pending;                    // …and await exactly once
        var ms = sw.Elapsed.TotalMilliseconds;

        var (taskBytes, valueTaskBytes) = await PriceCache.MeasureHotPathAllocationsAsync(Iterations);
        return TypedResults.Ok(new ValueTaskResult(key, value, sync, Math.Round(ms, 3), taskBytes, valueTaskBytes, Iterations));
    }

    private static async Task<IoCall> SimulatedIoAsync(string name, int delayMs, CancellationToken ct)
    {
        var before = Environment.CurrentManagedThreadId;
        // No thread is blocked here: Task.Delay registers a timer and the method RETURNS to its caller.
        // When the timer fires, the rest of the method (the continuation) runs on any pool thread.
        await Task.Delay(delayMs, ct);
        return new IoCall(name, delayMs, before, Environment.CurrentManagedThreadId);
    }

    private static async IAsyncEnumerable<StreamItem> ProduceAsync(int count, int delayMs, [EnumeratorCancellation] CancellationToken ct)
    {
        for (var i = 1; i <= count; i++)
        {
            await Task.Delay(delayMs, ct);   // stop producing as soon as the client disconnects
            yield return new StreamItem(i, DateTimeOffset.UtcNow, Environment.CurrentManagedThreadId);
        }
    }
}

/// <summary>
/// Singleton shared by every request → must be thread-safe. C# 13 <see cref="Lock"/>: a dedicated
/// lock type (faster than lock(object), and the compiler warns if you lock on it the wrong way).
/// </summary>
public sealed class SlowRunLog
{
    private const int Capacity = 20;
    private readonly Lock _gate = new();
    private readonly LinkedList<SlowRun> _runs = new();

    public void Add(SlowRun run)
    {
        lock (_gate)
        {
            _runs.AddFirst(run);
            if (_runs.Count > Capacity) _runs.RemoveLast();
        }
    }

    public IReadOnlyList<SlowRun> Recent()
    {
        lock (_gate) return [.. _runs];   // copy inside the lock: never hand out the live collection
    }
}

/// <summary>Hot path that usually completes synchronously: the textbook ValueTask use case.</summary>
public sealed class PriceCache(IMemoryCache cache)
{
    public ValueTask<decimal> GetPriceAsync(string key) =>
        cache.TryGetValue($"price:{key}", out decimal price)
            ? ValueTask.FromResult(price)                     // hit: no allocation, no state machine
            : new ValueTask<decimal>(LoadAndCacheAsync(key)); // miss: wraps a real Task

    private async Task<decimal> LoadAndCacheAsync(string key)
    {
        await Task.Delay(300); // simulate the database
        var price = Math.Round(10 + (decimal)Random.Shared.NextDouble() * 90, 2);
        cache.Set($"price:{key}", price, TimeSpan.FromSeconds(30));
        return price;
    }

    // Same synchronous result returned N times as Task<T> then as ValueTask<T>: count the bytes.
    public static async Task<(long TaskBytes, long ValueTaskBytes)> MeasureHotPathAllocationsAsync(int iterations)
    {
        long sum = 0;
        var before = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < iterations; i++) sum += await CachedAsTaskAsync(i);
        var taskBytes = GC.GetAllocatedBytesForCurrentThread() - before;

        before = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < iterations; i++) sum += await CachedAsValueTaskAsync(i);
        var valueTaskBytes = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(sum);
        return (taskBytes, valueTaskBytes);
    }

    // Plain (non-async) methods on purpose: an async method's state machine is a class in Debug
    // builds, which would blur the comparison. Task.FromResult allocates a Task<int> per call
    // (only a few tiny values are cached by the runtime); a ValueTask<int> holding a result is a struct.
    private static Task<int> CachedAsTaskAsync(int i) => Task.FromResult(1000 + i);
    private static ValueTask<int> CachedAsValueTaskAsync(int i) => ValueTask.FromResult(1000 + i);
}
