using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage;

namespace DevLab.Api.Infrastructure;

public static class DbSeeder
{
    /// <summary>
    /// Applies pending migrations, then seeds demo data. Migrating at startup is fine HERE:
    /// one instance, a local SQLite file, disposable data. In production the pipeline applies
    /// a migration bundle or an idempotent SQL script BEFORE deploying — never N replicas racing
    /// to ALTER the same tables at boot, and never with the app's (least-privilege) credentials.
    /// </summary>
    public static async Task MigrateAndSeedAsync(this IServiceProvider services)
    {
        // DbContext is Scoped: outside of a request we must create our own scope.
        using var scope = services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await MigrateAsync(orders);
        await MigrateAsync(db);

        if (await db.Products.AnyAsync()) return;

        // Seed = data the app needs to run (here: a demo catalog). Reference data that must exist
        // in every environment would go in a migration instead (HasData or migrationBuilder.InsertData).
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

    private static async Task MigrateAsync(DbContext db)
    {
        // A database created by the old EnsureCreated() has tables but no __EFMigrationsHistory:
        // InitialCreate would fail on "table already exists". Lab data is disposable → start over.
        // (A real database would be "baselined" instead: insert the InitialCreate row by hand.)
        var history = db.GetService<IHistoryRepository>();
        if (!await history.ExistsAsync() && await db.GetService<IRelationalDatabaseCreator>().HasTablesAsync())
            await db.Database.EnsureDeletedAsync();

        await db.Database.MigrateAsync();
    }
}
