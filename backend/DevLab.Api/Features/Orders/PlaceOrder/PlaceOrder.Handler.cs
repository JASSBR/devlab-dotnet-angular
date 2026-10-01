using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products.PublicApi;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Events;

namespace DevLab.Api.Features.Orders.PlaceOrder;

/// <summary>
/// All the business logic of "place an order", readable top to bottom. Depends on the
/// Products module ONLY through IProductCatalog (its PublicApi) — never on its DbContext.
/// </summary>
public sealed class PlaceOrderHandler(OrdersDbContext db, IProductCatalog catalog, IEventBus events)
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
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        // Published AFTER persistence: subscribers must never see an order that does not exist yet.
        await events.PublishAsync(new OrderPlaced(order.Id, order.ProductId, order.Quantity, customerName), ct);

        return OrderDto.From(order);
    }
}
