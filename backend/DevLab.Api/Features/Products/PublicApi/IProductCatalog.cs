namespace DevLab.Api.Features.Products.PublicApi;

/// <summary>
/// The ONLY thing other modules may know about Products. No entity, no DbContext, no
/// endpoint leaks out: Orders depends on this interface, so Products can change its
/// storage or schema without touching Orders.
/// </summary>
public interface IProductCatalog
{
    Task<ProductInfo?> FindAsync(int productId, CancellationToken ct);
}

public sealed record ProductInfo(int Id, string Name, decimal Price, int Stock);
