using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DevLab.Api.Tests;

/// <summary>
/// Boots the REAL app in-memory (no Kestrel, no network) and swaps the SQLite file
/// for an isolated one per test run. Integration tests hit the full pipeline:
/// routing → auth → filters → EF Core.
/// </summary>
public sealed class LabApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"devlab-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = $"Data Source={_dbPath}",
            ["ConnectionStrings:Orders"] = $"Data Source={_dbPath.Replace(".db", "-orders.db")}",
            ["Jwt:SigningKey"] = "TEST-KEY-0123456789abcdefghijklmnopqrstuvwxyz-0123456789",
            ["ApiKeys:Keys:0:Key"] = "test-key",
            ["ApiKeys:Keys:0:Owner"] = "test-bot",
            ["ApiKeys:Keys:0:Roles:0"] = "Service",
        }));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var f in new[] { _dbPath, _dbPath.Replace(".db", "-orders.db") })
            if (File.Exists(f)) File.Delete(f);
    }
}
