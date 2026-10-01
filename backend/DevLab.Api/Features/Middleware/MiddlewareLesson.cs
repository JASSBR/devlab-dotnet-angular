using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace DevLab.Api.Features.Middleware;

/// <summary>
/// Turns any unhandled exception into an RFC 9457 ProblemDetails response.
/// Plugged in by app.UseExceptionHandler() — no try/catch in endpoints.
/// </summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment env) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        logger.LogError(ex, "Unhandled exception on {Path}", ctx.Request.Path);

        var (status, title) = ex switch
        {
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
            UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Forbidden"),
            _ => (StatusCodes.Status500InternalServerError, "Unexpected server error"),
        };

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            // Never leak stack traces in production — this is the "detail" rule.
            Detail = env.IsDevelopment() ? ex.Message : null,
            Instance = ctx.Request.Path,
        };
        problem.Extensions["traceId"] = ctx.TraceIdentifier;

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(problem, ct);
        return true; // handled
    }
}

public static class MiddlewareLesson
{
    public static IServiceCollection AddMiddlewareLesson(this IServiceCollection services)
    {
        services.AddProblemDetails();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddSingleton<LastTraceStore>();
        return services;
    }

    public static IEndpointRouteBuilder MapMiddlewareEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/middleware").WithTags("Middleware");

        // Returns the trace that the PipelineTraceMiddleware instances collected.
        group.MapGet("/trace", (HttpContext ctx, LastTraceStore last) =>
        {
            var trace = PipelineTraceMiddleware.GetTrace(ctx);
            trace.Add("● endpoint executed → response written");
            return TypedResults.Ok(new
            {
                current = trace.ToArray(),          // the "in" half of THIS request
                previousRequestFull = last.Last,    // in + out halves of the previous request
                elapsedHeader = ctx.Response.Headers.ContainsKey("X-Elapsed-Ms") ? "set" : "X-Elapsed-Ms is added by RequestTimingMiddleware.OnStarting",
            });
        });

        // Throws on purpose → GlobalExceptionHandler produces a ProblemDetails.
        group.MapGet("/boom", (string? kind) =>
        {
            throw kind switch
            {
                "notfound" => new KeyNotFoundException("Product 42 does not exist"),
                "forbidden" => new UnauthorizedAccessException("You cannot touch this"),
                _ => new InvalidOperationException("Something exploded in the domain layer"),
            };
        });

        // Inline middleware: app.Use with a lambda, scoped to this endpoint via a filter.
        group.MapGet("/short-circuit", () => TypedResults.Ok("You will never see this"))
             .AddEndpointFilter(async (ctx, next) =>
             {
                 // Filters are the Minimal-API equivalent of MVC action filters.
                 if (ctx.HttpContext.Request.Query.ContainsKey("stop"))
                     return Results.Json(new { message = "Short-circuited by an endpoint filter" }, statusCode: 418);
                 return await next(ctx);
             });

        return app;
    }
}
