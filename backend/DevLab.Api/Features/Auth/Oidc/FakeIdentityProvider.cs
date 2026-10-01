using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Auth.Users;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace DevLab.Api.Features.Auth.Oidc;

public sealed class IdpOptions
{
    public const string Section = "Idp";
    public string Issuer { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string[] RedirectUris { get; set; } = [];
}

/// <summary>
/// A miniature OpenID Connect provider (think: Google, Entra ID, Keycloak, Auth0) hosted
/// in-process so the Authorization Code + PKCE flow can be watched step by step.
/// It is NOT production-grade — it exists to make the protocol tangible.
/// </summary>
public sealed class FakeIdentityProvider(IOptions<IdpOptions> idp, IOptions<JwtOptions> jwt, InMemoryUserStore users, TimeProvider clock)
{
    private sealed record PendingCode(string UserName, string CodeChallenge, string RedirectUri, string Nonce, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, PendingCode> _codes = new();

    public IdpOptions Options => idp.Value;

    public bool IsValidClient(string clientId, string redirectUri) =>
        clientId == idp.Value.ClientId && idp.Value.RedirectUris.Contains(redirectUri);

    /// <summary>Step 2: user consented → issue a one-time authorization code bound to the PKCE challenge.</summary>
    public string IssueCode(string userName, string codeChallenge, string redirectUri, string nonce)
    {
        var code = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        _codes[code] = new PendingCode(userName, codeChallenge, redirectUri, nonce, clock.GetUtcNow().AddMinutes(2));
        return code;
    }

    /// <summary>Step 3: exchange code + verifier → tokens. The verifier proves the caller started the flow.</summary>
    public (string? Error, object? Tokens) Exchange(string code, string codeVerifier, string redirectUri)
    {
        if (!_codes.TryRemove(code, out var pending)) return ("invalid_grant: unknown or already used code", null);
        if (pending.ExpiresAt < clock.GetUtcNow()) return ("invalid_grant: code expired", null);
        if (pending.RedirectUri != redirectUri) return ("invalid_grant: redirect_uri mismatch", null);

        // PKCE: SHA256(code_verifier) must equal the code_challenge sent at /authorize.
        var expected = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier)));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(pending.CodeChallenge)))
            return ("invalid_grant: PKCE verification failed", null);

        var user = users.FindByName(pending.UserName)!;
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(10);

        var claims = new List<Claim>
        {
            new("sub", user.Id), new("name", user.UserName), new("preferred_username", user.UserName),
            new("email", $"{user.UserName}@devlab.local"), new("nonce", pending.Nonce),
        };
        claims.AddRange(user.Roles.Select(r => new Claim("role", r)));

        var handler = new JsonWebTokenHandler();
        var idToken = handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = idp.Value.Issuer,
            Audience = idp.Value.ClientId,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime, Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Value.SigningKey)), SecurityAlgorithms.HmacSha256),
        });

        return (null, new
        {
            access_token = idToken, // simplified: same token doubles as access token for our API
            id_token = idToken,
            token_type = "Bearer",
            expires_in = (int)(expires - now).TotalSeconds,
            scope = "openid profile email",
        });
    }

    public object? UserInfo(string userName) =>
        users.FindByName(userName) is { } u ? new { sub = u.Id, name = u.UserName, email = $"{u.UserName}@devlab.local", roles = u.Roles } : null;

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
