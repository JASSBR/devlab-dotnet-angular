namespace DevLab.Api.Features.Greetings;

/// <summary>Minimal API style: a lambda mapped on a route. Compare with GreetingsController.</summary>
public static class GreetingsEndpoints
{
    public static IEndpointRouteBuilder MapGreetingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/greet").WithTags("Greetings");

        // Route param + query param + DI (TimeProvider) all bound by convention.
        group.MapGet("/minimal/{name}", (string name, string? lang, TimeProvider clock) =>
        {
            var hello = lang == "fr" ? "Bonjour" : "Hello";
            return TypedResults.Ok(new Greeting($"{hello}, {name}!", "minimal-api", clock.GetUtcNow()));
        })
        .WithName("GreetMinimal");

        return app;
    }
}

public record Greeting(string Message, string Style, DateTimeOffset At);
