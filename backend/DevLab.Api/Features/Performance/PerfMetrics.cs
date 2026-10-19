using System.Diagnostics.Metrics;

namespace DevLab.Api.Features.Performance;

/// <summary>
/// Custom metrics on the "DevLab" Meter. Nothing to export: <c>dotnet-counters monitor
/// --counters DevLab,System.Runtime -n DevLab.Api</c> attaches to the process and reads them live
/// (EventPipe). The same instruments would flow to OpenTelemetry / Prometheus unchanged.
/// </summary>
public sealed class PerfMetrics
{
    public const string MeterName = "DevLab";

    private readonly Counter<long> _runs;
    private readonly Histogram<double> _duration;
    private readonly Counter<long> _allocated;

    // IMeterFactory (not `new Meter(...)`): the meter is owned and disposed by the DI container,
    // and each WebApplicationFactory in the tests gets its own instance.
    public PerfMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _runs = meter.CreateCounter<long>("devlab.perf.demo.runs", unit: "{run}", description: "Performance demo executions");
        _duration = meter.CreateHistogram<double>("devlab.perf.demo.duration", unit: "ms", description: "Duration of a performance demo run");
        _allocated = meter.CreateCounter<long>("devlab.perf.demo.allocated", unit: "By", description: "Bytes allocated by performance demos");
    }

    public void Record(string demo, TimeSpan elapsed, long allocatedBytes)
    {
        var tag = new KeyValuePair<string, object?>("demo", demo);
        _runs.Add(1, tag);
        _duration.Record(elapsed.TotalMilliseconds, tag);
        _allocated.Add(allocatedBytes, tag);
    }
}
