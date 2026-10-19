using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Infrastructure.Events;
using DevLab.Api.Infrastructure.Messaging;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Products.Events;

/// <summary>
/// Products reacts to an event raised by Orders. Orders does not know this handler exists —
/// that is the whole point: a new module (Shipping, Analytics…) can subscribe without any
/// change in Orders. Delivered by the outbox at-least-once → the handler must be idempotent:
/// decrementing the stock twice for one order would be a real bug.
/// </summary>
internal sealed class OrderPlacedHandler(AppDbContext db, MessageContext message, HandlerFaults faults, ILogger<OrderPlacedHandler> logger)
    : IEventHandler<OrderPlaced>
{
    public async Task HandleAsync(OrderPlaced @event, CancellationToken ct)
    {
        faults.ThrowIfArmed(nameof(OrderPlacedHandler));   // lab: lets the demo watch retries

        var firstTime = await db.HandleOnceAsync(message, nameof(OrderPlacedHandler), async () =>
        {
            // Atomic decrement in SQL: no read-modify-write race between two concurrent orders.
            var updated = await db.Products
                .Where(p => p.Id == @event.ProductId && p.Stock >= @event.Quantity)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - @event.Quantity), ct);

            logger.LogInformation("OrderPlaced #{OrderId}: stock of product {ProductId} decremented by {Qty} ({Updated} row)",
                @event.OrderId, @event.ProductId, @event.Quantity, updated);
        }, ct);

        if (!firstTime)
            logger.LogInformation("OrderPlaced #{OrderId}: message {MessageId} already handled, skipped", @event.OrderId, message.MessageId);
    }
}

/// <summary>Restock when an order is cancelled — same inbox, same guarantee.</summary>
internal sealed class OrderCancelledHandler(AppDbContext db, MessageContext message) : IEventHandler<OrderCancelled>
{
    public Task HandleAsync(OrderCancelled @event, CancellationToken ct) =>
        db.HandleOnceAsync(message, nameof(OrderCancelledHandler), () =>
            db.Products.Where(p => p.Id == @event.ProductId)
              .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock + @event.Quantity), ct), ct);
}
