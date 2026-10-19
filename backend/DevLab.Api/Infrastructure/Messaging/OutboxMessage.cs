using System.Text.Json;
using DevLab.Api.Infrastructure.Events;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Infrastructure.Messaging;

/// <summary>
/// An event waiting to be delivered, stored in the SAME database (and the same transaction)
/// as the business change that raised it. Either both are committed, or neither: no dual write.
/// </summary>
public sealed class OutboxMessage
{
    public Guid Id { get; init; } = Guid.CreateVersion7();     // time-ordered → good index locality
    public required string Type { get; init; }                 // logical name (OrderPlaced), never a CLR assembly name
    public required string Payload { get; init; }              // JSON
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
    public int Attempts { get; set; }
    public string? Error { get; set; }

    public static OutboxMessage From<TEvent>(TEvent @event) where TEvent : IDomainEvent => new()
    {
        Type = typeof(TEvent).Name,
        Payload = JsonSerializer.Serialize(@event, JsonSerializerOptions.Web),
    };
}

/// <summary>Remembers which message each handler already processed: the consumer side of at-least-once.</summary>
public sealed class InboxRecord
{
    public Guid MessageId { get; init; }
    public required string Handler { get; init; }
    public DateTime ProcessedAt { get; init; } = DateTime.UtcNow;
}

public static class MessagingModelBuilderExtensions
{
    public static ModelBuilder AddOutbox(this ModelBuilder modelBuilder) => modelBuilder.Entity<OutboxMessage>(e =>
    {
        e.ToTable("OutboxMessages");
        e.Property(m => m.Type).HasMaxLength(120);
        e.Property(m => m.Error).HasMaxLength(500);
        // The dispatcher's query: "WHERE ProcessedAt IS NULL ORDER BY OccurredAt".
        e.HasIndex(m => new { m.ProcessedAt, m.OccurredAt });
    });

    public static ModelBuilder AddInbox(this ModelBuilder modelBuilder) => modelBuilder.Entity<InboxRecord>(e =>
    {
        e.ToTable("InboxRecords");
        // The primary key IS the deduplication: a second insert for the same pair fails.
        e.HasKey(r => new { r.MessageId, r.Handler });
        e.Property(r => r.Handler).HasMaxLength(120);
    });
}
