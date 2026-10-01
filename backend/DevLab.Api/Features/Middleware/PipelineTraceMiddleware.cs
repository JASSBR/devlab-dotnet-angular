namespace DevLab.Api.Features.Middleware;

/// <summary>
/// Registered several times with a different label to record where in the
/// pipeline a request currently is. Shows that middleware runs in order on the
/// way "in" and in reverse order on the way "out".
/// The "out" half happens AFTER the response was written, so it cannot be part of
/// the same response: we keep it in a singleton and expose it on the next call.
/// </summary>
public sealed class PipelineTraceMiddleware(RequestDelegate next, string label, LastTraceStore lastTrace)
{
    public const string ItemsKey = "pipeline-trace";
    public const string Outermost = "after-exception-handler";

    public async Task InvokeAsync(HttpContext context)
    {
        var trace = GetTrace(context);
        trace.Add($"→ in : {label} (user={context.User.Identity?.Name ?? "anonymous"})");

        await next(context);

        trace.Add($"← out: {label} (status={context.Response.StatusCode})");

        if (label == Outermost && context.Request.Path == "/api/middleware/trace")
            lastTrace.Save(trace);
    }

    public static List<string> GetTrace(HttpContext context)
    {
        if (context.Items[ItemsKey] is List<string> existing) return existing;
        var list = new List<string>();
        context.Items[ItemsKey] = list;
        return list;
    }
}

/// <summary>Singleton (shared by all requests) → must be thread-safe.</summary>
public sealed class LastTraceStore
{
    private volatile IReadOnlyList<string> _last = [];
    public IReadOnlyList<string> Last => _last;
    public void Save(List<string> trace) => _last = trace.ToArray();
}
