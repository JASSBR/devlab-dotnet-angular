using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

// Same namespace as the Aspire template on purpose: builder.AddServiceDefaults() is then
// available in Program.cs without any extra `using`.
namespace Microsoft.Extensions.Hosting;

/// <summary>
/// The Aspire "ServiceDefaults" pattern: one call gives every service of the solution the same
/// telemetry, health endpoints and service discovery. Works with or without the AppHost:
/// without OTEL_EXPORTER_OTLP_ENDPOINT, signals are produced but simply not exported.
/// </summary>
public static class Extensions
{
    /// <summary>Historic probe path: Railway (railway.json), deploy-azure.sh and the AppHost poll it.</summary>
    public const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";
    public const string LiveTag = "live";

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();

        // "http://api" → resolved from configuration (services__api__http__0=…) injected by the AppHost.
        builder.Services.AddServiceDiscovery();
        // The template also adds AddStandardResilienceHandler() here; resilience has its own lesson,
        // where each pipeline is configured explicitly instead of hidden in a default.
        builder.Services.ConfigureHttpClientDefaults(http => http.AddServiceDiscovery());

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        // Logs: ILogger stays the API; OpenTelemetry becomes one more logger provider.
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()     // http.server.request.duration, active requests…
                .AddHttpClientInstrumentation()     // http.client.request.duration
                .AddRuntimeInstrumentation())       // GC, thread pool, exceptions
            .WithTracing(tracing => tracing
                .AddSource(builder.Environment.ApplicationName)
                .AddAspNetCoreInstrumentation(o =>
                    // Probes hit every few seconds: tracing them would drown the real traffic.
                    o.Filter = ctx => !ctx.Request.Path.StartsWithSegments(HealthEndpointPath)
                                   && !ctx.Request.Path.StartsWithSegments(AlivenessEndpointPath))
                .AddHttpClientInstrumentation());

        builder.AddOpenTelemetryExporters();
        return builder;
    }

    private static void AddOpenTelemetryExporters(this IHostApplicationBuilder builder)
    {
        // Set by the AppHost (→ Aspire dashboard), or by hand to point at Jaeger / Grafana / a collector.
        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
            builder.Services.AddOpenTelemetry().UseOtlpExporter();

        // Azure Monitor is one more exporter: package Azure.Monitor.OpenTelemetry.AspNetCore, then
        // UseAzureMonitor() when APPLICATIONINSIGHTS_CONNECTION_STRING is set. Same signals, other backend.
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        // "Is the process responsive?" — deliberately checks nothing external (see the health-checks lesson).
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy("The process answers."), [LiveTag]);
        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // The template maps these in Development only. Here they are probes in production too, so
        // they only return "Healthy"/"Unhealthy" as plain text — details stay on /health/ready.
        // /health keeps its historic meaning (liveness): a failing database must not get the
        // container restarted by the platform — that is readiness's job.
        var liveness = new HealthCheckOptions { Predicate = r => r.Tags.Contains(LiveTag) };
        app.MapHealthChecks(HealthEndpointPath, liveness);
        app.MapHealthChecks(AlivenessEndpointPath, liveness);
        return app;
    }
}
