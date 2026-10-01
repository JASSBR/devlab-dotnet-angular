using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace DevLab.Api.Features.Auth.ApiKey;

public sealed class ApiKeyOptions : AuthenticationSchemeOptions
{
    public const string Section = "ApiKeys";
    public List<ApiKeyEntry> Keys { get; set; } = [];
}

public sealed class ApiKeyEntry
{
    public string Key { get; set; } = "";
    public string Owner { get; set; } = "";
    public string[] Roles { get; set; } = [];
}

/// <summary>
/// A custom authentication scheme in ~30 lines: read a header, look it up, build a
/// ClaimsPrincipal. Typical for machine-to-machine callers (no user, no browser).
/// </summary>
public sealed class ApiKeyAuthenticationHandler(
    IOptionsMonitor<ApiKeyOptions> options, ILoggerFactory logger, UrlEncoder encoder,
    IOptions<ApiKeyOptions> configured)
    : AuthenticationHandler<ApiKeyOptions>(options, logger, encoder)
{
    public const string HeaderName = "X-Api-Key";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var provided))
            return Task.FromResult(AuthenticateResult.NoResult()); // not our concern → other schemes may try

        var entry = configured.Value.Keys.FirstOrDefault(k => k.Key == provided.ToString());
        if (entry is null)
            return Task.FromResult(AuthenticateResult.Fail("Unknown API key"));

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, $"apikey:{entry.Owner}"),
            new(ClaimTypes.Name, entry.Owner),
            new("auth_method", "api-key"),
        };
        claims.AddRange(entry.Roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    // Called when the endpoint requires auth and we have no result: shape the 401.
    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 401;
        Response.Headers.WWWAuthenticate = $"{Scheme.Name} header=\"{HeaderName}\"";
        return Response.WriteAsJsonAsync(new { error = $"Missing or invalid {HeaderName} header" });
    }
}

public static class ApiKeyEndpoints
{
    public static IEndpointRouteBuilder MapApiKeyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/auth/apikey/report", (ClaimsPrincipal user) => TypedResults.Ok(new
            {
                generatedFor = user.Identity!.Name,
                rows = Enumerable.Range(1, 5).Select(i => new { day = DateTime.UtcNow.AddDays(-i).ToString("yyyy-MM-dd"), sales = Random.Shared.Next(100, 999) }),
            }))
           .RequireAuthorization(p => p.AddAuthenticationSchemes(AuthSchemes.ApiKey).RequireAuthenticatedUser())
           .WithTags("Auth · API key");

        return app;
    }
}
