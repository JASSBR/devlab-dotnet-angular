using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Infrastructure;

public static class DbSeeder
{
    public static async Task SeedDatabaseAsync(this IServiceProvider services)
    {
        // DbContext is Scoped: outside of a request we must create our own scope.
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await scope.ServiceProvider.GetRequiredService<OrdersDbContext>().Database.EnsureCreatedAsync();

        await db.Database.EnsureCreatedAsync();
        if (await db.Products.AnyAsync()) return;

        db.Products.AddRange(
            new Product { Name = "Clavier mécanique", Category = "Hardware", Price = 129.9m, Stock = 12 },
            new Product { Name = "Écran 27\" 4K", Category = "Hardware", Price = 449m, Stock = 4 },
            new Product { Name = "Licence JetBrains Rider", Category = "Software", Price = 149m, Stock = 999 },
            new Product { Name = "Casque audio", Category = "Hardware", Price = 89m, Stock = 0 },
            new Product { Name = "Formation Angular", Category = "Training", Price = 299m, Stock = 30 },
            new Product { Name = "Formation ASP.NET Core", Category = "Training", Price = 349m, Stock = 25 },
            new Product { Name = "Souris ergonomique", Category = "Hardware", Price = 59m, Stock = 40 },
            new Product { Name = "Abonnement GitHub Copilot", Category = "Software", Price = 10m, Stock = 999 },
            new Product { Name = "Webcam 1080p", Category = "Hardware", Price = 69m, Stock = 7 },
            new Product { Name = "Bureau assis-debout", Category = "Furniture", Price = 599m, Stock = 2 },
            new Product { Name = "Chaise ergonomique", Category = "Furniture", Price = 399m, Stock = 5 },
            new Product { Name = "Formation Docker & K8s", Category = "Training", Price = 279m, Stock = 18 });
        await db.SaveChangesAsync();
    }
}
