using System.Diagnostics;
using System.Numerics;
using System.Reflection;
using System.Runtime;

namespace DevLab.Api.Features.Performance;

// Count = calls so far (variant "call") or loop iterations so far (variant "loop").
public record TieringPoint(double AtMs, long Count, double AvgNs);

public record TieringResult(
    string Variant,
    bool JitOptimized,
    string Instantiation,
    double FirstCallUs,
    double Tier0AvgNs,
    double SteadyAvgNs,
    double Speedup,
    long Count,
    double DurationMs,
    long JitMethodsCompiled,
    double JitTimeMs,
    IReadOnlyList<TieringPoint> Timeline);

/// <summary>
/// Watches tiered compilation happen. A method is normally JIT-compiled once per process, so a
/// second run would only show warm code. Trick: <c>Work&lt;T&gt;</c> instantiated over a NEW value
/// type is a brand-new method body (value-type generics are never shared), so every run starts cold.
/// </summary>
public static class TieringDemo
{
    private const int Batch = 1_000;
    private const int Chunk = 512;
    private const int Chunks = 80;

    private static readonly Type[] Digits =
    [
        typeof(bool), typeof(byte), typeof(sbyte), typeof(short), typeof(ushort), typeof(int), typeof(uint), typeof(long),
        typeof(ulong), typeof(float), typeof(double), typeof(decimal), typeof(char), typeof(nint), typeof(nuint), typeof(Guid),
    ];

    private static int _runs = -1;

    // A Debug build marks the assembly [Debuggable(DisableOptimizations)]: its methods are JIT-compiled
    // once, unoptimized, and never tiered up. The demo is only meaningful in Release (Docker image, -c Release).
    public static bool JitOptimized { get; } =
        typeof(TieringDemo).Assembly.GetCustomAttribute<DebuggableAttribute>()?.IsJITOptimizerDisabled != true;

#pragma warning disable S2326 // T is only an identity: one instantiation = one method body to JIT
    // No loop → starts at tier-0 (no inlining, no register allocation: Math.Max and RotateLeft are real
    // calls), tier-1 only after 30 calls + the 100 ms call-counting delay, compiled in the background.
    public static long Work<T>(long x) where T : struct
    {
        x ^= x >>> 33;
        x *= unchecked((long)0xFF51AFD7ED558CCDUL);
        x = (long)BitOperations.RotateLeft((ulong)x, 17);
        x ^= x >>> 29;
        return Math.Max(x, 3) + Math.Abs(x % 7);
    }

    // A long loop in a method called ONCE: call counting can never help. Tier-0 code contains
    // patchpoints; after enough iterations the runtime compiles an optimized version of the method
    // body and jumps into it in the middle of the loop (On-Stack Replacement). The timestamps
    // written every 512 iterations show the switch.
    public static long WorkLoop<T>(long x, long[] chunkEnds) where T : struct
    {
        for (var i = 0; i < chunkEnds.Length * Chunk; i++)
        {
            x ^= x >>> 33;
            x *= unchecked((long)0xFF51AFD7ED558CCDUL);
            x = Math.Max(x, i) + Math.Abs(x % 7);
            if (i % Chunk == Chunk - 1) chunkEnds[i / Chunk] = Stopwatch.GetTimestamp();
        }
        return x;
    }
#pragma warning restore S2326

    public static TieringResult Run(TimeSpan duration, bool withLoop)
    {
        // Run n → ValueTuple<d0, d1, d2, d3> with n written in base 16: 65 536 distinct cold methods.
        var n = Interlocked.Increment(ref _runs);
        var marker = typeof(ValueTuple<,,,>).MakeGenericType(Digits[n & 15], Digits[(n >> 4) & 15], Digits[(n >> 8) & 15], Digits[(n >> 12) & 15]);
        var method = typeof(TieringDemo).GetMethod(withLoop ? nameof(WorkLoop) : nameof(Work))!.MakeGenericMethod(marker);

        // Process-wide counters: the tier-1 recompilation happens on a background thread, not ours.
        var methodsBefore = JitInfo.GetCompiledMethodCount(currentThread: false);
        var jitBefore = JitInfo.GetCompilationTime(currentThread: false);

        var (firstCallUs, coldNs, count, elapsed, timeline) = withLoop
            ? RunLoop(method.CreateDelegate<Func<long, long[], long>>(), n)
            : RunCalls(method.CreateDelegate<Func<long, long>>(), n, duration);

        var steadyNs = timeline.Count > 0 ? timeline[^1].AvgNs : coldNs;
        return new TieringResult(
            Variant: withLoop ? "loop" : "call",
            JitOptimized: JitOptimized,
            Instantiation: $"{method.Name}<{Describe(marker)}>",
            FirstCallUs: Math.Round(firstCallUs, 1),
            Tier0AvgNs: Math.Round(coldNs, 2),
            SteadyAvgNs: steadyNs,
            Speedup: steadyNs > 0 ? Math.Round(coldNs / steadyNs, 1) : 0,
            Count: count,
            DurationMs: Math.Round(elapsed.TotalMilliseconds, 1),
            JitMethodsCompiled: JitInfo.GetCompiledMethodCount(currentThread: false) - methodsBefore,
            JitTimeMs: Math.Round((JitInfo.GetCompilationTime(currentThread: false) - jitBefore).TotalMilliseconds, 2),
            Timeline: timeline);
    }

    private static (double FirstCallUs, double ColdNs, long Count, TimeSpan Elapsed, List<TieringPoint> Timeline) RunCalls(
        Func<long, long> work, long seed, TimeSpan duration)
    {
        var start = Stopwatch.GetTimestamp();
        var acc = work(seed);                                // call #1: includes the tier-0 JIT
        var firstCallUs = Stopwatch.GetElapsedTime(start).TotalMicroseconds;

        var t = Stopwatch.GetTimestamp();
        for (var i = 0; i < 29; i++) acc = work(acc);        // calls #2-#30: plain tier-0 code
        var tier0Ns = Stopwatch.GetElapsedTime(t).TotalNanoseconds / 29;

        // Then batches of 1 000 calls (timing each call would measure the Stopwatch, not the method).
        var bucket = duration / 40;
        var timeline = new List<TieringPoint>();
        long calls = 30, bucketCalls = 0;
        double bucketNs = 0;
        var bucketEnd = bucket;
        TimeSpan now;
        while ((now = Stopwatch.GetElapsedTime(start)) < duration)
        {
            t = Stopwatch.GetTimestamp();
            for (var i = 0; i < Batch; i++) acc = work(acc);
            bucketNs += Stopwatch.GetElapsedTime(t).TotalNanoseconds;
            calls += Batch;
            bucketCalls += Batch;
            if (now >= bucketEnd)
            {
                timeline.Add(new TieringPoint(Math.Round(now.TotalMilliseconds, 1), calls, Math.Round(bucketNs / bucketCalls, 2)));
                bucketNs = 0;
                bucketCalls = 0;
                bucketEnd += bucket;
            }
        }
        GC.KeepAlive(acc);
        return (firstCallUs, tier0Ns, calls, now, timeline);
    }

    private static (double FirstCallUs, double ColdNs, long Count, TimeSpan Elapsed, List<TieringPoint> Timeline) RunLoop(
        Func<long, long[], long> work, long seed)
    {
        var chunkEnds = new long[Chunks];
        var start = Stopwatch.GetTimestamp();
        GC.KeepAlive(work(seed, chunkEnds));
        var elapsed = Stopwatch.GetElapsedTime(start);

        // Chunk 0 also contains the JIT of the method itself: start the comparison at chunk 1.
        var timeline = new List<TieringPoint>(Chunks - 1);
        for (var c = 1; c < Chunks; c++)
            timeline.Add(new TieringPoint(
                Math.Round(Stopwatch.GetElapsedTime(start, chunkEnds[c]).TotalMilliseconds, 3),
                (c + 1L) * Chunk,
                Math.Round(Stopwatch.GetElapsedTime(chunkEnds[c - 1], chunkEnds[c]).TotalNanoseconds / Chunk, 2)));
        return (elapsed.TotalMicroseconds, timeline[0].AvgNs, (long)Chunks * Chunk, elapsed, timeline);
    }

    private static string Describe(Type t) =>
        t.IsGenericType ? $"({string.Join(", ", t.GetGenericArguments().Select(Describe))})" : t.Name;
}
