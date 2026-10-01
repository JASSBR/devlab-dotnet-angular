using DevLab.Api.Features.Validation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Products;

public static class ProductsEndpoints
{
    public static IServiceCollection AddProductsFeature(this IServiceCollection services, IConfiguration config)
    {
        // Resolved lazily from the container so tests can point to their own database file.
        services.AddDbContext<AppDbContext>((sp, o) =>
            o.UseSqlite(sp.GetRequiredService<IConfiguration>().GetConnectionString("Default") ?? "Data Source=devlab.db"));
        return services;
    }

    public static IEndpointRouteBuilder MapProductsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products").WithTags("Products");

        // GET /api/products?q=form&category=Training&sort=price&desc=true&page=1&pageSize=5
        group.MapGet("/", async (AppDbContext db, string? q, string? category, string? sort, bool desc = false,
                                 int page = 1, int pageSize = 6, CancellationToken ct = default) =>
        {
            // IQueryable is lazy: filters, sort and paging are translated to ONE SQL query.
            IQueryable<Product> query = db.Products.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(p => EF.Functions.Like(p.Name, $"%{q}%"));
            if (!string.IsNullOrWhiteSpace(category))
                query = query.Where(p => p.Category == category);

            query = (sort, desc) switch
            {
                ("price", false) => query.OrderBy(p => p.Price),
                ("price", true) => query.OrderByDescending(p => p.Price),
                ("name", true) => query.OrderByDescending(p => p.Name),
                _ => query.OrderBy(p => p.Name),
            };

            var total = await query.CountAsync(ct);
            var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
                                   .Select(p => ProductDto.From(p)).ToListAsync(ct);

            return TypedResults.Ok(new PagedResult<ProductDto>(items, page, pageSize, total));
        })
        .WithName("ListProducts");

        group.MapGet("/categories", async (AppDbContext db) =>
            await db.Products.Select(p => p.Category).Distinct().OrderBy(c => c).ToListAsync());

        // TypedResults + Results<A,B> → OpenAPI knows every possible response.
        group.MapGet("/{id:int}", async Task<Results<Ok<ProductDto>, NotFound>> (int id, AppDbContext db) =>
            await db.Products.FindAsync(id) is { } p ? TypedResults.Ok(ProductDto.From(p)) : TypedResults.NotFound())
        .WithName("GetProduct");

        group.MapPost("/", async (CreateProductRequest req, AppDbContext db) =>
        {
            var product = new Product { Name = req.Name, Category = req.Category, Price = req.Price, Stock = req.Stock };
            db.Products.Add(product);
            await db.SaveChangesAsync();   // Unit of Work: INSERT happens here, inside a transaction
            return TypedResults.CreatedAtRoute(ProductDto.From(product), "GetProduct", new { id = product.Id });
        })
        .AddEndpointFilter<ValidationFilter<CreateProductRequest>>()   // ← FluentValidation runs before the handler
        .RequireAuthorization("CanWriteProducts");

        group.MapPut("/{id:int}", async Task<Results<Ok<ProductDto>, NotFound>> (int id, UpdateProductRequest req, AppDbContext db) =>
        {
            var product = await db.Products.FindAsync(id);
            if (product is null) return TypedResults.NotFound();

            // The entity is tracked: EF computes the UPDATE from the diff.
            product.Name = req.Name; product.Category = req.Category; product.Price = req.Price; product.Stock = req.Stock;
            await db.SaveChangesAsync();
            return TypedResults.Ok(ProductDto.From(product));
        })
        .AddEndpointFilter<ValidationFilter<UpdateProductRequest>>()
        .RequireAuthorization("CanWriteProducts");

        group.MapDelete("/{id:int}", async Task<Results<NoContent, NotFound>> (int id, AppDbContext db) =>
        {
            // ExecuteDeleteAsync: one DELETE statement, no entity loading (EF Core 7+).
            var deleted = await db.Products.Where(p => p.Id == id).ExecuteDeleteAsync();
            return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
        })
        .RequireAuthorization("AdminOnly");

        return app;
    }
}
