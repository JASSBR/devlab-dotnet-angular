using DevLab.Api.Features.Orders.PlaceOrder;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure.Events;
using DevLab.Api.Infrastructure.Modules;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Orders;

public sealed class OrdersModule : IModule
{
    public void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<OrdersDbContext>((sp, o) =>
            o.UseSqlite(sp.GetRequiredService<IConfiguration>().GetConnectionString("Orders") ?? "Data Source=orders.db"));
        services.AddScoped<IEventBus, InProcessEventBus>();

        // Handlers are plain classes: no MediatR, no reflection magic — inject and call.
        services.AddScoped<PlaceOrderHandler>();
        services.AddScoped<GetOrders.GetOrdersHandler>();
        services.AddScoped<CancelOrder.CancelOrderHandler>();
    }
}
