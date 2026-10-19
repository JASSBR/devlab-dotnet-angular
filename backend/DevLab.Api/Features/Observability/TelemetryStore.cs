using System.Diagnostics;
using System.Diagnostics.Metrics;
using OpenTelemetry;
using OpenTelemetry.Logs;

namespace DevLab.Api.Features.Observability;

public record SpanEvent(string Name, DateTime Timestamp, IReadOnlyDictionary<string, string?> Tags);

public record SpanRecord(
    string TraceId, string SpanId, string? ParentSpanId, string Name, string Source, string Kind,
    DateTime StartUtc, double DurationMs, string Status, string? StatusDescription,
    IReadOnlyDictionary<string, string?> Tags, IReadOnlyList<SpanEvent> Events);

public record LogLine(
    DateTime Timestamp, string Level, string Category, string Message,
    string? TraceId, string? SpanId, IReadOnlyDictionary<string, string?> Scopes);

public record TraceView(string TraceId, string Root, DateTime StartUtc, double DurationMs, bool HasError,
    IReadOnlyList<SpanRecord> Spans, IReadOnlyList<LogLine> Logs);

/// <summary>
/// The in-app "backend" of the trace viewer: two bounded ring buffers (spans, logs).
/// A real system exports to Jaeger / Tempo / the Aspire dashboard; this one keeps the last
/// few hundred items in memory so the lesson works on a free single-instance deployment.
/// </summary>
public sealed class TelemetryStore
{
    private const int MaxSpans = 400;
    private const int MaxLogs = 400;
    private readonly Lock _gate = new();
    private readonly Queue<SpanRecord> _spans = new();
    private readonly Queue<LogLine> _logs = new();

    public void Add(SpanRecord span)
    {
        lock (_gate)
        {
            _spans.Enqueue(span);
            while (_spans.Count > MaxSpans) _spans.Dequeue();
        }
    }

    public void Add(LogLine log)
    {
        lock (_gate)
        {
            _logs.Enqueue(log);
            while (_logs.Count > MaxLogs) _logs.Dequeue();
        }
    }

    /// <summary>Groups spans by TraceId (what a trace backend does) and joins the logs on the same id.</summary>
    public IReadOnlyList<TraceView> RecentTraces(int limit, string? traceId = null)
    {
        SpanRecord[] spans;
        LogLine[] logs;
        lock (_gate)
        {
            spans = [.. _spans];
            logs = [.. _logs];
        }

        return [.. spans
            .Where(s => traceId is null || string.Equals(s.TraceId, traceId, StringComparison.Ordinal))
            .GroupBy(s => s.TraceId)
            .Select(g =>
            {
                var ordered = g.OrderBy(s => s.StartUtc).ToList();
                var start = ordered[0].StartUtc;
                var end = ordered.Max(s => s.StartUtc.AddMilliseconds(s.DurationMs));
                // The root is the span whose parent is not in this process's buffer (the browser, or nothing).
                var ids = ordered.Select(s => s.SpanId).ToHashSet(StringComparer.Ordinal);
                var root = ordered.FirstOrDefault(s => s.ParentSpanId is null || !ids.Contains(s.ParentSpanId)) ?? ordered[0];
                return new TraceView(g.Key, root.Name, start, (end - start).TotalMilliseconds,
                    ordered.Exists(s => s.Status == "Error"),
                    ordered,
                    [.. logs.Where(l => l.TraceId == g.Key).OrderBy(l => l.Timestamp)]);
            })
            .OrderByDescending(t => t.StartUtc)
            .Take(limit)];
    }
}

/// <summary>
/// An OpenTelemetry processor sees every span when it ENDS (OnEnd). Exporters are processors
/// too (BatchExportProcessor → OTLP); this one just copies the span into the in-memory store.
/// Only sampled spans (Recorded = true) reach it: that is where sampling shows up.
/// </summary>
public sealed class InMemorySpanProcessor(TelemetryStore store) : BaseProcessor<Activity>
{
    // The viewer polls these: recording them would push the interesting traces out of the buffer.
    private static readonly string[] IgnoredPaths = ["/api/observability/traces", "/api/observability/metrics", "/api/source"];

    public override void OnEnd(Activity data)
    {
        var path = data.GetTagItem("url.path") as string;
        if (path is not null && IgnoredPaths.Any(p => path.StartsWith(p, StringComparison.Ordinal))) return;

        store.Add(new SpanRecord(
            data.TraceId.ToHexString(),
            data.SpanId.ToHexString(),
            data.ParentSpanId == default ? null : data.ParentSpanId.ToHexString(),
            data.DisplayName,
            data.Source.Name,
            data.Kind.ToString(),
            data.StartTimeUtc,
            data.Duration.TotalMilliseconds,
            data.Status.ToString(),
            data.StatusDescription,
            data.TagObjects.ToDictionary(t => t.Key, t => t.Value?.ToString(), StringComparer.Ordinal),
            [.. data.Events.Select(e => new SpanEvent(e.Name, e.Timestamp.UtcDateTime,
                e.Tags.ToDictionary(t => t.Key, t => t.Value?.ToString(), StringComparer.Ordinal)))]));
    }
}

/// <summary>
/// Same idea for logs: every ILogger call becomes a LogRecord carrying the TraceId/SpanId of the
/// Activity that was current when it was written — the log ↔ trace correlation, for free.
/// </summary>
public sealed class InMemoryLogProcessor(TelemetryStore store) : BaseProcessor<LogRecord>
{
    public override void OnEnd(LogRecord data)
    {
        // Only keep logs that belong to a trace and come from the app (not Kestrel/EF chatter).
        if (data.TraceId == default || data.CategoryName?.StartsWith("DevLab", StringComparison.Ordinal) != true) return;

        var scopes = new Dictionary<string, string?>(StringComparer.Ordinal);
        data.ForEachScope((scope, state) =>
        {
            // Hosting's own scope repeats SpanId/TraceId/ParentId: already first-class fields of the record.
            foreach (var kv in scope)
                if (kv.Key is not ("SpanId" or "TraceId" or "ParentId")) state[kv.Key] = kv.Value?.ToString();
        }, scopes);

        store.Add(new LogLine(
            data.Timestamp,
            data.LogLevel.ToString(),
            data.CategoryName,
            data.FormattedMessage ?? data.Body ?? "",
            data.TraceId.ToHexString(),
            data.SpanId.ToHexString(),
            scopes));
    }
}

/// <summary>
/// Custom metrics, the .NET 8+ way: the Meter comes from IMeterFactory (one per DI container,
/// testable), instruments are created once, tags carry the dimensions (outcome=success…).
/// </summary>
public sealed class CheckoutMetrics
{
    public const string MeterName = "DevLab.Observability";
    private readonly Counter<long> _checkouts;
    private readonly Histogram<double> _duration;

    public CheckoutMetrics(IMeterFactory meterFactory)
    {
        Meter = meterFactory.Create(MeterName, "1.0.0");
        _checkouts = Meter.CreateCounter<long>("devlab.checkout.count", "{checkout}", "Checkouts processed, by outcome.");
        _duration = Meter.CreateHistogram<double>("devlab.checkout.duration", "ms", "End-to-end checkout duration.");
    }

    public Meter Meter { get; }

    public void Record(string outcome, double elapsedMs)
    {
        var tag = new KeyValuePair<string, object?>("outcome", outcome);
        _checkouts.Add(1, tag);
        _duration.Record(elapsedMs, tag);
    }
}

public record MetricPoint(string Instrument, string Outcome, long Count, double Sum, double Min, double Max);

/// <summary>
/// A MeterListener is what an exporter uses under the hood: subscribe to instruments, receive
/// every measurement, aggregate. Here: count / sum / min / max per (instrument, outcome).
/// </summary>
public sealed class InAppMetricsListener : IDisposable
{
    private readonly MeterListener _listener = new();
    private readonly Lock _gate = new();
    private readonly Dictionary<(string Instrument, string Outcome), MetricPoint> _points = [];

    public InAppMetricsListener(CheckoutMetrics metrics)
    {
        _listener.InstrumentPublished = (instrument, listener) =>
        {
            // ReferenceEquals: only THIS container's meter (tests run several apps in one process).
            if (ReferenceEquals(instrument.Meter, metrics.Meter)) listener.EnableMeasurementEvents(instrument);
        };
        _listener.SetMeasurementEventCallback<long>((i, v, tags, _) => Accumulate(i.Name, v, tags));
        _listener.SetMeasurementEventCallback<double>((i, v, tags, _) => Accumulate(i.Name, v, tags));
        _listener.Start();
    }

    public IReadOnlyList<MetricPoint> Snapshot()
    {
        lock (_gate) return [.. _points.Values.OrderBy(p => p.Instrument, StringComparer.Ordinal).ThenBy(p => p.Outcome, StringComparer.Ordinal)];
    }

    private void Accumulate(string instrument, double value, ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        var outcome = "";
        foreach (var t in tags) if (t.Key == "outcome") outcome = t.Value?.ToString() ?? "";

        lock (_gate)
        {
            var key = (instrument, outcome);
            _points[key] = _points.TryGetValue(key, out var p)
                ? p with { Count = p.Count + 1, Sum = p.Sum + value, Min = Math.Min(p.Min, value), Max = Math.Max(p.Max, value) }
                : new MetricPoint(instrument, outcome, 1, value, value, value);
        }
    }

    public void Dispose() => _listener.Dispose();
}
