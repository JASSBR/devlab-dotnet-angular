using System.Diagnostics;

namespace DevLab.Api.Features.AsyncConcurrency;

public record ThreadPoolSnapshot(int ThreadCount, long PendingWorkItems, long CompletedWorkItems,
    int AvailableWorkerThreads, int AvailableIoThreads, int MinWorkerThreads, int MaxWorkerThreads, int ProcessorCount);
public record ThreadPoolLoadResult(string Mode, int N, int Ms, long TotalMs, double AvgStartDelayMs, double MaxStartDelayMs,
    int PeakThreadCount, long PeakPendingWorkItems, ThreadPoolSnapshot Before, ThreadPoolSnapshot After);

/// <summary>
/// Thread-pool starvation, made visible. N work items each "wait" ms milliseconds, three ways:
///  - async           : await Task.Delay → the thread goes back to the pool immediately.
///  - sleep           : Thread.Sleep → the thread is held hostage; the pool must inject new threads (slowly).
///  - sync-over-async : Task.Delay(ms).Wait() → same hostage situation (the pool detects it and injects a bit faster).
/// Safety on a shared instance: N ≤ 50, ms ≤ 2000, and only one run at a time.
/// </summary>
public sealed class ThreadPoolDemo : IDisposable
{
    private static readonly string[] Modes = ["async", "sleep", "sync-over-async"];
    private readonly SemaphoreSlim _oneRunAtATime = new(1, 1);

    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/threadpool", () => TypedResults.Ok(Snapshot()));

        group.MapPost("/threadpool/load", async Task<IResult> (string mode, int? n, int? ms, ThreadPoolDemo demo) =>
        {
            if (!Modes.Contains(mode))
                return TypedResults.BadRequest(new { error = $"mode must be one of: {string.Join(", ", Modes)}" });

            if (!await demo._oneRunAtATime.WaitAsync(0))   // never stack two starvation runs
                return TypedResults.Conflict(new { error = "A thread-pool run is already in progress, retry in a few seconds." });
            try
            {
                return TypedResults.Ok(await RunAsync(mode, Math.Clamp(n ?? 20, 1, 50), Math.Clamp(ms ?? 1000, 50, 2000)));
            }
            finally
            {
                demo._oneRunAtATime.Release();
            }
        });
    }

    public static ThreadPoolSnapshot Snapshot()
    {
        ThreadPool.GetAvailableThreads(out var worker, out var io);
        ThreadPool.GetMinThreads(out var minWorker, out _);
        ThreadPool.GetMaxThreads(out var maxWorker, out _);
        return new ThreadPoolSnapshot(ThreadPool.ThreadCount, ThreadPool.PendingWorkItemCount, ThreadPool.CompletedWorkItemCount,
            worker, io, minWorker, maxWorker, Environment.ProcessorCount);
    }

    private static async Task<ThreadPoolLoadResult> RunAsync(string mode, int n, int ms)
    {
        var before = Snapshot();
        var sw = Stopwatch.StartNew();
        var startDelays = new double[n];

        // Start delay = time between "queued" and "a pool thread actually picked it up".
        // That queueing time is exactly what every other request suffers during starvation.
        var work = Enumerable.Range(0, n).Select(i =>
        {
            var queuedAt = sw.Elapsed.TotalMilliseconds;
            return mode switch
            {
                "async" => Task.Run(async () =>
                {
                    startDelays[i] = sw.Elapsed.TotalMilliseconds - queuedAt;
                    await Task.Delay(ms);
                }),
                "sleep" => Task.Run(() =>
                {
                    startDelays[i] = sw.Elapsed.TotalMilliseconds - queuedAt;
                    Thread.Sleep(ms);
                }),
                _ => Task.Run(() =>
                {
                    startDelays[i] = sw.Elapsed.TotalMilliseconds - queuedAt;
                    Task.Delay(ms).Wait();   // the anti-pattern on purpose: a pool thread blocked on async work
                }),
            };
        }).ToArray();

        var all = Task.WhenAll(work);
        int peakThreads = 0;
        long peakPending = 0;
        do
        {
            await Task.WhenAny(all, Task.Delay(50));   // sample every 50 ms (skips the instant enqueue burst)
            peakThreads = Math.Max(peakThreads, ThreadPool.ThreadCount);
            peakPending = Math.Max(peakPending, ThreadPool.PendingWorkItemCount);
        } while (!all.IsCompleted);
        await all;

        return new ThreadPoolLoadResult(mode, n, ms, sw.ElapsedMilliseconds,
            Math.Round(startDelays.Average(), 1), Math.Round(startDelays.Max(), 1),
            Math.Max(peakThreads, ThreadPool.ThreadCount), peakPending, before, Snapshot());
    }

    public void Dispose() => _oneRunAtATime.Dispose();
}
