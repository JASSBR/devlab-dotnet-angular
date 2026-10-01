using DevLab.Api.Features.Orders.PublicApi;
using DevLab.Api.Features.Products.Events;
using DevLab.Api.Features.Products.PublicApi;
using DevLab.Api.Infrastructure.Events;
using DevLab.Api.Infrastructure.Modules;

namespace DevLab.Api.Features.Products;

/// <summary>Registers what Products exposes (IProductCatalog) and what it listens to.</summary>
public sealed class ProductsModule : IModule
{
    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IProductCatalog, ProductCatalog>();
        services.AddScoped<IEventHandler<OrderPlaced>, OrderPlacedHandler>();
        services.AddScoped<IEventHandler<OrderCancelled>, OrderCancelledHandler>();
    }
}
