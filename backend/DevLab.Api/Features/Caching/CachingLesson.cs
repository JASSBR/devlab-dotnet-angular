using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.Caching.Memory;

namespace DevLab.Api.Features.Caching;

public record ExpensiveResult(string Value, DateTimeOffset ComputedAt, string Source);
public record FactoryStats(string Key, int FactoryRuns);
public record StampedeReport(string Mode, string Key, int Requests, int FactoryRuns, long ElapsedMs);

/// <summary>How many times each cache key's factory really ran — the stampede demo's proof.</summary>
public sealed class FactoryCounter
{
    private const int MaxKeys = 1000;
    private readonly ConcurrentDictionary<string, int> _runs = new(StringComparer.Ordinal);

    public void Increment(string key)
    {
        if (_runs.Count > MaxKeys) _runs.Clear();   // demo keys are random: stay bounded
        _runs.AddOrUpdate(key, 1, (_, n) => n + 1);
    }

    public int Get(string key) => _runs.GetValueOrDefault(key);
}

public static class CachingLesson
{
    private const string GreetingsTag = "greetings";
    private const int StampedeRequests = 10;

    public static IServiceCollection AddCachingLesson(this IServiceCollection services)
    {
        services.AddMemoryCache();

        // HybridCache: L1 in-memory + optional L2 (any IDistributedCache registered, e.g. Redis),
        // with stampede protection and tags. No L2 here → L1 only, same API.
        services.AddHybridCache(o => o.DefaultEntryOptions = new HybridCacheEntryOptions
        {
            Expiration = TimeSpan.FromSeconds(30),            // L2 (and L1 by default)
            LocalCacheExpiration = TimeSpan.FromSeconds(30),  // L1
        });
        services.AddSingleton<FactoryCounter>();

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

        // 4. HybridCache: same cache-aside call, but concurrent misses on one key share ONE factory run.
        group.MapGet("/hybrid", async (string name, HybridCache cache, FactoryCounter counter, CancellationToken ct) =>
            await cache.GetOrCreateAsync($"hybrid:{name}", async _ =>
            {
                counter.Increment($"hybrid:{name}");
                return await ComputeAsync(name, "computed → stored in HybridCache");
            }, tags: [GreetingsTag], cancellationToken: ct));

        group.MapGet("/hybrid/stats", (string name, FactoryCounter counter) =>
            TypedResults.Ok(new FactoryStats($"hybrid:{name}", counter.Get($"hybrid:{name}"))));

        // Tag invalidation: every entry tagged "greetings" is gone (L1 + L2), whatever its key.
        group.MapDelete("/hybrid/tags/{tag}", async (string tag, HybridCache cache, CancellationToken ct) =>
        {
            await cache.RemoveByTagAsync(tag, ct);
            return TypedResults.NoContent();
        });

        // Stampede: 10 concurrent reads of a fresh (uncached) key. IMemoryCache.GetOrCreateAsync has
        // no lock → each miss runs the factory. HybridCache coalesces them → 1 run, 9 waiters.
        group.MapPost("/stampede", async Task<IResult> (string mode, HybridCache hybrid, IMemoryCache memory, FactoryCounter counter) =>
        {
            if (mode is not ("hybrid" or "memory"))
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>(StringComparer.Ordinal) { ["mode"] = ["Expected hybrid or memory."] });

            var key = $"stampede:{mode}:{Guid.NewGuid():N}";
            async Task<ExpensiveResult> Factory()
            {
                counter.Increment(key);
                return await ComputeAsync(key, $"computed by the {mode} factory");
            }

            var sw = Stopwatch.StartNew();
            await Task.WhenAll(Enumerable.Range(0, StampedeRequests).Select(async _ => mode == "hybrid"
                ? await hybrid.GetOrCreateAsync(key, async _ => await Factory())
                : await memory.GetOrCreateAsync(key, async e =>
                {
                    e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10);
                    return await Factory();
                })));
            return TypedResults.Ok(new StampedeReport(mode, key, StampedeRequests, counter.Get(key), sw.ElapsedMilliseconds));
        });

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
