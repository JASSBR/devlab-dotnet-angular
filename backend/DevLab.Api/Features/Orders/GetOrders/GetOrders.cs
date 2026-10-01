using System.Security.Claims;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure.Modules;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Orders.GetOrders;

// A tiny slice can live in ONE file: endpoint + handler together. Split when it grows.
public sealed class GetOrdersEndpoint : IApiEndpoint
{
    public void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/api/orders", async (ClaimsPrincipal user, GetOrdersHandler handler, CancellationToken ct) =>
                Results.Ok(await handler.HandleAsync(user.Identity!.Name!, user.IsInRole("Admin"), ct)))
            .RequireAuthorization()
            .WithTags("Orders (vertical slice)");
}

public sealed class GetOrdersHandler(OrdersDbContext db)
{
    // Admins see every order; users only their own. Authorization by data filtering, not by policy.
    public async Task<IReadOnlyList<OrderDto>> HandleAsync(string customerName, bool isAdmin, CancellationToken ct) =>
        await db.Orders.AsNoTracking()
            .Where(o => isAdmin || o.CustomerName == customerName)
            .OrderByDescending(o => o.PlacedAt)
            .Take(50)
            .Select(o => OrderDto.From(o))
            .ToListAsync(ct);
}
