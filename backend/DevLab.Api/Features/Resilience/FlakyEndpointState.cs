namespace DevLab.Api.Features.Resilience;

/// <param name="FailureRate">0..1 — probability that a call answers 500/503.</param>
/// <param name="LatencyMs">Delay before answering (slow dependency → attempt timeouts).</param>
/// <param name="FailNext">Deterministic: the next N calls fail whatever the rate (tests, "transient blip").</param>
public record FlakyConfig(double FailureRate, int LatencyMs, int FailNext);

/// <summary>
/// The behaviour of the simulated dependency. Singleton shared by every request, so
/// writes go through a lock and every input is clamped: a public demo must never
/// let a visitor configure a 10-minute delay.
/// </summary>
public sealed class FlakyEndpointState
{
    public const int MaxLatencyMs = 3000;
    public const int MaxFailNext = 20;

    private readonly Lock _gate = new();
    private FlakyConfig _config = Default;
    private long _calls;

    public static FlakyConfig Default => new(FailureRate: 0.3, LatencyMs: 50, FailNext: 0);

    public FlakyConfig Config { get { lock (_gate) return _config; } }
    public long Calls => Interlocked.Read(ref _calls);

    public FlakyConfig Update(FlakyConfig requested)
    {
        var safe = new FlakyConfig(
            double.IsFinite(requested.FailureRate) ? Math.Clamp(requested.FailureRate, 0, 1) : 0,
            Math.Clamp(requested.LatencyMs, 0, MaxLatencyMs),
            Math.Clamp(requested.FailNext, 0, MaxFailNext));
        lock (_gate) _config = safe;
        return safe;
    }

    public void Reset()
    {
        lock (_gate) _config = Default;
        Interlocked.Exchange(ref _calls, 0);
    }

    /// <summary>Decides the fate of one call: (latency, should it fail?).</summary>
    public (int LatencyMs, bool Fail) NextCall()
    {
        Interlocked.Increment(ref _calls);
        lock (_gate)
        {
            if (_config.FailNext > 0)
            {
                _config = _config with { FailNext = _config.FailNext - 1 };
                return (_config.LatencyMs, true);
            }
            // Not security-sensitive: a coin flip for a demo.
#pragma warning disable CA5394, S2245
            return (_config.LatencyMs, Random.Shared.NextDouble() < _config.FailureRate);
#pragma warning restore CA5394, S2245
        }
    }
}
