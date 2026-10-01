using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace DevLab.Api.Features.Auth.Jwt;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string SigningKey { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
}

public record TokenPair(string AccessToken, DateTimeOffset AccessTokenExpiresAt, string RefreshToken);

/// <summary>
/// Signs short-lived access tokens (HS256 here; RS256/ES256 with a key pair in production so
/// that consumers can verify without owning the secret).
/// </summary>
public sealed class JwtTokenService(IOptions<JwtOptions> options, TimeProvider clock)
{
    private readonly JwtOptions _o = options.Value;
    private readonly JsonWebTokenHandler _handler = new();

    public TokenPair Issue(IEnumerable<Claim> claims)
    {
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(_o.AccessTokenMinutes);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.SigningKey)), SecurityAlgorithms.HmacSha256),
        };

        var accessToken = _handler.CreateToken(descriptor);
        // Refresh token = opaque random string, stored server-side (never a JWT: we need to revoke it).
        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        return new TokenPair(accessToken, expires, refreshToken);
    }
}

/// <summary>Server-side registry of refresh tokens so they can be rotated and revoked.</summary>
public sealed class RefreshTokenStore(IOptions<JwtOptions> options, TimeProvider clock)
{
    private readonly Dictionary<string, (string UserName, DateTimeOffset ExpiresAt)> _tokens = new();
    private readonly Lock _lock = new();

    public void Save(string refreshToken, string userName)
    {
        lock (_lock) _tokens[refreshToken] = (userName, clock.GetUtcNow().AddDays(options.Value.RefreshTokenDays));
    }

    /// <summary>Consumes the token (rotation): a stolen refresh token can only be used once.</summary>
    public string? Consume(string refreshToken)
    {
        lock (_lock)
        {
            if (!_tokens.Remove(refreshToken, out var entry)) return null;
            return entry.ExpiresAt > clock.GetUtcNow() ? entry.UserName : null;
        }
    }

    public void RevokeAllFor(string userName)
    {
        lock (_lock)
            foreach (var k in _tokens.Where(kv => kv.Value.UserName == userName).Select(kv => kv.Key).ToList())
                _tokens.Remove(k);
    }
}
