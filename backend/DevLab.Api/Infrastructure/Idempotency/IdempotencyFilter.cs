using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DevLab.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DevLab.Api.Infrastructure.Idempotency;

public static class IdempotencyHeaders
{
    public const string Key = "Idempotency-Key";
    public const string Replayed = "Idempotent-Replayed";
    public const int MaxKeyLength = 100;
}

/// <summary>
/// Makes a POST safe to retry. The client sends an Idempotency-Key (a UUID it generated);
/// the first request runs and its response is stored, every retry gets that response back.
/// Registered per endpoint: .AddEndpointFilter&lt;IdempotencyFilter&lt;TRequest, TDbContext&gt;&gt;().
/// The record lives in the module's own database, so it commits with the business change.
/// </summary>
public sealed class IdempotencyFilter<TRequest, TDbContext>(TDbContext db, IOptions<JsonOptions> json) : IEndpointFilter
    where TDbContext : DbContext
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var key = http.Request.Headers[IdempotencyHeaders.Key].ToString();
        if (string.IsNullOrWhiteSpace(key)) return await next(ctx);   // opt-in: no header, plain POST
        if (key.Length > IdempotencyHeaders.MaxKeyLength)
            return Problem(StatusCodes.Status400BadRequest, "idempotency.invalid_key", $"{IdempotencyHeaders.Key} must be at most {IdempotencyHeaders.MaxKeyLength} characters");

        var ct = http.RequestAborted;
        var scope = $"{http.User.Identity?.Name ?? "anonymous"}|{http.Request.Method} {(http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText}";
        var hash = Hash(ctx.Arguments.OfType<TRequest>().FirstOrDefault());

        var existing = await FindAsync(scope, key, ct);
        if (existing is not null) return Replay(existing, hash, http);

        // 1. Claim the key (StatusCode = null means "in progress"), committed on its own.
        var record = new IdempotencyRecord { Scope = scope, Key = key, RequestHash = hash };
        db.Add(record);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost the race against a concurrent duplicate: the unique index said no.
            db.Entry(record).State = EntityState.Detached;
            var winner = await FindAsync(scope, key, ct);
            return winner is null
                ? Problem(StatusCodes.Status409Conflict, "idempotency.in_progress", "A request with this key is being processed")
                : Replay(winner, hash, http);
        }

        // 2. Run the handler and store its response in ONE transaction (the handler joins it).
        try
        {
            return await db.InTransactionAsync(async () =>
            {
                var result = await next(ctx);
                var status = (result as IStatusCodeHttpResult)?.StatusCode ?? StatusCodes.Status200OK;
                if (status >= 500)
                {
                    db.Remove(record);   // a server failure is not an answer: free the key for a retry
                }
                else
                {
                    var value = (result as IValueHttpResult)?.Value;
                    record.StatusCode = status;
                    record.ResponseBody = value is null ? null : JsonSerializer.Serialize(value, value.GetType(), json.Value.SerializerOptions);
                }
                await db.SaveChangesAsync(ct);
                return result;
            }, ct);
        }
        catch
        {
            // Handler threw → its transaction rolled back. Release the claim, then let the exception handler answer.
            db.ChangeTracker.Clear();
            await db.Set<IdempotencyRecord>().Where(r => r.Id == record.Id).ExecuteDeleteAsync(CancellationToken.None);
            throw;
        }
    }

    private Task<IdempotencyRecord?> FindAsync(string scope, string key, CancellationToken ct) =>
        db.Set<IdempotencyRecord>().AsNoTracking().FirstOrDefaultAsync(r => r.Scope == scope && r.Key == key, ct);

    private static IResult Replay(IdempotencyRecord record, string hash, HttpContext http)
    {
        if (!string.Equals(record.RequestHash, hash, StringComparison.Ordinal))
            return Problem(StatusCodes.Status422UnprocessableEntity, "idempotency.payload_mismatch", $"This {IdempotencyHeaders.Key} was already used with a different payload");

        if (record.StatusCode is not { } status)
        {
            http.Response.Headers.RetryAfter = "1";
            return Problem(StatusCodes.Status409Conflict, "idempotency.in_progress", "A request with this key is being processed");
        }

        http.Response.Headers[IdempotencyHeaders.Replayed] = "true";
        return Results.Content(record.ResponseBody ?? "", status >= 400 ? "application/problem+json" : "application/json", Encoding.UTF8, status);
    }

    private string Hash(TRequest? request) =>
        Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, json.Value.SerializerOptions)));

    private static IResult Problem(int status, string code, string title) =>
        Results.Problem(statusCode: status, title: title, extensions: new Dictionary<string, object?> { ["code"] = code });
}
