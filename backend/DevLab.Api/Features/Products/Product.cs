namespace DevLab.Api.Features.Products;

/// <summary>EF Core entity. Conventions: "Id" = primary key, non-nullable = required.</summary>
public class Product
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Category { get; set; }
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// DTOs: never expose entities directly — the API contract must evolve independently of the DB.
public record ProductDto(int Id, string Name, string Category, decimal Price, int Stock, DateTime CreatedAt)
{
    public static ProductDto From(Product p) => new(p.Id, p.Name, p.Category, p.Price, p.Stock, p.CreatedAt);
}

public record CreateProductRequest(string Name, string Category, decimal Price, int Stock);
public record UpdateProductRequest(string Name, string Category, decimal Price, int Stock);

public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total)
{
    public int TotalPages => (int)Math.Ceiling(Total / (double)PageSize);
}
