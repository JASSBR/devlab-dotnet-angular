using System.Buffers;
using System.Globalization;
using System.Runtime.CompilerServices;

namespace DevLab.Api.Features.Performance;

/// <summary>
/// The same work written twice: once the "natural" way, once allocation-free.
/// The results are identical; only what the GC has to clean up differs.
/// </summary>
public static class AllocationWorkloads
{
    public const string CsvLine = "1042,7,250,2026,13,99,3,18";
    public const int BufferSize = 4096;
    // Just above the 85 000-byte threshold: every array goes straight to the Large Object Heap.
    public const int LargeBufferSize = 90_000;

    // Each field becomes a new string on the heap (≈ 30 bytes) that dies immediately.
#pragma warning disable CA1846 // the allocating Substring IS the point of the comparison
    public static long ParseWithSubstring(string line)
    {
        long sum = 0;
        var start = 0;
        while (true)
        {
            var comma = line.IndexOf(',', start);
            var field = comma < 0 ? line.Substring(start) : line.Substring(start, comma - start);
            sum += int.Parse(field, CultureInfo.InvariantCulture);
            if (comma < 0) return sum;
            start = comma + 1;
        }
    }
#pragma warning restore CA1846

    // A span is a (pointer, length) view over the original string: slicing copies nothing.
    public static long ParseWithSpan(ReadOnlySpan<char> line)
    {
        long sum = 0;
        while (true)
        {
            var comma = line.IndexOf(',');
            var field = comma < 0 ? line : line[..comma];
            sum += int.Parse(field, CultureInfo.InvariantCulture);
            if (comma < 0) return sum;
            line = line[(comma + 1)..];
        }
    }

    public static long WithNewArray(int size) => Fill(new byte[size], size);

    // Rent may return a LARGER array than asked: always work on [0..size), and give it back in finally.
    public static long WithPooledArray(int size)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(size);
        try
        {
            return Fill(buffer, size);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    // NoInlining: the array escapes into a real call, so the .NET 10 JIT cannot stack-allocate it
    // (escape analysis) and silently erase the difference we want to show.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static long Fill(byte[] buffer, int size)
    {
        var span = buffer.AsSpan(0, size);
        span.Fill(0x2A);
        return span[0] + span[^1] + size;
    }
}
