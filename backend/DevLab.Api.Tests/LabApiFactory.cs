using System.Net.Http.Headers;
using System.Net.Http.Json;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure.Messaging;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DevLab.Api.Tests;

/// <summary>
/// Boots the REAL app in-memory (no Kestrel, no network) and swaps the SQLite file
/// for an isolated one per test run. Integration tests hit the full pipeline:
/// routing → auth → filters → EF Core. Startup applies the real migrations to those files.
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
            // The background poller effectively never ticks: tests flush the outbox themselves,
            // so every assertion runs against a known state instead of racing a timer.
            ["Outbox:PollInterval"] = "01:00:00",
        }));
    }

    /// <summary>Delivers pending outbox messages now (what the background dispatcher does every tick).</summary>
    public Task<int> FlushOutboxAsync() => Services.GetRequiredService<OutboxDispatcher<OrdersDbContext>>().DispatchPendingAsync();

    public async Task<HttpClient> LoggedInAsync(string user, string password)
    {
        var client = CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest(user, password));
        var pair = await login.Content.ReadFromJsonAsync<TokenPair>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pair!.AccessToken);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var f in new[] { _dbPath, _dbPath.Replace(".db", "-orders.db") })
            if (File.Exists(f)) File.Delete(f);
    }
}
