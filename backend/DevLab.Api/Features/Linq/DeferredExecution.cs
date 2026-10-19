namespace DevLab.Api.Features.Linq;

public record Phase(string Step, string Code, IReadOnlyList<string> Trace);
public record DeferredDemo(IReadOnlyList<Phase> Phases);

/// <summary>
/// LINQ to Objects is LAZY: Where/Select build a pipeline of iterators, nothing runs until
/// someone pulls (foreach, ToList, Count, First…). Each pull travels the whole pipeline for
/// ONE element. TypeScript's array.filter().map() is the opposite: eager, one full array per step.
/// </summary>
public static class DeferredExecution
{
    // `yield return` turns a method into an iterator: the body runs piece by piece,
    // resumed each time the consumer calls MoveNext().
    private static IEnumerable<int> Source(List<string> log)
    {
        for (var i = 1; i <= 5; i++)
        {
            log.Add($"yield {i}");
            yield return i;
        }
    }

    private static IEnumerable<int> BuildQuery(List<string> log) =>
        Source(log)
            .Where(n => { log.Add($"  Where({n}) → {(n % 2 == 1 ? "kept" : "dropped")}"); return n % 2 == 1; })
            .Select(n => { log.Add($"    Select({n}) → {n * 10}"); return n * 10; });

    public static DeferredDemo Run()
    {
        var phases = new List<Phase>();
        var log = new List<string>();

        // 1. Defining the query: the log stays EMPTY.
        var query = BuildQuery(log);
        phases.Add(Snapshot("define", "var query = Source().Where(odd).Select(x10);", log));

        // 2. Enumerating pulls the elements one by one through Where then Select.
        _ = query.Sum();
        phases.Add(Snapshot("enumerate #1", "query.Sum();", log));

        // 3. Enumerating AGAIN re-runs everything: the multiple-enumeration pitfall.
        //    With an EF Core IQueryable, that would be a second SQL round-trip.
        _ = query.Count();
        phases.Add(Snapshot("enumerate #2", "query.Count();   // same query, enumerated again", log));

        // 4. First() short-circuits: it stops pulling as soon as one element comes out.
        _ = query.First();
        phases.Add(Snapshot("First()", "query.First();", log));

        // 5. ToList() materializes ONCE; the list is then read from memory, as often as needed.
        var list = query.ToList();
        _ = list.Sum() + list.Count;
        phases.Add(Snapshot("ToList + read twice", "var list = query.ToList(); list.Sum(); list.Count;", log));

        return new DeferredDemo(phases);
    }

    private static Phase Snapshot(string step, string code, List<string> log)
    {
        var phase = new Phase(step, code, [.. log]);
        log.Clear();
        return phase;
    }
}
