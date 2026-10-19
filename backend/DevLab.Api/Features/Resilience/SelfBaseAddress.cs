using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

namespace DevLab.Api.Features.Resilience;

/// <summary>
/// Where the demo client finds "the dependency" — here, this very app. Resolved lazily (the
/// server only knows its addresses once started), never from the incoming request: behind a
/// proxy the Host header is the public domain, and we must not loop through the internet.
/// </summary>
public static class SelfBaseAddress
{
    private static readonly Uri TestServerAddress = new("http://localhost"); // NOSONAR — placeholder, never dialed

    public static Uri Resolve(IServiceProvider services)
    {
        // Explicit override wins (e.g. a container where Kestrel binds a port nobody can reach).
        var configured = services.GetRequiredService<IConfiguration>()["Resilience:SelfBaseUrl"];
        if (Uri.TryCreate(configured, UriKind.Absolute, out var fromConfig)) return fromConfig;

        var addresses = services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()?.Addresses ?? [];
        var address = addresses.FirstOrDefault(a => a.StartsWith("http://", StringComparison.Ordinal)) ?? addresses.FirstOrDefault();

        // TestServer exposes no address: any absolute URI works, the test swaps the handler.
        if (address is null) return TestServerAddress;

        // Wildcard bindings (http://+:8080, http://[::]:8080, http://0.0.0.0:8080) are listen
        // addresses, not dialable ones.
        var dialable = address.Replace("://+", "://localhost", StringComparison.Ordinal)
                              .Replace("://*", "://localhost", StringComparison.Ordinal)
                              .Replace("://[::]", "://localhost", StringComparison.Ordinal)
                              .Replace("://0.0.0.0", "://localhost", StringComparison.Ordinal);
        return new Uri(dialable);
    }
}
