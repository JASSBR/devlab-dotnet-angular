using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Orders.Shared;

public enum OrderStatus { Placed, Cancelled }

public sealed class Order
{
    public int Id { get; set; }
    public required string CustomerName { get; set; }
    public int ProductId { get; set; }
    public required string ProductName { get; set; }   // snapshot: the name at order time, whatever Products does later
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal Total => UnitPrice * Quantity;
    public OrderStatus Status { get; set; } = OrderStatus.Placed;
    public DateTime PlacedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Orders owns its data: its own DbContext, its own SQLite file. No shared tables between modules.</summary>
public sealed class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>(e =>
        {
            e.Property(o => o.CustomerName).HasMaxLength(80);
            e.Property(o => o.ProductName).HasMaxLength(120);
            e.Property(o => o.UnitPrice).HasPrecision(10, 2);
            e.Property(o => o.Status).HasConversion<string>();
            e.HasIndex(o => o.CustomerName);
        });
    }
}

public sealed record OrderDto(int Id, string CustomerName, int ProductId, string ProductName, decimal UnitPrice, int Quantity, decimal Total, string Status, DateTime PlacedAt)
{
    public static OrderDto From(Order o) => new(o.Id, o.CustomerName, o.ProductId, o.ProductName, o.UnitPrice, o.Quantity, o.Total, o.Status.ToString(), o.PlacedAt);
}
