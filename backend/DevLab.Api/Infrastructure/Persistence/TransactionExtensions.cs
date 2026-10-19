using Microsoft.EntityFrameworkCore;

namespace DevLab.Api.Infrastructure.Persistence;

public static class TransactionExtensions
{
    /// <summary>
    /// Runs <paramref name="work"/> in a transaction: joins the caller's one if it exists
    /// (the IdempotencyFilter opens one around the handler), otherwise owns a new one.
    /// Only the owner commits — so "order + outbox message + idempotency record" commit together.
    /// </summary>
    public static async Task<T> InTransactionAsync<T>(this DbContext db, Func<Task<T>> work, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null)
            return await work();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await work();
        await tx.CommitAsync(ct);   // never reached on exception → DisposeAsync rolls back
        return result;
    }
}
