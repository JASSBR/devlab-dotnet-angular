using System.Globalization;

namespace DevLab.Api.Features.CSharp;

/// <summary>One line of a demo: the C# expression that ran, and what it produced.</summary>
public record Snippet(string Concept, string Code, string Result);

/// <summary>
/// Every endpoint below EXECUTES the C# it teaches and returns what happened.
/// No lesson service to register: the demos are pure functions.
/// </summary>
public static class CSharpLesson
{
    public static IEndpointRouteBuilder MapCSharpEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/csharp").WithTags("C# fundamentals");

        group.MapGet("/basics", BasicsLab.Run);
        group.MapGet("/struct-vs-class", ValueSemantics.Run);
        group.MapGet("/records", RecordsLab.Run);
        group.MapGet("/oop", OopLab.Run);

        group.MapGet("/patterns", (string? numbers, string? country, decimal? total, bool? express) =>
            Patterns.Run(ParseNumbers(numbers), new ShippingOrder(country ?? "FR", total ?? 0m, express ?? false)));

        group.MapGet("/exceptions", (decimal amount) => ErrorsLab.Run(amount));

        group.MapGet("/strings", (int? n) => StringsLab.Run(n ?? 5_000));

        group.MapGet("/flags", IResult (string? permissions) =>
            FlagsLab.TryParse(permissions ?? "None", out var parsed)
                ? TypedResults.Ok(FlagsLab.Describe(parsed))
                : TypedResults.Problem(
                    $"Unknown permission in '{permissions}'. Valid: {string.Join(", ", Enum.GetNames<Permissions>())}.",
                    statusCode: StatusCodes.Status400BadRequest));

        return app;
    }

    // "1, 2,x,3" → [1, 2, 3]: invalid entries are ignored, at most 20 numbers are kept.
    private static int[] ParseNumbers(string? csv) =>
        (csv ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? (int?)n : null)
            .OfType<int>()
            .Take(20)
            .ToArray();
}
