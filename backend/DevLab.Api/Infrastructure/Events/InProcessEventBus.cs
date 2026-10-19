using System.Reflection;

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

    /// <summary>Same, when the type is only known at runtime (an event deserialized from the outbox).</summary>
    Task PublishAsync(IDomainEvent @event, CancellationToken ct);
}

/// <summary>
/// Modules never call each other's handlers: they publish an event and whoever is
/// interested subscribes. Nobody calls this bus from a request anymore: events are written
/// to the outbox with the business change, and the OutboxDispatcher publishes them here.
/// </summary>
public sealed class InProcessEventBus(IServiceProvider services, ILogger<InProcessEventBus> logger) : IEventBus
{
    private static readonly MethodInfo GenericPublish = typeof(InProcessEventBus)
        .GetMethods().Single(m => m is { Name: nameof(PublishAsync), IsGenericMethodDefinition: true });

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct) where TEvent : IDomainEvent
    {
        // Resolved from the CURRENT scope → handlers can use scoped services (DbContext).
        var handlers = services.GetServices<IEventHandler<TEvent>>().ToList();
        logger.LogInformation("Event {Event} → {Count} handler(s)", typeof(TEvent).Name, handlers.Count);

        foreach (var handler in handlers)
            await handler.HandleAsync(@event, ct);
    }

    public Task PublishAsync(IDomainEvent @event, CancellationToken ct) =>
        (Task)GenericPublish.MakeGenericMethod(@event.GetType()).Invoke(this, [@event, ct])!;
}
