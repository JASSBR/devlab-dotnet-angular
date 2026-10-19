using System.Diagnostics;
using Microsoft.Extensions.Http.Resilience;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;

namespace DevLab.Api.Features.Resilience;

public record RunRequest(string Pipeline, int Calls);
public record CallReport(int Index, bool Success, string Outcome, long ElapsedMs, IReadOnlyList<AttemptReport> Attempts);
public record RunReport(string Pipeline, IReadOnlyList<CallReport> Calls, double SuccessRate, long P50Ms, long P95Ms, string Circuit);
public record ResilienceState(FlakyConfig Config, long FlakyCalls, IReadOnlyDictionary<string, string> Circuits, IReadOnlyList<ResilienceEvent> Events);

/// <summary>
/// Three HttpClients call the same flaky endpoint (hosted by this app) through three pipelines:
/// none, the standard handler, and a hand-built one. Same dependency, compared live.
/// </summary>
public static class ResilienceLesson
{
    private const string NoneClient = "resilience-none";
    private const string StandardClient = "resilience-standard";
    private const string CustomClient = "resilience-custom";
    private const int MaxCalls = 20;

    public static IServiceCollection AddResilienceLesson(this IServiceCollection services)
    {
        services.AddSingleton<FlakyEndpointState>();
        services.AddSingleton<ResilienceEventLog>();
        services.AddSingleton<ResilienceCircuits>();
        services.AddTransient<AttemptRecorderHandler>();

        // 1. No resilience: the first 503 or slow answer goes straight to the caller.
        services.AddHttpClient(NoneClient, ConfigureSelf)
                .AddHttpMessageHandler<AttemptRecorderHandler>();

        // 2. The standard handler: 5 strategies, production defaults, tuned here for a visible demo.
        //    Order (outer → inner): rate limiter → total timeout → retry → circuit breaker → attempt timeout.
        var standard = services.AddHttpClient(StandardClient, ConfigureSelf);
        standard.AddStandardResilienceHandler().Configure((o, sp) =>
        {
            var circuits = sp.GetRequiredService<ResilienceCircuits>();
            var log = sp.GetRequiredService<ResilienceEventLog>();

            o.RateLimiter.DefaultRateLimiterOptions.PermitLimit = 50;        // concurrent requests (default 1000)
            o.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(6);          // whole budget, retries included (default 30 s)
            o.Retry.MaxRetryAttempts = 3;                                    // default 3
            o.Retry.Delay = TimeSpan.FromMilliseconds(200);                  // default 2 s, exponential + jitter
            o.Retry.DisableForUnsafeHttpMethods();                           // never replay a POST blindly
            o.Retry.OnRetry = args => OnRetry(log, "standard", args);
            o.CircuitBreaker.FailureRatio = 0.5;                             // default 10 %
            o.CircuitBreaker.MinimumThroughput = 5;                          // default 100
            o.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(10);    // must be ≥ 2 × attempt timeout
            o.CircuitBreaker.BreakDuration = TimeSpan.FromSeconds(5);
            o.CircuitBreaker.StateProvider = circuits.StandardState;
            o.CircuitBreaker.ManualControl = circuits.StandardControl;
            o.CircuitBreaker.OnOpened = args => Log(log, "standard", "circuit-opened", $"open for {args.BreakDuration.TotalSeconds:0} s");
            o.CircuitBreaker.OnHalfOpened = _ => Log(log, "standard", "circuit-half-open", "next call is a probe");
            o.CircuitBreaker.OnClosed = _ => Log(log, "standard", "circuit-closed", "dependency healthy again");
            o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(1);              // per try (default 10 s)
        });
        standard.AddHttpMessageHandler<AttemptRecorderHandler>();             // innermost: sees every attempt

        // 3. Hand-built pipeline: same building blocks, our order, our callbacks.
        var custom = services.AddHttpClient(CustomClient, ConfigureSelf);
        custom.AddResilienceHandler("custom", (b, ctx) =>
        {
            var circuits = ctx.ServiceProvider.GetRequiredService<ResilienceCircuits>();
            var log = ctx.ServiceProvider.GetRequiredService<ResilienceEventLog>();

            var retry = new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = 4,
                Delay = TimeSpan.FromMilliseconds(100),
                BackoffType = DelayBackoffType.Exponential,                  // 100, 200, 400, 800 ms…
                UseJitter = true,                                            // …± random: no synchronized retry storm
                OnRetry = args => OnRetry(log, "custom", args),
            };
            retry.DisableForUnsafeHttpMethods();

            b.AddTimeout(TimeSpan.FromSeconds(5))                            // total budget
             .AddRetry(retry)
             .AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
             {
                 FailureRatio = 0.5,                                         // ≥ 50 % failures…
                 MinimumThroughput = 4,                                      // …over at least 4 calls…
                 SamplingDuration = TimeSpan.FromSeconds(10),                // …in a 10 s window → open
                 BreakDuration = TimeSpan.FromSeconds(5),                    // then half-open: one probe
                 StateProvider = circuits.CustomState,
                 ManualControl = circuits.CustomControl,
                 OnOpened = args => Log(log, "custom", "circuit-opened", $"open for {args.BreakDuration.TotalSeconds:0} s"),
                 OnHalfOpened = _ => Log(log, "custom", "circuit-half-open", "next call is a probe"),
                 OnClosed = _ => Log(log, "custom", "circuit-closed", "dependency healthy again"),
             })
             .AddTimeout(TimeSpan.FromMilliseconds(800));                    // per attempt (inside the retry)
        });
        custom.AddHttpMessageHandler<AttemptRecorderHandler>();

        return services;
    }

    public static IEndpointRouteBuilder MapResilienceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/resilience").WithTags("Resilience");

        // The "remote dependency": fails or lags according to the configuration below.
        group.MapGet("/flaky", async (FlakyEndpointState state, CancellationToken ct) =>
        {
            var (latency, fail) = state.NextCall();
            if (latency > 0) await Task.Delay(latency, ct);
            if (!fail) return Results.Ok(new { ok = true, at = DateTimeOffset.UtcNow });
            var status = state.Calls % 2 == 0 ? StatusCodes.Status503ServiceUnavailable : StatusCodes.Status500InternalServerError;
            return Results.Problem(statusCode: status, title: "Simulated transient failure");
        });

        group.MapPut("/flaky/config", (FlakyConfig config, FlakyEndpointState state) => TypedResults.Ok(state.Update(config)));

        group.MapGet("/state", (FlakyEndpointState state, ResilienceCircuits circuits, ResilienceEventLog log) =>
            TypedResults.Ok(new ResilienceState(state.Config, state.Calls, circuits.States, log.Recent)));

        group.MapPost("/reset", async (FlakyEndpointState state, ResilienceCircuits circuits, ResilienceEventLog log) =>
        {
            state.Reset();
            await circuits.CloseAllAsync();
            log.Clear();
            return TypedResults.NoContent();
        });

        group.MapPost("/run", async Task<IResult> (RunRequest request, IHttpClientFactory factory, ResilienceCircuits circuits, CancellationToken ct) =>
        {
            var clientName = request.Pipeline switch
            {
                "none" => NoneClient,
                "standard" => StandardClient,
                "custom" => CustomClient,
                _ => null,
            };
            if (clientName is null)
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["pipeline"] = ["Expected none, standard or custom."],
                });

            var client = factory.CreateClient(clientName);
            var calls = new List<CallReport>();
            for (var i = 1; i <= Math.Clamp(request.Calls, 1, MaxCalls); i++)
                calls.Add(await CallOnceAsync(client, i, ct));

            var sorted = calls.Select(c => c.ElapsedMs).Order().ToArray();
            var circuit = request.Pipeline == "none" ? "n/a" : circuits.States[request.Pipeline];
            return TypedResults.Ok(new RunReport(
                request.Pipeline, calls,
                Math.Round((double)calls.Count(c => c.Success) / calls.Count, 3),
                Percentile(sorted, 0.50), Percentile(sorted, 0.95), circuit));
        });

        return app;
    }

    private static async Task<CallReport> CallOnceAsync(HttpClient client, int index, CancellationToken ct)
    {
        var recorder = new CallRecorder();
        CallRecorder.Current = recorder;
        var sw = Stopwatch.StartNew();
        string outcome;
        var success = false;
        try
        {
            using var response = await client.GetAsync(new Uri("/api/resilience/flaky", UriKind.Relative), ct);
            success = response.IsSuccessStatusCode;
            outcome = success ? "ok" : ((int)response.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        catch (BrokenCircuitException)
        {
            // Rejected in microseconds, without touching the dependency: that is the point.
            recorder.AddAttempt("circuit-open", 0);
            outcome = "circuit-open";
        }
        catch (TimeoutRejectedException)
        {
            outcome = "timeout";
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            outcome = "timeout";                                             // HttpClient.Timeout (no pipeline)
        }
        catch (HttpRequestException)
        {
            outcome = "network-error";
        }
        finally
        {
            CallRecorder.Current = null;
        }
        return new CallReport(index, success, outcome, sw.ElapsedMilliseconds, recorder.Attempts);
    }

    private static void ConfigureSelf(IServiceProvider sp, HttpClient client)
    {
        client.BaseAddress = SelfBaseAddress.Resolve(sp);
        client.Timeout = TimeSpan.FromSeconds(10);
    }

    private static ValueTask OnRetry(ResilienceEventLog log, string pipeline, OnRetryArguments<HttpResponseMessage> args)
    {
        var failure = Describe(args.Outcome);
        CallRecorder.Current?.SetRetryDelay(args.RetryDelay, failure);
        log.Add(pipeline, "retry", $"attempt {args.AttemptNumber + 1} → {failure}, retry in {args.RetryDelay.TotalMilliseconds:0} ms");
        return default;
    }

    private static ValueTask Log(ResilienceEventLog log, string pipeline, string kind, string detail)
    {
        log.Add(pipeline, kind, detail);
        return default;
    }

    private static string Describe(Outcome<HttpResponseMessage> outcome) => outcome.Exception switch
    {
        TimeoutRejectedException => "timeout",
        BrokenCircuitException => "circuit-open",
        { } ex => ex.GetType().Name,
        null => ((int)outcome.Result!.StatusCode).ToString(System.Globalization.CultureInfo.InvariantCulture),
    };

    private static long Percentile(long[] sorted, double p) =>
        sorted.Length == 0 ? 0 : sorted[Math.Clamp((int)Math.Ceiling(p * sorted.Length) - 1, 0, sorted.Length - 1)];
}
