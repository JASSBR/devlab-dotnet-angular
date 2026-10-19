using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products.PublicApi;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Messaging;
using DevLab.Api.Infrastructure.Persistence;

namespace DevLab.Api.Features.Orders.PlaceOrder;

/// <summary>
/// All the business logic of "place an order", readable top to bottom. Depends on the
/// Products module ONLY through IProductCatalog (its PublicApi) — never on its DbContext.
/// </summary>
public sealed class PlaceOrderHandler(OrdersDbContext db, IProductCatalog catalog)
{
    public async Task<Result<OrderDto>> HandleAsync(PlaceOrderRequest request, string customerName, CancellationToken ct)
    {
        var product = await catalog.FindAsync(request.ProductId, ct);
        if (product is null)
            return OrderErrors.ProductNotFound(request.ProductId);

        if (product.Stock < request.Quantity)
            return OrderErrors.InsufficientStock(request.Quantity, product.Stock);

        var order = new Order
        {
            CustomerName = customerName,
            ProductId = product.Id,
            ProductName = product.Name,
            UnitPrice = product.Price,
            Quantity = request.Quantity,
        };

        // Transactional outbox: the order and its OrderPlaced event commit together, or not at all.
        // Publishing to a bus here instead would be a dual write: order saved + crash = event lost forever.
        return await db.InTransactionAsync(async () =>
        {
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);   // assigns order.Id, which the event carries
            db.OutboxMessages.Add(OutboxMessage.From(new OrderPlaced(order.Id, order.ProductId, order.Quantity, customerName)));
            await db.SaveChangesAsync(ct);
            return Result<OrderDto>.Success(OrderDto.From(order));
        }, ct);
    }
}
