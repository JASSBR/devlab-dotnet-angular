using System.Security.Claims;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Validation;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Idempotency;
using DevLab.Api.Infrastructure.Modules;

namespace DevLab.Api.Features.Orders.PlaceOrder;

public sealed record PlaceOrderRequest(int ProductId, int Quantity);

/// <summary>
/// The endpoint is thin: bind → validate (filter) → deduplicate (filter) → call handler → translate Result to HTTP.
/// No business rule lives here.
/// </summary>
public sealed class PlaceOrderEndpoint : IApiEndpoint
{
    public void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/api/orders", async (PlaceOrderRequest request, ClaimsPrincipal user, PlaceOrderHandler handler, CancellationToken ct) =>
            {
                var result = await handler.HandleAsync(request, user.Identity!.Name!, ct);
                return result.Match(
                    order => Results.Created($"/api/orders/{order.Id}", order),
                    error => error.ToProblem());
            })
            .AddEndpointFilter<ValidationFilter<PlaceOrderRequest>>()
            // Registered after validation: an invalid request never claims an Idempotency-Key.
            .AddEndpointFilter<IdempotencyFilter<PlaceOrderRequest, OrdersDbContext>>()
            .RequireAuthorization()
            .WithTags("Orders (vertical slice)");
}
