using System.Net.Http.Json;
using DevLab.Api.Features.EfMigrations;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace DevLab.Api.Tests;

public class MigrationsTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Startup_applies_every_migration_of_both_modules()
    {
        _ = factory.CreateClient();   // boots the app → MigrateAndSeedAsync
        using var scope = factory.Services.CreateScope();

        foreach (var db in new DbContext[] { scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<OrdersDbContext>() })
        {
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(db.Database.GetMigrations(), await db.Database.GetAppliedMigrationsAsync());
            Assert.True(db.Database.GetMigrations().Count() >= 2, $"{db.GetType().Name}: InitialCreate + a schema evolution");
        }
    }

    [Fact]
    public void The_model_snapshot_matches_the_code()
    {
        // Fails when an entity changed but nobody ran `dotnet ef migrations add`: the CI catches it, not production.
        using var scope = factory.Services.CreateScope();
        Assert.False(scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.HasPendingModelChanges());
        Assert.False(scope.ServiceProvider.GetRequiredService<OrdersDbContext>().Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task Migrations_endpoint_shows_history_and_the_sql_of_the_last_migration()
    {
        var state = await factory.CreateClient().GetFromJsonAsync<List<ContextMigrations>>("/api/migrations");

        var orders = Assert.Single(state!, c => c.Context == nameof(OrdersDbContext));
        Assert.Empty(orders.Pending);
        Assert.Equal(orders.Applied, orders.History.Select(h => h.MigrationId));
        Assert.EndsWith("_AddIdempotencyAndOutbox", orders.LastMigration);
        Assert.Contains("CREATE TABLE \"OutboxMessages\"", orders.LastMigrationSql);
        Assert.Contains("CREATE UNIQUE INDEX \"IX_IdempotencyRecords_Scope_Key\"", orders.LastMigrationSql);
    }
}
