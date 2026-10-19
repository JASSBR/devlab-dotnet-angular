using System.Collections.Concurrent;
using System.Diagnostics;
using Polly.CircuitBreaker;

namespace DevLab.Api.Features.Resilience;

public record AttemptReport(int Number, string Outcome, long DurationMs, long? RetryDelayMs);
public record ResilienceEvent(DateTimeOffset At, string Pipeline, string Kind, string Detail);

/// <summary>
/// Collects the attempts of ONE logical call. Stored in an AsyncLocal because Polly callbacks
/// (OnRetry, OnOpened…) and the inner handler run in the async flow of that call — the cheapest
/// way to correlate them without threading a context object through every layer.
/// </summary>
public sealed class CallRecorder
{
    private static readonly AsyncLocal<CallRecorder?> CurrentSlot = new();
    private readonly List<AttemptReport> _attempts = [];

    public static CallRecorder? Current { get => CurrentSlot.Value; set => CurrentSlot.Value = value; }

    public IReadOnlyList<AttemptReport> Attempts { get { lock (_attempts) return [.. _attempts]; } }

    public void AddAttempt(string outcome, long durationMs)
    {
        lock (_attempts) _attempts.Add(new AttemptReport(_attempts.Count + 1, outcome, durationMs, null));
    }

    /// <summary>Called from OnRetry: the attempt that just failed is followed by this delay.</summary>
    public void SetRetryDelay(TimeSpan delay, string outcome)
    {
        lock (_attempts)
        {
            // The circuit breaker rejects BEFORE the inner handler: no attempt was recorded for it.
            if (_attempts.Count == 0 || _attempts[^1].RetryDelayMs is not null)
                _attempts.Add(new AttemptReport(_attempts.Count + 1, outcome, 0, null));
            _attempts[^1] = _attempts[^1] with { RetryDelayMs = (long)delay.TotalMilliseconds };
        }
    }
}

/// <summary>
/// Innermost handler (closest to the network): sees every single attempt the pipeline makes,
/// including the ones cancelled by the attempt timeout.
/// </summary>
public sealed class AttemptRecorderHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var response = await base.SendAsync(request, cancellationToken);
            if (cancellationToken.IsCancellationRequested)
            {
                // SocketsHttpHandler throws when cancelled; the in-memory TestServer handler instead
                // returns the server's 499. Normalise so timeouts behave the same in tests and prod.
                response.Dispose();
                cancellationToken.ThrowIfCancellationRequested();
            }
            CallRecorder.Current?.AddAttempt(((int)response.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture), sw.ElapsedMilliseconds);
            return response;
        }
        catch (OperationCanceledException)
        {
            CallRecorder.Current?.AddAttempt("timeout", sw.ElapsedMilliseconds);
            throw;
        }
        catch (HttpRequestException)
        {
            CallRecorder.Current?.AddAttempt("network-error", sw.ElapsedMilliseconds);
            throw;
        }
    }
}

/// <summary>Recent pipeline events (retries, circuit transitions) for the demo timeline. Bounded.</summary>
public sealed class ResilienceEventLog
{
    private const int Capacity = 100;
    private readonly ConcurrentQueue<ResilienceEvent> _events = new();

    public IReadOnlyList<ResilienceEvent> Recent => [.. _events.Reverse()];

    public void Add(string pipeline, string kind, string detail)
    {
        _events.Enqueue(new ResilienceEvent(DateTimeOffset.UtcNow, pipeline, kind, detail));
        while (_events.Count > Capacity) _events.TryDequeue(out _);
    }

    public void Clear() => _events.Clear();
}

/// <summary>
/// One state provider + manual control per circuit breaker. They are per host (a singleton),
/// never static: Polly refuses to attach the same provider to two breakers.
/// </summary>
public sealed class ResilienceCircuits
{
    public CircuitBreakerStateProvider StandardState { get; } = new();
    public CircuitBreakerManualControl StandardControl { get; } = new();
    public CircuitBreakerStateProvider CustomState { get; } = new();
    public CircuitBreakerManualControl CustomControl { get; } = new();

    public IReadOnlyDictionary<string, string> States => new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["standard"] = StandardState.CircuitState.ToString(),
        ["custom"] = CustomState.CircuitState.ToString(),
    };

    public async Task CloseAllAsync()
    {
        await StandardControl.CloseAsync();
        await CustomControl.CloseAsync();
    }
}
