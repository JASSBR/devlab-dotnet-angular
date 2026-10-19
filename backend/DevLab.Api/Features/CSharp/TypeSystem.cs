namespace DevLab.Api.Features.CSharp;

// ── Generics with constraints ────────────────────────────────────────────────
// `where T : IComparable<T>` is TypeScript's `<T extends Comparable<T>>` — except C# generics
// are REIFIED: List<int> and List<string> are distinct runtime types, no type erasure.
public static class Generic
{
    public static T Max<T>(IEnumerable<T> items) where T : IComparable<T>
    {
        using var e = items.GetEnumerator();
        if (!e.MoveNext()) throw new InvalidOperationException("Sequence is empty.");
        var max = e.Current;
        while (e.MoveNext())
            if (e.Current.CompareTo(max) > 0) max = e.Current;
        return max;
    }
}

public interface IEntity
{
    int Id { get; }
}

// Several constraints: a class, implementing IEntity, with a parameterless constructor.
public sealed class InMemoryRepository<T> where T : class, IEntity, new()
{
    private readonly Dictionary<int, T> _items = [];

    public void Add(T item) => _items[item.Id] = item;
    public T? Find(int id) => _items.GetValueOrDefault(id);
    public T GetOrDefault(int id) => Find(id) ?? new T();
}

public sealed class Customer : IEntity
{
    public int Id { get; init; }
    public string Name { get; init; } = "(unknown)";
}

// ── Interfaces with a default member (C# 8) ──────────────────────────────────
public interface IGreeter
{
    string Name { get; }
    // Default implementation: implementers get it for free, and may override it.
    string Greet() => $"Hello, {Name}!";
}

public sealed class Person(string name) : IGreeter
{
    public string Name { get; } = name;
}

// ── Inheritance vs composition ───────────────────────────────────────────────
// Inheritance: Penguin IS-A Bird, so it inherits Fly()… which it cannot honour.
// Overriding it to throw breaks every caller that trusted the base type (Liskov).
public class Bird
{
    public virtual string Fly() => "flies";
}

public sealed class InheritedPenguin : Bird
{
    public override string Fly() => throw new NotSupportedException("Penguins cannot fly.");
}

// Composition: a bird HAS-A way to move and a sound. Behaviours are small, swappable,
// testable alone, and a new combination needs no new subclass.
public interface IMoveBehavior { string Move(); }
public interface ISoundBehavior { string Sound(); }

public sealed class Flying : IMoveBehavior { public string Move() => "flies"; }
public sealed class Waddling : IMoveBehavior { public string Move() => "waddles"; }
public sealed class Quack : ISoundBehavior { public string Sound() => "quacks"; }
public sealed class Honk : ISoundBehavior { public string Sound() => "honks"; }

public sealed class ComposedBird(string name, IMoveBehavior move, ISoundBehavior sound)
{
    public string Describe() => $"{name}: {move.Move()}, {sound.Sound()}";
}

public static class OopLab
{
    public static IReadOnlyList<Snippet> Run()
    {
        var repo = new InMemoryRepository<Customer>();
        repo.Add(new Customer { Id = 1, Name = "Ada" });

        IGreeter greeter = new Person("Ada");   // default members are reachable through the interface only

        var duck = new ComposedBird("Duck", new Flying(), new Quack());
        var penguin = new ComposedBird("Penguin", new Waddling(), new Honk());

        return
        [
            new("generic Max<int>", "Max([3, 9, 4])   // where T : IComparable<T>", Generic.Max([3, 9, 4]).ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new("generic Max<string>", "Max([\"apple\", \"pear\", \"fig\"])", Generic.Max(["apple", "pear", "fig"])),
            new("reified generics", "typeof(List<int>) == typeof(List<string>)", (typeof(List<int>) == typeof(List<string>)).ToString()),
            new("multiple constraints", "repo.Find(1)?.Name / repo.GetOrDefault(2).Name   // where T : class, IEntity, new()", $"{repo.Find(1)?.Name} / {repo.GetOrDefault(2).Name}"),
            new("default interface member", "IGreeter g = new Person(\"Ada\"); g.Greet()", greeter.Greet()),
            new("inheritance", "Bird b = new InheritedPenguin(); b.Fly()", TryFly(new InheritedPenguin())),
            new("composition", "new ComposedBird(\"Penguin\", new Waddling(), new Honk()).Describe()", penguin.Describe()),
            new("composition (reuse)", "new ComposedBird(\"Duck\", new Flying(), new Quack()).Describe()", duck.Describe()),
        ];
    }

    private static string TryFly(Bird bird)
    {
        try
        {
            return bird.Fly();
        }
        catch (NotSupportedException ex)
        {
            return $"{nameof(NotSupportedException)}: {ex.Message}";
        }
    }
}
