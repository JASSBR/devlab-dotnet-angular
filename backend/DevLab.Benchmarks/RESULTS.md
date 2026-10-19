# BenchmarkDotNet — résultats réels

Produits le 2026-10-19 sur le Mac de développement avec :

```bash
cd backend/DevLab.Benchmarks
dotnet run -c Release -- --filter '*' --job short
```

`--job short` = 3 itérations de warm-up + 3 mesurées, 1 process : rapide (≈ 2 min pour les 17 benchmarks), mais
la colonne **Error** est large. Pour une décision réelle, relancer sans `--job short` (job par défaut, plusieurs minutes).
Les tableaux ci-dessous sont copiés tels quels depuis `BenchmarkDotNet.Artifacts/results/*-report-github.md`.

Lire un rapport : **Mean** = temps moyen par opération, **Ratio** = par rapport à la ligne `Baseline`,
**Gen0/Gen1/Gen2** = collections déclenchées pour 1 000 opérations, **Allocated** = octets alloués sur le heap managé
par opération (`[MemoryDiagnoser]`).

## Machine

```
BenchmarkDotNet v0.15.8, macOS Tahoe 26.5.1 (25F80) [Darwin 25.5.0]
Apple M4, 1 CPU, 10 logical and 10 physical cores
.NET SDK 10.0.401
  [Host]   : .NET 10.0.12 (10.0.12, 10.0.1226.42308), Arm64 RyuJIT armv8.0-a
  ShortRun : .NET 10.0.12 (10.0.12, 10.0.1226.42308), Arm64 RyuJIT armv8.0-a

Job=ShortRun  IterationCount=3  LaunchCount=1  
WarmupCount=3
```

## Parsing d’une ligne CSV (8 champs)

`ParsingBenchmarks`

| Method    | Mean      | Error     | StdDev    | Ratio | RatioSD | Gen0   | Allocated | Alloc Ratio |
|---------- |----------:|----------:|----------:|------:|--------:|-------:|----------:|------------:|
| Substring |  96.23 ns |  77.30 ns |  4.237 ns |  1.00 |    0.05 | 0.0286 |     240 B |        1.00 |
| Span      |  42.39 ns |  19.83 ns |  1.087 ns |  0.44 |    0.02 |      - |         - |        0.00 |
| Split     | 101.03 ns | 190.27 ns | 10.429 ns |  1.05 |    0.10 | 0.0391 |     328 B |        1.37 |

> `Span` : zéro allocation et 2,3× plus rapide. `Split` est le pire : un tableau + 8 strings.

## Buffers temporaires : `new byte[]` vs `ArrayPool<byte>.Shared`

`BufferBenchmarks`

| Method        | Size   | Mean        | Error       | StdDev     | Ratio | RatioSD | Gen0    | Gen1    | Gen2    | Allocated | Alloc Ratio |
|-------------- |------- |------------:|------------:|-----------:|------:|--------:|--------:|--------:|--------:|----------:|------------:|
| **NewArray**      | **4096**   |   **144.78 ns** |    **48.35 ns** |   **2.650 ns** |  **1.00** |    **0.02** |  **0.4923** |       **-** |       **-** |    **4120 B** |        **1.00** |
| ArrayPoolRent | 4096   |    51.45 ns |    72.36 ns |   3.966 ns |  0.36 |    0.02 |       - |       - |       - |         - |        0.00 |
|               |        |             |             |            |       |         |         |         |         |           |             |
| **NewArray**      | **100000** | **7,593.92 ns** |   **743.35 ns** |  **40.745 ns** |  **1.00** |    **0.01** | **31.2347** | **31.2347** | **31.2347** |  **100045 B** |        **1.00** |
| ArrayPoolRent | 100000 | 1,399.15 ns | 3,516.38 ns | 192.745 ns |  0.18 |    0.02 |       - |       - |       - |         - |        0.00 |

> À 100 000 octets (> 85 000), chaque `new byte[]` part sur le LOH : collections Gen2 (31 pour 1 000 ops) et 5,4× plus lent que le pool.

## Construire `"item0;item1;…"`

`StringBuildingBenchmarks`

| Method              | Count | Mean        | Error      | StdDev    | Ratio | RatioSD | Gen0   | Gen1   | Allocated | Alloc Ratio |
|-------------------- |------ |------------:|-----------:|----------:|------:|--------:|-------:|-------:|----------:|------------:|
| **Concat**              | **10**    |    **84.10 ns** |  **30.010 ns** |  **1.645 ns** |  **1.00** |    **0.02** | **0.1099** |      **-** |     **920 B** |        **1.00** |
| Builder             | 10    |    70.22 ns |  24.129 ns |  1.323 ns |  0.84 |    0.02 | 0.0583 |      - |     488 B |        0.53 |
| InterpolatedHandler | 10    |    50.45 ns |  28.835 ns |  1.581 ns |  0.60 |    0.02 | 0.0172 |      - |     144 B |        0.16 |
| StringCreate        | 10    |    24.44 ns |   1.985 ns |  0.109 ns |  0.29 |    0.01 | 0.0172 |      - |     144 B |        0.16 |
|                     |       |             |            |           |       |         |        |        |           |             |
| **Concat**              | **100**   | **2,895.76 ns** | **232.565 ns** | **12.748 ns** |  **1.00** |    **0.01** | **8.5220** | **0.0267** |   **71304 B** |        **1.00** |
| Builder             | 100   |   496.65 ns | 270.831 ns | 14.845 ns |  0.17 |    0.00 | 0.4730 | 0.0038 |    3960 B |        0.06 |
| InterpolatedHandler | 100   |   431.32 ns |  21.561 ns |  1.182 ns |  0.15 |    0.00 | 0.1678 |      - |    1408 B |        0.02 |
| StringCreate        | 100   |   423.37 ns | 258.964 ns | 14.195 ns |  0.15 |    0.00 | 0.1678 |      - |    1408 B |        0.02 |

> `+=` en boucle est quadratique : 71 Ko alloués pour une chaîne de ~700 caractères (Count=100). `string.Create` / le handler d’interpolation n’allouent que la chaîne finale.

## LINQ vs `foreach` sur un chemin chaud (1 000 entiers)

`LinqBenchmarks`

| Method  | Mean       | Error     | StdDev   | Ratio | Gen0   | Allocated | Alloc Ratio |
|-------- |-----------:|----------:|---------:|------:|-------:|----------:|------------:|
| Linq    | 1,135.4 ns | 240.73 ns | 13.20 ns |  1.00 | 0.0191 |     168 B |        1.00 |
| Foreach |   377.2 ns |  43.53 ns |  2.39 ns |  0.33 |      - |         - |        0.00 |

> LINQ : 3× plus lent et 168 B par appel (closure qui capture `this`, délégués, énumérateurs). Négligeable dans un handler appelé 10 fois par seconde, pas dans une boucle chaude.
