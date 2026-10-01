namespace DevLab.Api.Features.SourceCode;

/// <summary>
/// The lab's "secret sauce": every lesson page shows THE ACTUAL FILES that are
/// running. This endpoint reads them from the repository on disk.
/// Security: an allow-list of directories + a canonical path check prevents
/// path traversal (../../etc/passwd) — never trust a path coming from a client.
/// </summary>
public static class SourceCodeEndpoints
{
    private static readonly string[] AllowedRoots =
    [
        "frontend/src",
        "frontend/proxy.conf.json",
        "backend/DevLab.Api",
        "backend/DevLab.Api.Tests",
        "backend/Directory.Build.props",
        "backend/Directory.Packages.props",
        "backend/.editorconfig",
    ];

    public static IEndpointRouteBuilder MapSourceCodeEndpoints(this IEndpointRouteBuilder app, IWebHostEnvironment env)
    {
        var repoRoot = FindRepoRoot(env.ContentRootPath);

        app.MapGet("/api/source", (string path) =>
        {
            if (string.IsNullOrWhiteSpace(path) || path.Contains("..") || Path.IsPathRooted(path))
                return Results.BadRequest(new { error = "Invalid path." });

            if (!AllowedRoots.Any(r => path.StartsWith(r, StringComparison.Ordinal)))
                return Results.Forbid();

            if (path.Contains("bin/") || path.Contains("obj/") || path.Contains("node_modules"))
                return Results.Forbid();

            var full = Path.GetFullPath(Path.Combine(repoRoot, path));
            if (!full.StartsWith(repoRoot, StringComparison.Ordinal) || !File.Exists(full))
                return Results.NotFound(new { error = $"File not found: {path}" });

            return Results.Ok(new SourceFile(path, LanguageFor(path), File.ReadAllText(full)));
        })
        .WithName("GetSourceFile")
        .WithTags("Lab");

        return app;
    }

    private static string FindRepoRoot(string contentRoot)
    {
        // contentRoot = .../backend/DevLab.Api → repo root is two levels up.
        var dir = new DirectoryInfo(contentRoot);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "frontend")))
            dir = dir.Parent;
        return (dir?.FullName ?? contentRoot) + Path.DirectorySeparatorChar;
    }

    private static string LanguageFor(string path) => (path.EndsWith(".editorconfig", StringComparison.Ordinal) ? ".editorconfig" : Path.GetExtension(path)) switch
    {
        ".cs" => "csharp",
        ".ts" => "typescript",
        ".html" => "xml",
        ".scss" or ".css" => "scss",
        ".json" => "json",
        ".csproj" or ".props" => "xml",
        ".editorconfig" => "ini",
        _ => "plaintext",
    };
}

public record SourceFile(string Path, string Language, string Content);
