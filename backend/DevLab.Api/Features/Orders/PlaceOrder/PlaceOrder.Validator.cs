using FluentValidation;

namespace DevLab.Api.Features.Orders.PlaceOrder;

/// <summary>Shape validation only (is the request well-formed?). Business rules (stock) belong to the handler.</summary>
public sealed class PlaceOrderValidator : AbstractValidator<PlaceOrderRequest>
{
    public PlaceOrderValidator()
    {
        RuleFor(x => x.ProductId).GreaterThan(0);
        RuleFor(x => x.Quantity).InclusiveBetween(1, 50).WithMessage("You can order 1 to 50 units at a time");
    }
}
