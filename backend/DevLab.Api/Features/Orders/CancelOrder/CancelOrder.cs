using System.Security.Claims;
using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Events;
using DevLab.Api.Infrastructure.Modules;

namespace DevLab.Api.Features.Orders.CancelOrder;

public sealed class CancelOrderEndpoint : IApiEndpoint
{
    public void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/api/orders/{id:int}/cancel", async (int id, ClaimsPrincipal user, CancelOrderHandler handler, CancellationToken ct) =>
            {
                var result = await handler.HandleAsync(id, user.Identity!.Name!, user.IsInRole("Admin"), ct);
                return result.Match(Results.Ok, error => error.ToProblem());
            })
            .RequireAuthorization()
            .WithTags("Orders (vertical slice)");
}

public sealed class CancelOrderHandler(OrdersDbContext db, IEventBus events)
{
    public async Task<Result<OrderDto>> HandleAsync(int orderId, string customerName, bool isAdmin, CancellationToken ct)
    {
        var order = await db.Orders.FindAsync([orderId], ct);
        if (order is null) return OrderErrors.NotFound(orderId);
        if (!isAdmin && order.CustomerName != customerName) return OrderErrors.NotOwner(orderId);
        if (order.Status == OrderStatus.Cancelled) return OrderErrors.AlreadyCancelled(orderId);

        order.Status = OrderStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        await events.PublishAsync(new OrderCancelled(order.Id, order.ProductId, order.Quantity), ct);

        return OrderDto.From(order);
    }
}
