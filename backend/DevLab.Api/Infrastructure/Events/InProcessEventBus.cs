namespace DevLab.Api.Infrastructure.Events;

/// <summary>Something that happened, in the past tense, owned by the module that raised it.</summary>
public interface IDomainEvent;

public interface IEventHandler<in TEvent> where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent @event, CancellationToken ct);
}

public interface IEventBus
{
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct) where TEvent : IDomainEvent;
}

/// <summary>
/// Modules never call each other's handlers: they publish an event and whoever is
/// interested subscribes. Same process, same transaction boundary is NOT guaranteed —
/// in production you'd persist the event first (outbox pattern) and dispatch it asynchronously.
/// </summary>
public sealed class InProcessEventBus(IServiceProvider services, ILogger<InProcessEventBus> logger) : IEventBus
{
    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct) where TEvent : IDomainEvent
    {
        // Resolved from the CURRENT scope → handlers can use scoped services (DbContext).
        var handlers = services.GetServices<IEventHandler<TEvent>>().ToList();
        logger.LogInformation("Event {Event} → {Count} handler(s)", typeof(TEvent).Name, handlers.Count);

        foreach (var handler in handlers)
            await handler.HandleAsync(@event, ct);
    }
}
