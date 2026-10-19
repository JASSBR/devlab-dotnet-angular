using BenchmarkDotNet.Running;

namespace DevLab.Benchmarks;

/// <summary>
/// Entry point: BenchmarkSwitcher lets the command line pick what to run.
///   dotnet run -c Release -- --list flat
///   dotnet run -c Release -- --filter '*Parsing*'
///   dotnet run -c Release -- --filter '*' --job short   (≈ 1 min, what RESULTS.md was produced with)
/// </summary>
public static class Program
{
    public static void Main(string[] args) => BenchmarkSwitcher.FromAssembly(typeof(Program).Assembly).Run(args);
}
