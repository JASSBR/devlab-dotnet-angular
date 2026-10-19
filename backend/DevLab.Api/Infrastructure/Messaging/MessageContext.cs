using DevLab.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Infrastructure.Messaging;

/// <summary>
/// Scoped "envelope" of the message being handled (what Wolverine/MassTransit call the
/// envelope or ConsumeContext): the dispatcher fills it, handlers read the id to deduplicate.
/// </summary>
public sealed class MessageContext
{
    public Guid MessageId { get; set; }
    public int Attempt { get; set; }
}

/// <summary>Lab-only fault injection: makes the next N deliveries throw, to watch retries happen.</summary>
public sealed class HandlerFaults
{
    private int _remaining;

    public int Remaining => Volatile.Read(ref _remaining);
    public void Arm(int failures) => Interlocked.Exchange(ref _remaining, Math.Clamp(failures, 0, 10));

    public void ThrowIfArmed(string handler)
    {
        // Decrement only while > 0: concurrent callers never push the counter below zero.
        int current;
        do
        {
            current = Volatile.Read(ref _remaining);
            if (current == 0) return;
        } while (Interlocked.CompareExchange(ref _remaining, current - 1, current) != current);

        throw new InvalidOperationException($"Simulated failure in {handler} ({current - 1} left)");
    }
}

public static class InboxExtensions
{
    /// <summary>
    /// Idempotent consumer: the handler's side effect and the inbox row commit together, so a
    /// redelivered message is detected and skipped. Returns false when it was a duplicate.
    /// </summary>
    public static Task<bool> HandleOnceAsync(this DbContext db, MessageContext message, string handler, Func<Task> work, CancellationToken ct) =>
        db.InTransactionAsync(async () =>
        {
            var inbox = db.Set<InboxRecord>();
            if (await inbox.AnyAsync(r => r.MessageId == message.MessageId && r.Handler == handler, ct))
                return false;

            await work();
            inbox.Add(new InboxRecord { MessageId = message.MessageId, Handler = handler });
            await db.SaveChangesAsync(ct);   // a concurrent duplicate fails here on the PK → rolled back
            return true;
        }, ct);
}
