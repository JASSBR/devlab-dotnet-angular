using System.Buffers;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text;
using BenchmarkDotNet.Attributes;

namespace DevLab.Benchmarks;

// BenchmarkDotNet generates a derived class per benchmark type and calls the methods through it:
// benchmark types must be public and NOT sealed, methods public instance methods. Each method returns
// its result so the JIT cannot eliminate the work as dead code.
// [MemoryDiagnoser] adds the "Allocated" column (bytes per operation) and Gen0/Gen1/Gen2 collections per 1 000 ops.

/// <summary>CSV-line parsing: Substring + int.Parse(string) vs span slicing + int.Parse(span).</summary>
[MemoryDiagnoser]
public class ParsingBenchmarks
{
    private readonly string _line = "1042,7,250,2026,13,99,3,18";

#pragma warning disable CA1846 // the allocating Substring IS the baseline being measured
    [Benchmark(Baseline = true)]
    public long Substring()
    {
        long sum = 0;
        var start = 0;
        while (true)
        {
            var comma = _line.IndexOf(',', start);
            var field = comma < 0 ? _line.Substring(start) : _line.Substring(start, comma - start);
            sum += int.Parse(field, CultureInfo.InvariantCulture);
            if (comma < 0) return sum;
            start = comma + 1;
        }
    }
#pragma warning restore CA1846

    [Benchmark]
    public long Span()
    {
        long sum = 0;
        var line = _line.AsSpan();
        while (true)
        {
            var comma = line.IndexOf(',');
            sum += int.Parse(comma < 0 ? line : line[..comma], CultureInfo.InvariantCulture);
            if (comma < 0) return sum;
            line = line[(comma + 1)..];
        }
    }

    [Benchmark]
    public long Split()
    {
        long sum = 0;
        foreach (var field in _line.Split(','))
            sum += int.Parse(field, CultureInfo.InvariantCulture);
        return sum;
    }
}

/// <summary>Temporary buffers: a fresh array each time vs one rented from the shared pool.</summary>
[MemoryDiagnoser]
public class BufferBenchmarks
{
    // 4 KB = typical I/O buffer (small object heap); 100 KB > 85 000 bytes → Large Object Heap.
    [Params(4096, 100_000)]
    public int Size { get; set; }

    [Benchmark(Baseline = true)]
    public long NewArray() => Fill(new byte[Size], Size);

    [Benchmark]
    public long ArrayPoolRent()
    {
        var buffer = ArrayPool<byte>.Shared.Rent(Size);
        try
        {
            return Fill(buffer, Size);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    // NoInlining keeps the array "escaping", so the JIT cannot stack-allocate it behind our back.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static long Fill(byte[] buffer, int size)
    {
        var span = buffer.AsSpan(0, size);
        span.Fill(0x2A);
        return span[0] + span[^1];
    }
}

/// <summary>Building "item0;item1;…": += in a loop vs StringBuilder vs the interpolation handler vs string.Create.</summary>
[MemoryDiagnoser]
public class StringBuildingBenchmarks
{
    [Params(10, 100)]
    public int Count { get; set; }

    [Benchmark(Baseline = true)]
    public string Concat()
    {
        var s = "";
#pragma warning disable S1643 // concatenation in a loop IS the baseline being measured
        for (var i = 0; i < Count; i++)
            s += "item" + i.ToString(CultureInfo.InvariantCulture) + ";";   // a new, longer string every iteration: O(n²) bytes
#pragma warning restore S1643
        return s;
    }

    [Benchmark]
    public string Builder()
    {
        var sb = new StringBuilder();
        for (var i = 0; i < Count; i++)
            sb.Append("item").Append(i).Append(';');
        return sb.ToString();
    }

    // What the compiler emits for $"..." since C# 10: formats straight into a pooled buffer.
    [Benchmark]
    public string InterpolatedHandler()
    {
        var handler = new DefaultInterpolatedStringHandler(5 * Count, Count, CultureInfo.InvariantCulture);
        for (var i = 0; i < Count; i++)
        {
            handler.AppendLiteral("item");
            handler.AppendFormatted(i);
            handler.AppendLiteral(";");
        }
        return handler.ToStringAndClear();
    }

    // Exact length known up front → a single allocation: the final string, written in place.
    [Benchmark]
    public string StringCreate()
    {
        var length = 0;
        for (var i = 0; i < Count; i++) length += 5 + Digits(i);
        return string.Create(length, Count, static (span, count) =>
        {
            for (var i = 0; i < count; i++)
            {
                "item".AsSpan().CopyTo(span);
                i.TryFormat(span[4..], out var written, provider: CultureInfo.InvariantCulture);
                span[4 + written] = ';';
                span = span[(5 + written)..];
            }
        });
    }

    private static int Digits(int n) => n < 10 ? 1 : (int)Math.Floor(Math.Log10(n)) + 1;
}

/// <summary>Hot path: LINQ pipeline (delegates, enumerators, closure) vs a plain loop.</summary>
[MemoryDiagnoser]
public class LinqBenchmarks
{
    private int[] _values = [];
    private int _threshold;

    [GlobalSetup]
    public void Setup()
    {
        _values = Enumerable.Range(0, 1_000).ToArray();
        _threshold = 10;
    }

    // The lambda captures `this` (_threshold): a new delegate is allocated on every call.
    [Benchmark(Baseline = true)]
    public long Linq() => _values.Where(v => v > _threshold && v % 2 == 0).Select(v => (long)v * v).Sum();

    [Benchmark]
    public long Foreach()
    {
        long sum = 0;
#pragma warning disable S3267 // the hand-written loop IS the alternative to LINQ being measured
        foreach (var v in _values)
            if (v > _threshold && v % 2 == 0) sum += (long)v * v;
#pragma warning restore S3267
        return sum;
    }
}
