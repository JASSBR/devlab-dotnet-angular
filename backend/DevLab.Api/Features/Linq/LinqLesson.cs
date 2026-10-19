using DevLab.Api.Features.CSharp;

namespace DevLab.Api.Features.Linq;

public sealed record SampleOrder(int Id, string Customer, string Category, decimal Amount);

/// <summary>
/// Collections + LINQ to Objects, executed for real. For IQueryable (LINQ translated
/// to SQL by EF Core), see the ef-core lesson: same operators, different engine.
/// </summary>
public static class LinqLesson
{
    private static readonly SampleOrder[] Orders =
    [
        new(1, "Ada", "Books", 30m),
        new(2, "Linus", "Hardware", 450m),
        new(3, "Ada", "Hardware", 120m),
        new(4, "Grace", "Books", 15m),
        new(5, "Linus", "Books", 60m),
        new(6, "Grace", "Training", 900m),
    ];

    public static IEndpointRouteBuilder MapLinqEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/linq").WithTags("Collections & LINQ");

        group.MapGet("/collections", (string? key) => CollectionsLab.Run(key ?? "fr"));
        group.MapGet("/hashset-vs-list", (int? n) => CollectionsLab.Benchmark(n ?? 10_000));
        group.MapGet("/deferred", DeferredExecution.Run);
        group.MapGet("/operators", Operators);

        return app;
    }

    private static IReadOnlyList<Snippet> Operators()
    {
        static string Show(IEnumerable<object> items) => string.Join(", ", items);

        var byCategory = Orders
            .GroupBy(o => o.Category)
            .Select(g => $"{g.Key}: {g.Count()} × {CollectionsLab.Fmt(g.Sum(o => o.Amount))}");

        return
        [
            new("Where + Select", "Orders.Where(o => o.Amount > 100).Select(o => o.Id)", Show(Orders.Where(o => o.Amount > 100).Select(o => (object)o.Id))),
            new("OrderBy + ThenBy", "Orders.OrderBy(o => o.Customer).ThenByDescending(o => o.Amount).Select(o => o.Id)", Show(Orders.OrderBy(o => o.Customer, StringComparer.Ordinal).ThenByDescending(o => o.Amount).Select(o => (object)o.Id))),
            new("GroupBy", "Orders.GroupBy(o => o.Category).Select(g => $\"{g.Key}: {g.Count()} × {g.Sum(o => o.Amount)}\")", Show(byCategory)),
            new("Any", "Orders.Any(o => o.Amount > 500)", Orders.Any(o => o.Amount > 500).ToString()),
            new("All", "Orders.All(o => o.Amount > 20)", Orders.All(o => o.Amount > 20).ToString()),
            new("First", "Orders.First(o => o.Customer == \"Bob\")", Try(() => Orders.First(o => o.Customer == "Bob").ToString())),
            new("FirstOrDefault", "Orders.FirstOrDefault(o => o.Customer == \"Bob\")", Orders.FirstOrDefault(o => o.Customer == "Bob")?.ToString() ?? "(null)"),
            new("Single", "Orders.Single(o => o.Customer == \"Ada\")   // 2 matches", Try(() => Orders.Single(o => o.Customer == "Ada").ToString())),
            new("ToDictionary", "Orders.ToDictionary(o => o.Id)[3]", Orders.ToDictionary(o => o.Id)[3].ToString()),
            new("ToDictionary (duplicate key)", "Orders.ToDictionary(o => o.Customer)", Try(() => Orders.ToDictionary(o => o.Customer, StringComparer.Ordinal).Count.ToString(System.Globalization.CultureInfo.InvariantCulture))),
            new("Chunk", "Enumerable.Range(1, 7).Chunk(3)", string.Join(" ", Enumerable.Range(1, 7).Chunk(3).Select(c => $"[{string.Join(", ", c)}]"))),
            new("Sum / Max / Average", "Orders.Sum(o => o.Amount), Max, Average", $"{CollectionsLab.Fmt(Orders.Sum(o => o.Amount))} / {CollectionsLab.Fmt(Orders.Max(o => o.Amount))} / {CollectionsLab.Fmt(Math.Round(Orders.Average(o => o.Amount), 2))}"),
        ];
    }

    // Exceptions are part of the lesson: First and Single throw, *OrDefault variants do not.
    private static string Try(Func<string> run)
    {
        try
        {
            return run();
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            return $"{ex.GetType().Name}: {ex.Message}";
        }
    }
}
