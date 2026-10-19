using System.Security.Claims;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure.Messaging;
using DevLab.Api.Infrastructure.Modules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DevLab.Api.Features.Orders.Outbox;

public sealed record OutboxRow(Guid Id, string Type, string Payload, DateTime OccurredAt, DateTime? ProcessedAt, int Attempts, string? Error, string Status);
public sealed record OutboxState(int Pending, int Processed, int Poison, int MaxAttempts, int FaultsArmed, IReadOnlyList<OutboxRow> Messages);
public sealed record IdempotencyRow(string Key, string RequestHash, int? StatusCode, DateTime CreatedAt);
public sealed record ArmFaultsRequest(int Failures);

/// <summary>Lab endpoints to watch the Orders outbox work: list, flush now, inject faults, redeliver.</summary>
public sealed class OutboxEndpoints : IApiEndpoint
{
    public void Map(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbox").RequireAuthorization().WithTags("Outbox & idempotency");

        group.MapGet("/", async (OrdersDbContext db, IOptions<OutboxOptions> options, HandlerFaults faults, CancellationToken ct) =>
        {
            var max = options.Value.MaxAttempts;
            var outbox = db.OutboxMessages.AsNoTracking();
            var rows = await outbox.OrderByDescending(m => m.OccurredAt).Take(30).ToListAsync(ct);

            return Results.Ok(new OutboxState(
                Pending: await outbox.CountAsync(m => m.ProcessedAt == null && m.Attempts < max, ct),
                Processed: await outbox.CountAsync(m => m.ProcessedAt != null, ct),
                Poison: await outbox.CountAsync(m => m.ProcessedAt == null && m.Attempts >= max, ct),
                MaxAttempts: max,
                FaultsArmed: faults.Remaining,
                Messages: [.. rows.Select(m => new OutboxRow(m.Id, m.Type, m.Payload, m.OccurredAt, m.ProcessedAt, m.Attempts, m.Error, StatusOf(m, max)))]));
        });

        group.MapPost("/dispatch", async (OutboxDispatcher<OrdersDbContext> dispatcher, CancellationToken ct) =>
            Results.Ok(new { dispatched = await dispatcher.DispatchPendingAsync(ct) }));

        group.MapPost("/faults", (ArmFaultsRequest request, HandlerFaults faults) =>
        {
            faults.Arm(request.Failures);
            return Results.Ok(new { armed = faults.Remaining });
        });

        // Simulates a broker redelivering a message whose ack was lost: the inbox must absorb it.
        group.MapPost("/{id:guid}/redeliver", async (Guid id, OutboxDispatcher<OrdersDbContext> dispatcher, CancellationToken ct) =>
            await dispatcher.RedeliverAsync(id, ct) ? Results.NoContent() : Results.NotFound());

        app.MapGet("/api/idempotency", async (ClaimsPrincipal user, OrdersDbContext db, CancellationToken ct) =>
                Results.Ok(await db.IdempotencyRecords.AsNoTracking()
                    .Where(r => r.Scope.StartsWith(user.Identity!.Name! + "|"))
                    .OrderByDescending(r => r.Id).Take(10)
                    .Select(r => new IdempotencyRow(r.Key, r.RequestHash, r.StatusCode, r.CreatedAt))
                    .ToListAsync(ct)))
            .RequireAuthorization()
            .WithTags("Outbox & idempotency");
    }

    private static string StatusOf(OutboxMessage m, int maxAttempts) => m switch
    {
        { ProcessedAt: not null } => "processed",
        _ when m.Attempts >= maxAttempts => "poison",
        { Attempts: > 0 } => "retrying",
        _ => "pending",
    };
}
