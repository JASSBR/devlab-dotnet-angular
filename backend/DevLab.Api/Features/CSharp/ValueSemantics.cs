namespace DevLab.Api.Features.CSharp;

// ─────────────────────────────────────────────────────────────────────────────
// struct vs class: same shape, opposite semantics.
//  - struct = VALUE type: the variable IS the data. `b = a` copies every field.
//  - class  = REFERENCE type: the variable holds a pointer. `b = a` copies the pointer.
// TypeScript has only the second kind for objects ({ x: 1 } is always by reference).
// ─────────────────────────────────────────────────────────────────────────────

// Mutable on purpose so the copy is observable. In real code, prefer `readonly struct`.
public struct PointStruct
{
    public int X { get; set; }
}

public sealed class PointClass
{
    public int X { get; set; }
}

public record CopyScenario(string Kind, string Scenario, int OriginalBefore, int OriginalAfter, int CopyAfter);

public static class ValueSemantics
{
    public static IReadOnlyList<CopyScenario> Run()
    {
        // 1. Assignment
        var s1 = new PointStruct { X = 1 };
        var s2 = s1;          // copies the value
        s2.X = 99;

        var c1 = new PointClass { X = 1 };
        var c2 = c1;          // copies the reference: c1 and c2 point at ONE object
        c2.X = 99;

        // 2. Passing to a method: same rule, the parameter is a copy of the variable.
        var s3 = new PointStruct { X = 1 };
        var s3Inside = MoveStruct(s3);
        var c3 = new PointClass { X = 1 };
        var c3Inside = MoveClass(c3);

        return
        [
            new("struct", "assignment", 1, s1.X, s2.X),
            new("class", "assignment", 1, c1.X, c2.X),
            new("struct", "method argument", 1, s3.X, s3Inside),
            new("class", "method argument", 1, c3.X, c3Inside),
        ];
    }

    private static int MoveStruct(PointStruct p)
    {
        p.X += 41;            // modifies the method's private copy
        return p.X;
    }

    private static int MoveClass(PointClass p)
    {
        p.X += 41;            // modifies the caller's object through the reference
        return p.X;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Records: reference types with compiler-generated VALUE equality, ToString,
// deconstruction and non-destructive mutation (`with`). Ideal for DTOs.
// ─────────────────────────────────────────────────────────────────────────────
public sealed record Address(string Street, string City);

public sealed class AddressClass(string street, string city)
{
    public string Street { get; } = street;
    public string City { get; } = city;
}

public static class RecordsLab
{
    public static IReadOnlyList<Snippet> Run()
    {
        var a = new Address("1 rue de Rivoli", "Paris");
        var b = new Address("1 rue de Rivoli", "Paris");
        var moved = a with { City = "Lyon" };   // a new record; `a` is untouched

        var ca = new AddressClass("1 rue de Rivoli", "Paris");
        var cb = new AddressClass("1 rue de Rivoli", "Paris");

        return
        [
            new("record ==", "a == b   // two records, same values", (a == b).ToString()),
            new("ReferenceEquals", "ReferenceEquals(a, b)", ReferenceEquals(a, b).ToString()),
            new("class ==", "ca == cb   // two classes, same values", (ca == cb).ToString()),
            new("with", "a with { City = \"Lyon\" }", moved.ToString()),
            new("original after with", "a   // after the with", a.ToString()),
            new("deconstruction", "var (street, city) = a;", Deconstruct(a)),
        ];
    }

    private static string Deconstruct(Address address)
    {
        var (street, city) = address;
        return $"street = {street}, city = {city}";
    }
}
