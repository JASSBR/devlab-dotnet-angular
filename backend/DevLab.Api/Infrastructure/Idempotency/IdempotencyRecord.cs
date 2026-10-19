using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Infrastructure.Idempotency;

/// <summary>
/// One row per (caller, Idempotency-Key). StatusCode is null while the first request is still
/// running: a concurrent duplicate sees the row and backs off instead of executing twice.
/// </summary>
public sealed class IdempotencyRecord
{
    public int Id { get; init; }
    public required string Scope { get; init; }          // who + which endpoint: keys never collide across users
    public required string Key { get; init; }
    public required string RequestHash { get; init; }    // SHA-256 of the payload: same key + other payload = client bug
    public int? StatusCode { get; set; }
    public string? ResponseBody { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public static class IdempotencyModelBuilderExtensions
{
    public static ModelBuilder AddIdempotencyRecords(this ModelBuilder modelBuilder) => modelBuilder.Entity<IdempotencyRecord>(e =>
    {
        e.ToTable("IdempotencyRecords");
        e.Property(r => r.Scope).HasMaxLength(200);
        e.Property(r => r.Key).HasMaxLength(IdempotencyHeaders.MaxKeyLength);
        e.Property(r => r.RequestHash).HasMaxLength(64);
        // THE concurrency guard: two requests racing with the same key → the second INSERT fails.
        e.HasIndex(r => new { r.Scope, r.Key }).IsUnique();
    });
}
