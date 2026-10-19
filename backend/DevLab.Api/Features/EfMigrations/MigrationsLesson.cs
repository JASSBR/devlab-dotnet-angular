using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace DevLab.Api.Features.EfMigrations;

public sealed record HistoryRow(string MigrationId, string ProductVersion);

public sealed record ContextMigrations(
    string Context, string Database,
    IReadOnlyList<string> All, IReadOnlyList<string> Applied, IReadOnlyList<string> Pending,
    IReadOnlyList<HistoryRow> History, string? LastMigration, string? LastMigrationSql);

/// <summary>
/// Read-only window on the migration state of both module databases: what the assembly
/// contains, what the database says it applied (__EFMigrationsHistory), and the SQL EF
/// would run for the most recent migration.
/// </summary>
public static class MigrationsLesson
{
    public static IEndpointRouteBuilder MapMigrationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/migrations", async (AppDbContext products, OrdersDbContext orders, CancellationToken ct) =>
                Results.Ok(new[] { await DescribeAsync(products, ct), await DescribeAsync(orders, ct) }))
            .WithTags("EF Core migrations");
        return app;
    }

    private static async Task<ContextMigrations> DescribeAsync(DbContext db, CancellationToken ct)
    {
        var all = db.Database.GetMigrations().ToList();                        // compiled into the assembly
        var applied = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();  // read from __EFMigrationsHistory
        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();  // all − applied

        // SqlQueryRaw maps to an unmapped type (EF 8+): the history table is just a table.
        var history = await db.Database
            .SqlQueryRaw<HistoryRow>("""SELECT "MigrationId", "ProductVersion" FROM "__EFMigrationsHistory" ORDER BY "MigrationId" """)
            .ToListAsync(ct);

        // IMigrator.GenerateScript(from, to) = what `dotnet ef migrations script <from> <to>` prints.
        var last = all.LastOrDefault();
        var previous = all.Count > 1 ? all[^2] : Migration.InitialDatabase;
        var sql = last is null ? null : db.GetService<IMigrator>().GenerateScript(previous, last);

        return new ContextMigrations(db.GetType().Name, Path.GetFileName(db.Database.GetDbConnection().DataSource),
            all, applied, pending, history, last, sql);
    }
}
