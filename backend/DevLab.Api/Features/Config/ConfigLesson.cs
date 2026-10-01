using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

namespace DevLab.Api.Features.Config;

/// <summary>
/// POCO bound to the "Lab" section. Sources are layered: appsettings.json ←
/// appsettings.{Env}.json ← user-secrets ← environment variables (Lab__MaxPageSize=20) ← CLI args.
/// </summary>
public sealed class LabOptions
{
    public const string Section = "Lab";

    [Required, MinLength(3)]
    public string Name { get; set; } = "";

    [Range(1, 200)]
    public int MaxPageSize { get; set; } = 20;

    public Dictionary<string, bool> FeatureFlags { get; set; } = new();
}

public static class ConfigLesson
{
    public static IServiceCollection AddLabOptions(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<LabOptions>()
            .Bind(config.GetSection(LabOptions.Section))
            .ValidateDataAnnotations()
            .ValidateOnStart();     // fail fast at boot instead of at first use

        services.AddSingleton(TimeProvider.System); // injectable clock → testable time
        return services;
    }

    public static IEndpointRouteBuilder MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // IOptions      : singleton snapshot, read once at startup.
        // IOptionsSnapshot: recomputed per request (scoped) → sees appsettings edits.
        // IOptionsMonitor : singleton + OnChange callback → for background services.
        app.MapGet("/api/config", (IOptions<LabOptions> opt, IOptionsSnapshot<LabOptions> snap,
                                   IOptionsMonitor<LabOptions> mon, IHostEnvironment env, IConfiguration raw) =>
            TypedResults.Ok(new
            {
                environment = env.EnvironmentName,
                options = opt.Value,
                snapshot = snap.Value,
                monitor = mon.CurrentValue,
                rawKeyLookup = raw["Lab:FeatureFlags:Realtime"],
                jwtKeyIsSet = !string.IsNullOrEmpty(raw["Jwt:SigningKey"]),
                tip = "Edit appsettings.Development.json → 'Lab:Name' while running: snapshot/monitor change, options does not."
            }))
        .WithTags("Config");

        return app;
    }
}
