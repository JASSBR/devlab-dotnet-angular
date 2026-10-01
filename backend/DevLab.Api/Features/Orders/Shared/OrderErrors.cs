using DevLab.Api.Infrastructure;

namespace DevLab.Api.Features.Orders.Shared;

/// <summary>Every business error of the module, named, in one place. Tests assert on codes, not on strings.</summary>
public static class OrderErrors
{
    public static Error ProductNotFound(int productId) => Error.NotFound("orders.product_not_found", $"Product {productId} does not exist");
    public static Error InsufficientStock(int requested, int available) => Error.Conflict("orders.insufficient_stock", $"Requested {requested}, only {available} in stock");
    public static Error NotFound(int orderId) => Error.NotFound("orders.not_found", $"Order {orderId} does not exist");
    public static Error AlreadyCancelled(int orderId) => Error.Conflict("orders.already_cancelled", $"Order {orderId} is already cancelled");
    public static Error NotOwner(int orderId) => Error.Forbidden("orders.not_owner", $"Order {orderId} belongs to someone else");
}
