using DevLab.Api.Infrastructure.Events;

namespace DevLab.Api.Features.Orders.PublicApi;

// Events are part of a module's PUBLIC contract: other modules subscribe to them.
public sealed record OrderPlaced(int OrderId, int ProductId, int Quantity, string CustomerName) : IDomainEvent;
public sealed record OrderCancelled(int OrderId, int ProductId, int Quantity) : IDomainEvent;
