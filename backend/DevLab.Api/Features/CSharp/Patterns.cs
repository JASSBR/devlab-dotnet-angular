using System.Globalization;

namespace DevLab.Api.Features.CSharp;

public sealed record ShippingOrder(string Country, decimal Total, bool Express);

/// <summary>
/// switch EXPRESSIONS return a value (no break, no fallthrough) and the compiler checks
/// exhaustiveness. Patterns test the SHAPE of a value — far beyond TypeScript's `switch (x)`.
/// </summary>
public static class Patterns
{
    // List patterns (C# 11): match on length and positions, `..` = "any slice".
    public static string DescribeList(int[] numbers) => numbers switch
    {
        [] => "empty",
        [var single] => $"one element: {single}",
        [0, ..] => "starts with 0",
        [var first, .., var last] when first == last => $"same first and last ({first})",
        [_, _, .. var rest] => $"{numbers.Length} elements, {rest.Length} after the first two",
    };

    // Relational + logical patterns: < > <= >= combined with and / or / not.
    public static string Classify(int n) => n switch
    {
        < 0 => "negative",
        0 => "zero",
        > 0 and < 10 => "small",
        >= 10 and < 100 => "medium",
        _ => "large",
    };

    // Property patterns: test several properties at once, first match wins (order matters!).
    public static decimal ShippingFee(ShippingOrder order) => order switch
    {
        { Express: true } => 15m,
        { Country: "FR", Total: >= 100 } => 0m,
        { Country: "FR" } => 4.90m,
        { Country: "BE" or "LU", Total: >= 150 } => 0m,
        { Total: < 50 } => 12m,
        _ => 8m,
    };

    // Type pattern with a declaration: the `is` + cast of TypeScript type guards, in one step.
    public static string Describe(object? value) => value switch
    {
        null => "null",
        int i when i % 2 == 0 => $"even int {i}",
        int i => $"odd int {i}",
        string { Length: 0 } => "empty string",
        string s => $"string of {s.Length} chars",
        _ => value.GetType().Name,
    };

    public static IReadOnlyList<Snippet> Run(int[] numbers, ShippingOrder order)
    {
        var sum = numbers.Sum();
        return
        [
            new("list pattern", $"[{string.Join(", ", numbers)}] switch {{ [] => …, [var x] => …, [0, ..] => …, [var f, .., var l] when f == l => … }}", DescribeList(numbers)),
            new("relational pattern", $"{sum} switch {{ < 0 => …, > 0 and < 10 => …, >= 10 and < 100 => … }}", Classify(sum)),
            new("property pattern", $"{order} switch {{ {{ Express: true }} => 15, {{ Country: \"FR\", Total: >= 100 }} => 0, … }}", ShippingFee(order).ToString(CultureInfo.InvariantCulture)),
            new("type pattern", "numbers.Length switch { int i when i % 2 == 0 => … }  // boxed to object", Describe(numbers.Length)),
        ];
    }
}
