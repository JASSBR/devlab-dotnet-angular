using System.Diagnostics;

namespace DevLab.Api.Features.Middleware;

/// <summary>
/// Convention-based middleware: a constructor taking RequestDelegate and an
/// InvokeAsync(HttpContext). Wraps the rest of the pipeline in a stopwatch and
/// writes the result as a response header (must be registered before headers are sent).
/// </summary>
public sealed class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();

        // OnStarting runs right before the response headers are flushed.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Elapsed-Ms"] = sw.ElapsedMilliseconds.ToString();
            return Task.CompletedTask;
        });

        await next(context); // ← everything after us in the pipeline runs here

        logger.LogInformation("{Method} {Path} → {Status} in {Ms} ms",
            context.Request.Method, context.Request.Path, context.Response.StatusCode, sw.ElapsedMilliseconds);
    }
}
