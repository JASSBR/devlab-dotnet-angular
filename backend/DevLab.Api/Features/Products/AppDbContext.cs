using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Features.Products;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Fluent API beats attributes: the entity stays a plain C# class.
        modelBuilder.Entity<Product>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.Name).HasMaxLength(120).IsRequired();
            e.Property(p => p.Category).HasMaxLength(60).IsRequired();
            e.Property(p => p.Price).HasPrecision(10, 2);
            e.HasIndex(p => p.Category);        // we filter by category → index it
            e.HasIndex(p => p.Name);
        });
    }
}
