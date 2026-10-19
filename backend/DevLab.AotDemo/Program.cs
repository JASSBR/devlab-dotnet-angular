using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using DevLab.AotDemo;
using Microsoft.AspNetCore.Http.HttpResults;

// CreateSlimBuilder: no Kestrel HTTPS/HTTP3, no EventLog/Debug loggers, no hosting-startup scanning —
// only what a trimmed, AOT-compiled service needs. Startup and binary size both benefit.
var builder = WebApplication.CreateSlimBuilder(args);

// No runtime reflection over our types in AOT: System.Text.Json uses the source-generated
// metadata from AotJsonContext instead (generated at compile time).
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.TypeInfoResolverChain.Insert(0, AotJsonContext.Default));

var app = builder.Build();

var todos = new Todo[]
{
    new(1, "Mesurer avant d'optimiser", true),
    new(2, "Lire le rapport BenchmarkDotNet", false),
    new(3, "Comparer AOT et JIT", false),
};

app.MapGet("/todos", () => todos);
app.MapGet("/todos/{id:int}", Results<Ok<Todo>, NotFound> (int id) =>
    todos.FirstOrDefault(t => t.Id == id) is { } todo ? TypedResults.Ok(todo) : TypedResults.NotFound());

// What does the process look like from the inside? IsDynamicCodeSupported = false under Native AOT.
app.MapGet("/runtime", () => new AotRuntimeInfo(
    RuntimeInformation.FrameworkDescription,
    RuntimeFeature.IsDynamicCodeSupported,
    RuntimeFeature.IsDynamicCodeCompiled,
    Environment.WorkingSet,
    (DateTime.UtcNow - Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalMilliseconds));

// Startup time as the process itself sees it: from the OS process start to "ready to accept requests".
app.Lifetime.ApplicationStarted.Register(() =>
    app.Logger.LogInformation("Ready in {ElapsedMs:F1} ms (dynamic code supported: {Dynamic})",
        (DateTime.UtcNow - Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalMilliseconds,
        RuntimeFeature.IsDynamicCodeSupported));

await app.RunAsync();
