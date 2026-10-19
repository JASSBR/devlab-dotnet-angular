using System.Text.Json;
using DevLab.Api.Features.Products;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace DevLab.Api.Features.HealthChecks;

/// <summary>
/// Three questions, three probes (Kubernetes / Azure Container Apps vocabulary):
///  - startup   : "have you finished booting?"    → until yes, the other probes are not even asked;
///  - liveness  : "are you stuck?"                → no = the platform RESTARTS the container;
///  - readiness : "can you serve traffic now?"    → no = the platform stops ROUTING to this replica.
/// Tags decide which check answers which question.
/// </summary>
public static class HealthChecksLesson
{
    public const string ReadyTag = "ready";
    public const string StartupTag = "startup";

    public static IServiceCollection AddHealthChecksLesson(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<DependencySimulator>();
        services.AddSingleton<StartupGate>();
        services.AddSingleton<LastReportPublisher>();
        services.AddSingleton<IHealthCheckPublisher>(sp => sp.GetRequiredService<LastReportPublisher>());
        services.Configure<HealthCheckPublisherOptions>(o =>
        {
            o.Delay = TimeSpan.FromSeconds(5);   // first run after startup
            o.Period = TimeSpan.FromSeconds(15); // then every 15 s, in the background
        });

        // Added to the same registry as the "self" check of AddServiceDefaults().
        services.AddHealthChecks()
            .AddCheck<StartupHealthCheck>("startup", tags: [StartupTag])
            // EF Core check: opens a connection (CanConnectAsync). Package Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore.
            .AddDbContextCheck<AppDbContext>("database", tags: [ReadyTag])
            .AddCheck<PaymentGatewayHealthCheck>("payment-gateway", tags: [ReadyTag])
            .AddCheck<MemoryHealthCheck>("memory", tags: [ReadyTag]);
        return services;
    }

    public static IEndpointRouteBuilder MapHealthChecksLessonEndpoints(this IEndpointRouteBuilder app)
    {
        var gate = app.ServiceProvider.GetRequiredService<StartupGate>();
        app.ServiceProvider.GetRequiredService<IHostApplicationLifetime>().ApplicationStarted.Register(gate.MarkStarted);

        // Same checks registry, filtered by tag. Unhealthy → 503; Healthy AND Degraded → 200
        // (Degraded = "works, but look at me": a probe must not pull a slow-but-alive replica).
        (string Probe, string Tag)[] probes = [("live", Microsoft.Extensions.Hosting.Extensions.LiveTag), ("ready", ReadyTag), ("startup", StartupTag)];
        foreach (var (probe, tag) in probes)
        {
            app.MapHealthChecks($"/health/{probe}", Options(r => r.Tags.Contains(tag)));
            // Same probe under /api: the only prefix the Angular dev proxy and the Vercel rewrite forward
            // to the API, so the browser demo can reach it. The platform calls /health/* on the container.
            app.MapHealthChecks($"/api/health-lab/probes/{probe}", Options(r => r.Tags.Contains(tag)));
        }

        var group = app.MapGroup("/api/health-lab").WithTags("Health checks");

        // Demo switch: break the fake dependency for 60 s at most, so a deployed instance can't stay broken.
        group.MapPost("/dependency/{state}", (string state, DependencySimulator dependency) =>
            Enum.TryParse<HealthStatus>(state, ignoreCase: true, out var status)
                ? Results.Ok(dependency.Set(status, TimeSpan.FromSeconds(60)))
                : Results.BadRequest(new { error = "state must be Healthy, Degraded or Unhealthy" }));
        group.MapGet("/dependency", (DependencySimulator dependency) => TypedResults.Ok(dependency.Current()));

        // What the background publisher saw last (it runs every check, every Period).
        group.MapGet("/last-published", (LastReportPublisher publisher) =>
            publisher.Last is { } last ? Results.Ok(last) : Results.NoContent());

        return app;
    }

    private static HealthCheckOptions Options(Func<HealthCheckRegistration, bool> predicate) => new()
    {
        Predicate = predicate,
        ResponseWriter = WriteJsonAsync,
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    /// <summary>The default writer prints one word ("Healthy"); this one explains WHY, check by check.</summary>
    public static Task WriteJsonAsync(HttpContext ctx, HealthReport report)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        return ctx.Response.WriteAsync(JsonSerializer.Serialize(HealthReportDto.From(report), Json), ctx.RequestAborted);
    }
}

public record HealthEntryDto(string Name, string Status, double DurationMs, string? Description, IReadOnlyList<string> Tags,
    IReadOnlyDictionary<string, object> Data, string? Error);

public record HealthReportDto(string Status, double TotalDurationMs, DateTimeOffset CheckedAt, IReadOnlyList<HealthEntryDto> Checks)
{
    public static HealthReportDto From(HealthReport report) => new(
        report.Status.ToString(),
        report.TotalDuration.TotalMilliseconds,
        DateTimeOffset.UtcNow,
        [.. report.Entries.Select(e => new HealthEntryDto(
            e.Key, e.Value.Status.ToString(), e.Value.Duration.TotalMilliseconds, e.Value.Description,
            [.. e.Value.Tags], e.Value.Data, e.Value.Exception?.Message))]);
}

public record DependencyState(string Status, int? ResetsInSeconds);

/// <summary>An in-memory stand-in for an external dependency (payment provider) we can break on demand.</summary>
public sealed class DependencySimulator(TimeProvider clock)
{
    private readonly Lock _gate = new();
    private HealthStatus _status = HealthStatus.Healthy;
    private DateTimeOffset _resetAt = DateTimeOffset.MinValue;

    public DependencyState Set(HealthStatus status, TimeSpan duration)
    {
        lock (_gate)
        {
            _status = status;
            _resetAt = clock.GetUtcNow() + duration;
        }
        return Current();
    }

    public DependencyState Current()
    {
        var (status, resetAt) = Read();
        return status == HealthStatus.Healthy
            ? new DependencyState(nameof(HealthStatus.Healthy), null)
            : new DependencyState(status.ToString(), (int)Math.Ceiling((resetAt - clock.GetUtcNow()).TotalSeconds));
    }

    public HealthStatus CurrentStatus() => Read().Status;

    private (HealthStatus Status, DateTimeOffset ResetAt) Read()
    {
        lock (_gate)
        {
            // Auto-reset: the flag expires by itself, no timer to manage.
            if (_status != HealthStatus.Healthy && clock.GetUtcNow() >= _resetAt) _status = HealthStatus.Healthy;
            return (_status, _resetAt);
        }
    }
}

public sealed class PaymentGatewayHealthCheck(DependencySimulator dependency) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        // A real check would call the provider's status endpoint with a short timeout.
        var state = dependency.Current();
        var data = new Dictionary<string, object> { ["resetsInSeconds"] = state.ResetsInSeconds ?? 0 };
        return Task.FromResult(dependency.CurrentStatus() switch
        {
            HealthStatus.Unhealthy => HealthCheckResult.Unhealthy("Payment provider unreachable (simulated).", data: data),
            HealthStatus.Degraded => HealthCheckResult.Degraded("Payment provider slow: p95 > 2 s (simulated).", data: data),
            _ => HealthCheckResult.Healthy("Payment provider answers.", data),
        });
    }
}

/// <summary>Degraded, not Unhealthy: high memory deserves an alert, not a restart loop.</summary>
public sealed class MemoryHealthCheck : IHealthCheck
{
    private const long DegradedThresholdBytes = 512L * 1024 * 1024;

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var allocated = GC.GetTotalMemory(forceFullCollection: false);
        var data = new Dictionary<string, object>
        {
            ["allocatedMb"] = allocated / 1024 / 1024,
            ["thresholdMb"] = DegradedThresholdBytes / 1024 / 1024,
            ["gen2Collections"] = GC.CollectionCount(2),
        };
        return Task.FromResult(allocated < DegradedThresholdBytes
            ? HealthCheckResult.Healthy($"{allocated / 1024 / 1024} MB managed heap.", data)
            : HealthCheckResult.Degraded($"Managed heap above {DegradedThresholdBytes / 1024 / 1024} MB.", data: data));
    }
}

/// <summary>Flipped once the host has started (migrations/seeding done, Kestrel listening).</summary>
public sealed class StartupGate
{
    private volatile bool _started;
    public bool Started => _started;
    public void MarkStarted() => _started = true;
}

public sealed class StartupHealthCheck(StartupGate gate) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default) =>
        Task.FromResult(gate.Started
            ? HealthCheckResult.Healthy("Host started.")
            : HealthCheckResult.Unhealthy("Still starting."));
}

/// <summary>
/// IHealthCheckPublisher: the push side of health checks. A hosted service runs every check
/// periodically and hands the report to each publisher — send it to a monitoring system,
/// or (here) log transitions and keep the last one.
/// </summary>
public sealed class LastReportPublisher(ILogger<LastReportPublisher> logger) : IHealthCheckPublisher
{
    public HealthReportDto? Last { get; private set; }

    public Task PublishAsync(HealthReport report, CancellationToken cancellationToken)
    {
        if (Last is not null && Last.Status != report.Status.ToString())
            logger.LogWarning("Health changed from {Previous} to {Current}", Last.Status, report.Status);
        Last = HealthReportDto.From(report);
        return Task.CompletedTask;
    }
}
