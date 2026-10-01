using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;

namespace DevLab.Api.Features.Caching;

public record ExpensiveResult(string Value, DateTimeOffset ComputedAt, string Source);

public static class CachingLesson
{
    public static IServiceCollection AddCachingLesson(this IServiceCollection services)
    {
        services.AddMemoryCache();

        // Output caching: the whole HTTP response is stored server-side.
        services.AddOutputCache(o =>
            o.AddPolicy("ten-seconds", p => p.Expire(TimeSpan.FromSeconds(10)).SetVaryByQuery("name")));

        // Rate limiting: 5 requests per 10 s window, per client IP. Extra requests → 429.
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy("strict", ctx => RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromSeconds(10),
                    QueueLimit = 0,
                }));
            o.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.Headers.RetryAfter = "10";
                await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "Too many requests, retry in 10 s" }, ct);
            };
        });
        return services;
    }

    public static IEndpointRouteBuilder MapCachingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cache").WithTags("Caching");

        // 1. No cache: always slow.
        group.MapGet("/none", async (string name) => await ComputeAsync(name, "computed (no cache)"));

        // 2. IMemoryCache: cache-aside inside the handler, fine-grained control.
        group.MapGet("/memory", async (string name, IMemoryCache cache) =>
            await cache.GetOrCreateAsync($"expensive:{name}", async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10);
                entry.SlidingExpiration = TimeSpan.FromSeconds(5);
                return await ComputeAsync(name, "computed → stored in IMemoryCache");
            }));

        // 3. Output cache: the framework caches the serialized response; handler never runs on hit.
        group.MapGet("/output", async (string name) => await ComputeAsync(name, "computed → response cached"))
             .CacheOutput("ten-seconds");

        app.MapGet("/api/ratelimit/ping", () => TypedResults.Ok(new { pong = DateTimeOffset.UtcNow }))
           .RequireRateLimiting("strict")
           .WithTags("Caching");

        return app;
    }

    private static async Task<ExpensiveResult> ComputeAsync(string name, string source)
    {
        await Task.Delay(1200); // simulate a slow DB / external API
        return new ExpensiveResult($"Hello {name}", DateTimeOffset.UtcNow, source);
    }
}
