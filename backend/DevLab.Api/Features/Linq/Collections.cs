using System.Diagnostics;
using System.Globalization;
using DevLab.Api.Features.CSharp;

namespace DevLab.Api.Features.Linq;

// ── Exposing a collection safely ─────────────────────────────────────────────
// Returning the List<T> itself as IReadOnlyList<T> only hides the methods: a caller can
// cast it back and mutate your internal state. AsReadOnly() returns a wrapper that cannot.
public sealed class LeakyTeam
{
    private readonly List<string> _members = ["Ada", "Linus"];
    public IReadOnlyList<string> Members => _members;
}

public sealed class SafeTeam
{
    private readonly List<string> _members = ["Ada", "Linus"];
    public IReadOnlyList<string> Members => _members.AsReadOnly();

    // Mutations go through methods that can enforce invariants.
    public void Add(string member)
    {
        if (_members.Contains(member, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{member} is already in the team.");
        _members.Add(member);
    }
}

public record LookupBenchmark(int N, int Lookups, double ListMs, double HashSetMs, int ListHits, int HashSetHits, double Ratio);

public static class CollectionsLab
{
    public const int MaxN = 200_000;
    public const int Lookups = 1_000;

    private static readonly Dictionary<string, string> Countries = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fr"] = "France",
        ["be"] = "Belgique",
        ["ma"] = "Maroc",
    };

    public static IReadOnlyList<Snippet> Run(string key)
    {
        var leaky = new LeakyTeam();
        if (leaky.Members is List<string> hacked) hacked.Add("Mallory");   // the leak, exploited

        var safe = new SafeTeam();

        var found = Countries.TryGetValue(key, out var country);

        return
        [
            new("leaky IReadOnlyList", "leakyTeam.Members is List<string>   // then .Add(\"Mallory\")", (leaky.Members is List<string>).ToString()),
            new("leaky result", "leakyTeam.Members", string.Join(", ", leaky.Members)),
            new("AsReadOnly", "safeTeam.Members is List<string>   // ReadOnlyCollection<T> wrapper", (safe.Members is List<string>).ToString()),
            new("TryGetValue", $"Countries.TryGetValue(\"{key}\", out var country)", $"{found} → {country ?? "(null)"}"),
            new("GetValueOrDefault", $"Countries.GetValueOrDefault(\"{key}\", \"inconnu\")", Countries.GetValueOrDefault(key, "inconnu")),
            new("indexer", $"Countries[\"{key}\"]", Index(key)),
            new("comparer", "new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)[\"FR\"]", Countries["FR"]),
            new("HashSet.Add", "new HashSet<int> { 1, 2 }.Add(2)   // false: already present, no duplicate", new HashSet<int> { 1, 2 }.Add(2).ToString()),
        ];
    }

    private static string Index(string key)
    {
        try
        {
            return Countries[key];
        }
        catch (KeyNotFoundException ex)
        {
            return $"{nameof(KeyNotFoundException)}: {ex.Message}";
        }
    }

    /// <summary>
    /// List.Contains scans the list: O(n) per lookup. HashSet.Contains hashes the value and jumps
    /// to its bucket: O(1). Half of the probes miss on purpose — a miss is the worst case for a list.
    /// </summary>
    public static LookupBenchmark Benchmark(int n)
    {
        n = Math.Clamp(n, 1, MaxN);
        var list = Enumerable.Range(0, n).ToList();
        var set = list.ToHashSet();
        var probes = Enumerable.Range(0, Lookups).Select(i => i % 2 == 0 ? i * (n / Lookups + 1) % n : n + i).ToArray();

        var sw = Stopwatch.StartNew();
        var listHits = probes.Count(list.Contains);
        var listMs = sw.Elapsed.TotalMilliseconds;

        sw.Restart();
        var setHits = probes.Count(set.Contains);
        var setMs = sw.Elapsed.TotalMilliseconds;

        return new LookupBenchmark(n, Lookups, Math.Round(listMs, 3), Math.Round(setMs, 3), listHits, setHits,
            Math.Round(listMs / Math.Max(setMs, 0.001), 1));
    }

    internal static string Fmt(decimal d) => d.ToString(CultureInfo.InvariantCulture);
}
