using System.Text.Json.Serialization;

namespace DevLab.AotDemo;

public record Todo(int Id, string Title, bool Done);

public record AotRuntimeInfo(string Framework, bool DynamicCodeSupported, bool DynamicCodeCompiled, long WorkingSetBytes, double UptimeMs);

// The source generator writes the (de)serialization code for these types at compile time:
// no reflection at runtime, which Native AOT could not support anyway (types may be trimmed away).
[JsonSerializable(typeof(Todo))]
[JsonSerializable(typeof(Todo[]))]
[JsonSerializable(typeof(AotRuntimeInfo))]
internal sealed partial class AotJsonContext : JsonSerializerContext;
