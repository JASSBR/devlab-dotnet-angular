using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace DevLab.Api.Features.CSharp;

/// <summary>Variables, methods, loops and nullable reference types — the daily syntax.</summary>
public static class BasicsLab
{
    // Optional parameter with a default + expression-bodied member (`=>` instead of { return …; }).
    public static string FormatPrice(decimal price, string currency = "EUR", int decimals = 2) =>
        $"{price.ToString($"F{decimals}", CultureInfo.InvariantCulture)} {currency}";

    // `out`: a second return value. Idiomatic for the Try-pattern (no exception on failure).
    public static bool TryParsePositive(string input, out int value) =>
        int.TryParse(input, NumberStyles.Integer, CultureInfo.InvariantCulture, out value) && value > 0;

    public static IReadOnlyList<Snippet> Run()
    {
        // `var` is NOT `any`: the type is inferred at compile time and fixed forever.
        var total = 0m;                          // decimal (m suffix) — money is never double
        var names = new List<string> { "Ada", "Linus" };

        var parsed = TryParsePositive("42", out var answer);

        // Loops: for / foreach / while exist as in TS; foreach works on any IEnumerable<T>.
        var sum = 0;
        foreach (var n in Enumerable.Range(1, 10))
        {
            if (n % 2 == 0) continue;
            sum += n;
        }

        // Nullable reference types: `string?` may be null, `string` may not. The compiler
        // tracks it (like strictNullChecks) — but it is a compile-time warning, not a runtime check.
        string? nickname = null;
        var length = nickname?.Length ?? 0;      // ?. and ?? behave exactly like in TypeScript
        nickname ??= "anonymous";

        return
        [
            new("var", "var total = 0m; total.GetType()", total.GetType().FullName ?? "?"),
            new("target-typed new", "List<string> names = new() { … }  // or collection expression [\"Ada\", \"Linus\"]", $"Count = {names.Count}"),
            new("optional parameters", "FormatPrice(12.5m)", FormatPrice(12.5m)),
            new("named arguments", "FormatPrice(12.5m, currency: \"USD\")", FormatPrice(12.5m, currency: "USD")),
            new("out", "TryParsePositive(\"42\", out var answer)", $"{parsed} → {answer}"),
            new("foreach + continue", "sum of odd numbers in 1..10", sum.ToString(CultureInfo.InvariantCulture)),
            new("null-conditional", "string? nickname = null; nickname?.Length ?? 0", length.ToString(CultureInfo.InvariantCulture)),
            new("null-coalescing assignment", "nickname ??= \"anonymous\"", nickname),
        ];
    }
}

[Flags]
public enum Permissions
{
    None = 0,
    Read = 1,        // 0001
    Write = 2,       // 0010
    Delete = 4,      // 0100
    Admin = Read | Write | Delete,
}

public record FlagsDemo(int Value, string Binary, string Name, bool CanWrite, bool CanDelete, bool IsAdmin);

public static class FlagsLab
{
    // Enum.TryParse accepts "Read,Write" for [Flags] enums — but also any number ("99").
    // The mask check rejects bits that no member defines.
    public static bool TryParse(string input, out Permissions permissions) =>
        Enum.TryParse(input, ignoreCase: true, out permissions)
        && !int.TryParse(input, CultureInfo.InvariantCulture, out _)
        && (permissions & ~Permissions.Admin) == Permissions.None;

    public static FlagsDemo Describe(Permissions p) => new(
        (int)p,
        Convert.ToString((int)p, 2).PadLeft(4, '0'),
        p.ToString(),
        p.HasFlag(Permissions.Write),
        (p & Permissions.Delete) != Permissions.None,             // what HasFlag does, with a bitwise AND
        p == Permissions.Admin);
}

public record StringsDemo(int N, double ConcatMs, double BuilderMs, int ConcatLength, int BuilderLength, IReadOnlyList<Snippet> Snippets);

public static class StringsLab
{
    public const int MaxN = 20_000;

    public static StringsDemo Run(int n)
    {
        n = Math.Clamp(n, 1, MaxN);

        // Strings are IMMUTABLE: `+=` allocates a brand new string and copies everything → O(n²).
        var sw = Stopwatch.StartNew();
        var concat = string.Empty;
#pragma warning disable S1643 // the slow version IS the lesson: we measure it against StringBuilder
        for (var i = 0; i < n; i++) concat += "x";
#pragma warning restore S1643
        var concatMs = sw.Elapsed.TotalMilliseconds;

        // StringBuilder: one growable buffer, amortised O(n).
        sw.Restart();
        var builder = new StringBuilder();
        for (var i = 0; i < n; i++) builder.Append('x');
        var built = builder.ToString();
        var builderMs = sw.Elapsed.TotalMilliseconds;

        var greeting = "hello";
        _ = greeting.ToUpperInvariant();   // returns a NEW string; `greeting` is unchanged

        const string name = "Ada";
        // Raw string literal (C# 11): no escaping, indentation stripped, $$ → {{ }} for interpolation.
        var json = $$"""
            { "name": "{{name}}", "tags": ["c#", "ts"] }
            """;

        return new StringsDemo(n, Math.Round(concatMs, 3), Math.Round(builderMs, 3), concat.Length, built.Length,
        [
            new("immutability", "var s = \"hello\"; s.ToUpperInvariant(); s", greeting),
            new("interpolation", "$\"{name,-6}|{3.14159:F2}|{DateOnly.MinValue:yyyy}\"", string.Create(CultureInfo.InvariantCulture, $"{name,-6}|{3.14159:F2}|{DateOnly.MinValue:yyyy}")),
            new("raw string literal", "$$\"\"\" { \"name\": \"{{name}}\" } \"\"\"", json),
            new("verbatim", "@\"C:\\Users\\ada\\notes.txt\"", @"C:\Users\ada\notes.txt"),
            new("comparison", "string.Equals(\"ADA\", \"ada\", StringComparison.OrdinalIgnoreCase)", string.Equals("ADA", "ada", StringComparison.OrdinalIgnoreCase).ToString()),
        ]);
    }
}
