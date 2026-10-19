using System.Text.Json;
using DevLab.Api.Infrastructure.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DevLab.Api.Infrastructure.Messaging;

public sealed class OutboxOptions
{
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromMilliseconds(500);
    public int BatchSize { get; set; } = 20;
    /// <summary>After that many failures the message is "poison": parked, no more retries, a human looks at it.</summary>
    public int MaxAttempts { get; set; } = 5;
}

/// <summary>
/// Event names are resolved against an allow-list built once, never with Type.GetType(row.Type):
/// deserializing an arbitrary type named by stored data is a classic injection vector.
/// </summary>
internal static class DomainEventTypes
{
    public static readonly IReadOnlyDictionary<string, Type> ByName = typeof(IDomainEvent).Assembly.GetTypes()
        .Where(t => typeof(IDomainEvent).IsAssignableFrom(t) && t is { IsInterface: false, IsAbstract: false })
        .ToDictionary(t => t.Name, StringComparer.Ordinal);
}

/// <summary>
/// The relay half of the outbox: polls unprocessed rows, publishes them, marks them processed.
/// Delivery is AT-LEAST-ONCE: a crash between "handler succeeded" and "row marked processed"
/// means the message is delivered again → handlers must be idempotent (see InboxExtensions).
/// </summary>
public sealed class OutboxDispatcher<TDbContext>(
    IServiceScopeFactory scopes,
    IOptions<OutboxOptions> options,
    ILogger<OutboxDispatcher<TDbContext>> logger) : BackgroundService where TDbContext : DbContext
{

    // One dispatch at a time in this process (timer tick vs. a manual flush from a test or the demo).
    // Across several instances you'd claim rows instead: UPDATE … SET LockedUntil, or FOR UPDATE SKIP LOCKED.
    private readonly SemaphoreSlim _gate = new(1, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.PollInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await DispatchPendingAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // The database may be briefly unavailable: log and try again on the next tick.
                logger.LogError(ex, "Outbox polling failed");
            }
        }
    }

    /// <summary>Delivers every due message once. Public so tests (and the demo) can flush deterministically.</summary>
    public async Task<int> DispatchPendingAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TDbContext>();
            var max = options.Value.MaxAttempts;

            var batch = await db.Set<OutboxMessage>()
                .Where(m => m.ProcessedAt == null && m.Attempts < max)
                .OrderBy(m => m.OccurredAt)
                .Take(options.Value.BatchSize)
                .ToListAsync(ct);

            foreach (var message in batch)
                await DeliverAsync(message, ct);

            await db.SaveChangesAsync(ct);
            return batch.Count;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Publishes an already-processed message again: what a broker does after a lost ack.</summary>
    public async Task<bool> RedeliverAsync(Guid messageId, CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var message = await scope.ServiceProvider.GetRequiredService<TDbContext>().Set<OutboxMessage>()
            .AsNoTracking().FirstOrDefaultAsync(m => m.Id == messageId, ct);
        if (message is null) return false;

        await PublishInOwnScopeAsync(message, ct);
        return true;
    }

    private async Task DeliverAsync(OutboxMessage message, CancellationToken ct)
    {
        message.Attempts++;
        try
        {
            await PublishInOwnScopeAsync(message, ct);
            message.ProcessedAt = DateTime.UtcNow;
            message.Error = null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Retried on the next tick. In production: exponential backoff (NextAttemptAt column).
            message.Error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            logger.LogWarning(ex, "Outbox message {Id} ({Type}) failed, attempt {Attempt}/{Max}: {Error}",
                message.Id, message.Type, message.Attempts, options.Value.MaxAttempts, message.Error);
        }
    }

    private async Task PublishInOwnScopeAsync(OutboxMessage message, CancellationToken ct)
    {
        if (!DomainEventTypes.ByName.TryGetValue(message.Type, out var type))
            throw new InvalidOperationException($"Unknown event type '{message.Type}'");

        var @event = (IDomainEvent)JsonSerializer.Deserialize(message.Payload, type, JsonSerializerOptions.Web)!;

        // One scope per message: handlers get fresh DbContexts, a failure cannot leak into the next message.
        using var scope = scopes.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<MessageContext>();
        context.MessageId = message.Id;
        context.Attempt = message.Attempts;
        await scope.ServiceProvider.GetRequiredService<IEventBus>().PublishAsync(@event, ct);
    }

    public override void Dispose()
    {
        _gate.Dispose();
        base.Dispose();
    }
}

public static class MessagingServiceCollectionExtensions
{
    /// <summary>Outbox relay for one module's DbContext + the in-process bus it publishes to.</summary>
    public static IServiceCollection AddOutbox<TDbContext>(this IServiceCollection services, IConfiguration configuration)
        where TDbContext : DbContext
    {
        services.Configure<OutboxOptions>(configuration.GetSection("Outbox"));
        services.AddScoped<IEventBus, InProcessEventBus>();
        services.AddScoped<MessageContext>();
        services.AddSingleton<HandlerFaults>();
        // Singleton + hosted service = the SAME instance: tests and endpoints can call DispatchPendingAsync.
        services.AddSingleton<OutboxDispatcher<TDbContext>>();
        services.AddHostedService(sp => sp.GetRequiredService<OutboxDispatcher<TDbContext>>());
        return services;
    }
}
