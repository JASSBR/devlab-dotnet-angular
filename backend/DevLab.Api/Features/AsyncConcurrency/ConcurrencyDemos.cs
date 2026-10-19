using System.Diagnostics;
using System.Threading.Channels;

namespace DevLab.Api.Features.AsyncConcurrency;

public record JobSpan(int Job, long StartMs, long EndMs, int InFlightAtStart);
public record ThrottleResult(int MaxConcurrency, int ObservedMaxInFlight, long TotalMs, IReadOnlyList<JobSpan> Jobs);
public record ChannelEvent(long AtMs, string Kind, int Item, int Buffered);
public record ChannelResult(int Capacity, int ProducerWaits, long TotalMs, IReadOnlyList<ChannelEvent> Events);
public record RaceResult(string Mode, int Expected, int Actual, int Lost, double Ms, int ProcessorCount);

/// <summary>Throttling, producer/consumer and race conditions — the three classics.</summary>
internal static class ConcurrencyDemos
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/throttle", (int? max, CancellationToken ct) => ThrottleAsync(Math.Clamp(max ?? 3, 1, 20), ct));

        group.MapGet("/channel", (int? capacity, int? items, int? producerDelayMs, int? consumerDelayMs, CancellationToken ct) =>
            ChannelAsync(Math.Clamp(capacity ?? 3, 1, 10), Math.Clamp(items ?? 10, 1, 20),
                Math.Clamp(producerDelayMs ?? 50, 0, 300), Math.Clamp(consumerDelayMs ?? 200, 0, 300), ct));

        group.MapGet("/race", (int? n) => TypedResults.Ok(Race(Math.Clamp(n ?? 10_000, 1_000, 1_000_000))));
    }

    // ── SemaphoreSlim: at most K jobs inside the critical section at any time ─────────────────
    private static async Task<ThrottleResult> ThrottleAsync(int max, CancellationToken ct)
    {
        using var semaphore = new SemaphoreSlim(max, max);
        var inFlight = 0;
        var observedMax = 0;
        var sw = Stopwatch.StartNew();

        async Task<JobSpan> RunJobAsync(int job)
        {
            await semaphore.WaitAsync(ct);        // async wait: no thread is parked while queued
            try
            {
                var now = Interlocked.Increment(ref inFlight);
                InterlockedMax(ref observedMax, now);
                var start = sw.ElapsedMilliseconds;
                await Task.Delay(150, ct);        // the throttled I/O (an external API with a quota…)
                return new JobSpan(job, start, sw.ElapsedMilliseconds, now);
            }
            finally
            {
                Interlocked.Decrement(ref inFlight);
                semaphore.Release();              // ALWAYS in finally, or a failing job leaks a slot forever
            }
        }

        var jobs = await Task.WhenAll(Enumerable.Range(1, 20).Select(RunJobAsync));
        return new ThrottleResult(max, observedMax, sw.ElapsedMilliseconds, jobs);
    }

    // Lock-free "max": retry the compare-and-swap until nobody changed the value under us.
    private static void InterlockedMax(ref int target, int value)
    {
        int current;
        while (value > (current = Volatile.Read(ref target)) &&
               Interlocked.CompareExchange(ref target, value, current) != current)
        {
            // another thread won the race: re-read and retry
        }
    }

    // ── Channel<T>: bounded queue between a producer and a consumer (backpressure) ────────────
    private static async Task<ChannelResult> ChannelAsync(int capacity, int items, int producerDelay, int consumerDelay, CancellationToken ct)
    {
        // Wait = when the buffer is full, WriteAsync does not complete until the consumer reads.
        // The same building block sits behind a BackgroundService work queue.
        var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = true,
        });
        var events = new List<ChannelEvent>();
        var gate = new Lock();   // producer and consumer both append to the timeline
        var sw = Stopwatch.StartNew();
        var waits = 0;

        void Record(string kind, int item)
        {
            lock (gate) events.Add(new ChannelEvent(sw.ElapsedMilliseconds, kind, item, channel.Reader.Count));
        }

        var producer = Task.Run(async () =>
        {
            for (var i = 1; i <= items; i++)
            {
                if (producerDelay > 0) await Task.Delay(producerDelay, ct);
                if (!channel.Writer.TryWrite(i))          // buffer full → we are going to WAIT
                {
                    waits++;
                    Record("blocked", i);
                    await channel.Writer.WriteAsync(i, ct);
                }
                Record("produced", i);
            }
            channel.Writer.Complete();                    // tells the consumer "no more items"
        }, ct);

        var consumer = Task.Run(async () =>
        {
            await foreach (var item in channel.Reader.ReadAllAsync(ct))
            {
                Record("consumed", item);
                if (consumerDelay > 0) await Task.Delay(consumerDelay, ct);   // slow processing
            }
        }, ct);

        await Task.WhenAll(producer, consumer);
        lock (gate) return new ChannelResult(capacity, waits, sw.ElapsedMilliseconds, [.. events]);
    }

    // ── Race condition: an increment is three steps (read, add, write) another thread can interleave ──
    private static RaceResult[] Race(int n)
    {
        var options = new ParallelOptions { MaxDegreeOfParallelism = Math.Max(4, Environment.ProcessorCount) };

        var unsafeCounter = 0;
        var ms1 = Time(() => Parallel.For(0, n, options, _ => unsafeCounter++));   // ← the bug: no analyzer catches it

        var atomic = 0;
        var ms2 = Time(() => Parallel.For(0, n, options, _ => Interlocked.Increment(ref atomic)));

        var locked = 0;
        var gate = new Lock();
        var ms3 = Time(() => Parallel.For(0, n, options, _ => { lock (gate) locked++; }));

        return
        [
            new("counter++", n, unsafeCounter, n - unsafeCounter, ms1, Environment.ProcessorCount),
            new("Interlocked", n, atomic, n - atomic, ms2, Environment.ProcessorCount),
            new("lock", n, locked, n - locked, ms3, Environment.ProcessorCount),
        ];
    }

    private static double Time(Action action)
    {
        var sw = Stopwatch.StartNew();
        action();
        return Math.Round(sw.Elapsed.TotalMilliseconds, 2);
    }
}
