using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Infrastructure.Events;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Products.Events;

/// <summary>
/// Products reacts to an event raised by Orders. Orders does not know this handler exists —
/// that is the whole point: a new module (Shipping, Analytics…) can subscribe without any
/// change in Orders.
/// </summary>
internal sealed class OrderPlacedHandler(AppDbContext db, ILogger<OrderPlacedHandler> logger) : IEventHandler<OrderPlaced>
{
    public async Task HandleAsync(OrderPlaced @event, CancellationToken ct)
    {
        // Atomic decrement in SQL: no read-modify-write race between two concurrent orders.
        var updated = await db.Products
            .Where(p => p.Id == @event.ProductId && p.Stock >= @event.Quantity)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - @event.Quantity), ct);

        logger.LogInformation("OrderPlaced #{OrderId}: stock of product {ProductId} decremented by {Qty} ({Updated} row)",
            @event.OrderId, @event.ProductId, @event.Quantity, updated);
    }
}

/// <summary>Restock when an order is cancelled.</summary>
internal sealed class OrderCancelledHandler(AppDbContext db) : IEventHandler<OrderCancelled>
{
    public Task HandleAsync(OrderCancelled @event, CancellationToken ct) =>
        db.Products.Where(p => p.Id == @event.ProductId)
          .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock + @event.Quantity), ct);
}
