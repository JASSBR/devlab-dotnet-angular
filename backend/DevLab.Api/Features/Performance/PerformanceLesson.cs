using System.Diagnostics;
using System.Runtime;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Http.HttpResults;

namespace DevLab.Api.Features.Performance;

public record AllocationResult(
    string Mode, int Iterations, long AllocatedBytes, double BytesPerIteration, double ElapsedMs,
    int Gen0Collections, int Gen1Collections, int Gen2Collections, long Checksum);

public record GenerationInfo(string Name, long SizeAfterBytes, long FragmentationAfterBytes);

public record GcInfo(
    string Mode, bool Concurrent, string LatencyMode, bool DatasEnabled, long LargeObjectThresholdBytes,
    long HeapSizeBytes, long FragmentedBytes, long CommittedBytes, double PauseTimePercentage,
    int Gen0Collections, int Gen1Collections, int Gen2Collections, IReadOnlyList<GenerationInfo> Generations);

public record RuntimeSwitch(string Name, bool Enabled, string Source);

public record JitInfoDto(
    long CompiledMethods, long CompiledIlBytes, double CompilationTimeMs,
    bool DynamicCodeCompiled, bool Optimized, IReadOnlyList<RuntimeSwitch> Switches);

public record RuntimeInfo(
    string Framework, string Os, string Architecture, int ProcessorCount,
    long TotalAllocatedBytes, long WorkingSetBytes, GcInfo Gc, JitInfoDto Jit);

public static class PerformanceLesson
{
    private const int MaxIterations = 100_000;

    // static lambdas: no closure, cached delegate → selecting a workload allocates nothing itself.
    private static readonly Dictionary<string, Func<int, long>> Workloads = new(StringComparer.Ordinal)
    {
        ["substring"] = static n => Repeat(n, static () => AllocationWorkloads.ParseWithSubstring(AllocationWorkloads.CsvLine)),
        ["span"] = static n => Repeat(n, static () => AllocationWorkloads.ParseWithSpan(AllocationWorkloads.CsvLine)),
        ["array"] = static n => Repeat(n, static () => AllocationWorkloads.WithNewArray(AllocationWorkloads.BufferSize)),
        ["pool"] = static n => Repeat(n, static () => AllocationWorkloads.WithPooledArray(AllocationWorkloads.BufferSize)),
        ["loh"] = static n => Repeat(n, static () => AllocationWorkloads.WithNewArray(AllocationWorkloads.LargeBufferSize)),
    };

    public static IServiceCollection AddPerformanceLesson(this IServiceCollection services)
    {
        services.AddMetrics();
        services.AddSingleton<PerfMetrics>();
        return services;
    }

    public static IEndpointRouteBuilder MapPerformanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/perf").WithTags("Performance");

        // 1. Same work, two implementations: what does the GC see?
        group.MapGet("/allocations", Results<Ok<AllocationResult>, ValidationProblem> (string mode, PerfMetrics metrics, int iterations = 10_000) =>
        {
            if (!Workloads.TryGetValue(mode, out var workload))
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["mode"] = [$"Expected one of: {string.Join(", ", Workloads.Keys)}."] });
            if (iterations is < 1 or > MaxIterations)
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["iterations"] = [$"Must be between 1 and {MaxIterations}."] });

            // The handler is synchronous on purpose: the per-thread allocation counter only means
            // something if the whole workload runs on this thread (no await in between).
            var gen0 = GC.CollectionCount(0);
            var gen1 = GC.CollectionCount(1);
            var gen2 = GC.CollectionCount(2);
            var allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
            var start = Stopwatch.GetTimestamp();

            var checksum = workload(iterations);

            var elapsed = Stopwatch.GetElapsedTime(start);
            var allocated = GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
            metrics.Record(mode, elapsed, allocated);

            return TypedResults.Ok(new AllocationResult(
                mode, iterations, allocated, Math.Round((double)allocated / iterations, 1), Math.Round(elapsed.TotalMilliseconds, 3),
                GC.CollectionCount(0) - gen0, GC.CollectionCount(1) - gen1, GC.CollectionCount(2) - gen2, checksum));
        });

        // 2. What runtime are we on, and what has the GC been doing?
        group.MapGet("/runtime", () => TypedResults.Ok(DescribeRuntime()));

        // 3. Tiered JIT: first call vs the following ones, on a method nobody has called yet.
        //    loop=true picks a method with a loop, to see On-Stack Replacement at work instead.
        group.MapGet("/tiering", Results<Ok<TieringResult>, ValidationProblem> (PerfMetrics metrics, int durationMs = 1000, bool loop = false) =>
        {
            if (durationMs is < 50 or > 3000)
                return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["durationMs"] = ["Must be between 50 and 3000."] });

            var result = TieringDemo.Run(TimeSpan.FromMilliseconds(durationMs), loop);
            metrics.Record("tiering", TimeSpan.FromMilliseconds(result.DurationMs), 0);
            return TypedResults.Ok(result);
        });

        return app;
    }

    private static long Repeat(int n, Func<long> body)
    {
        long checksum = 0;
        for (var i = 0; i < n; i++) checksum += body();
        return checksum;
    }

    private static RuntimeInfo DescribeRuntime()
    {
        var gc = GC.GetGCMemoryInfo();
        var config = GC.GetConfigurationVariables();
        string[] generationNames = ["gen0", "gen1", "gen2", "LOH", "POH"];
        var generations = gc.GenerationInfo.ToArray()
            .Select((g, i) => new GenerationInfo(generationNames[i], g.SizeAfterBytes, g.FragmentationAfterBytes))
            .ToList();

        var gcInfo = new GcInfo(
            Mode: GCSettings.IsServerGC ? "Server" : "Workstation",
            Concurrent: config.TryGetValue("ConcurrentGC", out var concurrent) && concurrent is true,
            LatencyMode: GCSettings.LatencyMode.ToString(),
            // DATAS (dynamic heap count) is on by default since .NET 9, but only Server GC uses it.
            DatasEnabled: GCSettings.IsServerGC && config.TryGetValue("GCDynamicAdaptationMode", out var datas) && Convert.ToInt64(datas, System.Globalization.CultureInfo.InvariantCulture) == 1,
            LargeObjectThresholdBytes: config.TryGetValue("LOHThreshold", out var loh) ? Convert.ToInt64(loh, System.Globalization.CultureInfo.InvariantCulture) : 85_000,
            HeapSizeBytes: gc.HeapSizeBytes,
            FragmentedBytes: gc.FragmentedBytes,
            CommittedBytes: gc.TotalCommittedBytes,
            PauseTimePercentage: gc.PauseTimePercentage,
            Gen0Collections: GC.CollectionCount(0),
            Gen1Collections: GC.CollectionCount(1),
            Gen2Collections: GC.CollectionCount(2),
            Generations: generations);

        var jit = new JitInfoDto(
            CompiledMethods: JitInfo.GetCompiledMethodCount(currentThread: false),
            CompiledIlBytes: JitInfo.GetCompiledILBytes(currentThread: false),
            CompilationTimeMs: Math.Round(JitInfo.GetCompilationTime(currentThread: false).TotalMilliseconds, 1),
            DynamicCodeCompiled: RuntimeFeature.IsDynamicCodeCompiled,
            Optimized: TieringDemo.JitOptimized,
            Switches:
            [
                Switch("System.Runtime.TieredCompilation", "DOTNET_TieredCompilation"),
                Switch("System.Runtime.TieredCompilation.QuickJitForLoops", "DOTNET_TC_QuickJitForLoops"),
                Switch("System.Runtime.TieredPGO", "DOTNET_TieredPGO"),
                Switch("System.Runtime.ReadyToRun", "DOTNET_ReadyToRun"),
            ]);

        return new RuntimeInfo(
            RuntimeInformation.FrameworkDescription,
            RuntimeInformation.OSDescription,
            RuntimeInformation.ProcessArchitecture.ToString(),
            Environment.ProcessorCount,
            GC.GetTotalAllocatedBytes(),
            Environment.WorkingSet,
            gcInfo,
            jit);
    }

    // Precedence used by the runtime: environment variable > runtimeconfig.json (csproj property) > default.
    // All four knobs default to ON in .NET 10.
    private static RuntimeSwitch Switch(string name, string envVar)
    {
        var env = Environment.GetEnvironmentVariable(envVar);
        if (env is "0" or "1") return new RuntimeSwitch(name, env == "1", $"env {envVar}");
        if (AppContext.TryGetSwitch(name, out var enabled)) return new RuntimeSwitch(name, enabled, "runtimeconfig.json");
        return new RuntimeSwitch(name, true, "défaut");
    }
}
