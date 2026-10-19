using System.Security.Claims;
using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Messaging;
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

public sealed class CancelOrderHandler(OrdersDbContext db)
{
    public async Task<Result<OrderDto>> HandleAsync(int orderId, string customerName, bool isAdmin, CancellationToken ct)
    {
        var order = await db.Orders.FindAsync([orderId], ct);
        if (order is null) return OrderErrors.NotFound(orderId);
        if (!isAdmin && order.CustomerName != customerName) return OrderErrors.NotOwner(orderId);
        if (order.Status == OrderStatus.Cancelled) return OrderErrors.AlreadyCancelled(orderId);

        order.Status = OrderStatus.Cancelled;
        // Outbox again: one SaveChanges = one transaction for the status change AND its event.
        db.OutboxMessages.Add(OutboxMessage.From(new OrderCancelled(order.Id, order.ProductId, order.Quantity)));
        await db.SaveChangesAsync(ct);

        return OrderDto.From(order);
    }
}
