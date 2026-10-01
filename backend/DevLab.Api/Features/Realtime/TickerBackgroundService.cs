using Microsoft.AspNetCore.SignalR;

namespace DevLab.Api.Features.Realtime;

/// <summary>
/// IHostedService via BackgroundService: starts with the app, loops until shutdown.
/// It is a Singleton, so it must NOT inject Scoped services directly (create a scope instead).
/// Here it pushes a tick to every SignalR client every 2 seconds.
/// </summary>
public sealed class TickerBackgroundService(IHubContext<LiveHub, ILiveClient> hub, RequestCounter counter,
    ILogger<TickerBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Ticker started");
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var tick = new ServerTick(DateTimeOffset.UtcNow, counter.Total,
                Math.Round(Random.Shared.NextDouble() * 40 + 10, 1), LiveHub.ConnectedClients);
            await hub.Clients.All.Tick(tick);
        }
    }
}

/// <summary>Tiny singleton incremented by a middleware — a metric the ticker can broadcast.</summary>
public sealed class RequestCounter
{
    private long _total;
    public long Total => Interlocked.Read(ref _total);
    public void Increment() => Interlocked.Increment(ref _total);
}

public static class RealtimeLesson
{
    public static IServiceCollection AddRealtimeLesson(this IServiceCollection services)
    {
        services.AddSignalR();
        services.AddSingleton<RequestCounter>();
        services.AddHostedService<TickerBackgroundService>();
        return services;
    }

    public static IEndpointRouteBuilder MapRealtimeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapHub<LiveHub>("/hubs/live");

        // Server-side push from an HTTP endpoint via IHubContext (no hub instance needed).
        app.MapPost("/api/realtime/announce", async (string text, IHubContext<LiveHub, ILiveClient> hub) =>
        {
            await hub.Clients.All.ChatMessage(new ChatMessage("server", text, DateTimeOffset.UtcNow));
            return TypedResults.Accepted("/hubs/live");
        }).WithTags("Realtime");

        return app;
    }
}
