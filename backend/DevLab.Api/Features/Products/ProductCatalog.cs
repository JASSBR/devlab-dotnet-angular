using DevLab.Api.Features.Products.PublicApi;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Products;

/// <summary>Internal to Products: implements the public contract on top of the module's DbContext.</summary>
internal sealed class ProductCatalog(AppDbContext db) : IProductCatalog
{
    public async Task<ProductInfo?> FindAsync(int productId, CancellationToken ct) =>
        await db.Products.AsNoTracking()
            .Where(p => p.Id == productId)
            .Select(p => new ProductInfo(p.Id, p.Name, p.Price, p.Stock))
            .FirstOrDefaultAsync(ct);
}
