using System.Security.Claims;
using System.Text;
using DevLab.Api.Features.Auth.ApiKey;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Auth.Oidc;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace DevLab.Api.Features.Auth;

public static class LabAuthentication
{
    public static IServiceCollection AddLabAuthentication(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<JwtOptions>()
            .Bind(config.GetSection(JwtOptions.Section))
            .Validate(o => !string.IsNullOrEmpty(o.SigningKey),
                "Jwt:SigningKey is not configured. Set it via user-secrets or the Jwt__SigningKey env var.")
            .ValidateOnStart();
        services.Configure<ApiKeyOptions>(config.GetSection(ApiKeyOptions.Section));
        services.Configure<IdpOptions>(config.GetSection(IdpOptions.Section));
        services.AddSingleton<JwtTokenService>();
        services.AddSingleton<RefreshTokenStore>();

        // Named options configured FROM other options: the signing key is read lazily, so
        // tests (or a secret manager) can override it after registration.
        services.AddOptions<JwtBearerOptions>(AuthSchemes.Jwt).Configure<IOptions<JwtOptions>>((o, jwt) =>
        {
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = jwt.Value.Issuer,
                ValidAudience = jwt.Value.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Value.SigningKey)),
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.Zero,           // default is 5 min — hides expiry in demos
                NameClaimType = ClaimTypes.Name,
                RoleClaimType = ClaimTypes.Role,
            };
            o.Events = new JwtBearerEvents
            {
                // SignalR sends the token as a query string (WebSockets cannot set headers).
                OnMessageReceived = ctx =>
                {
                    var token = ctx.Request.Query["access_token"];
                    if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                        ctx.Token = token;
                    return Task.CompletedTask;
                }
            };
        });

        services.AddOptions<JwtBearerOptions>(AuthSchemes.Oidc).Configure<IOptions<JwtOptions>, IOptions<IdpOptions>>((o, jwt, idp) =>
        {
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = idp.Value.Issuer,
                ValidAudience = idp.Value.ClientId,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Value.SigningKey)), // real IdP: keys come from /.well-known/jwks
                ClockSkew = TimeSpan.Zero,
                NameClaimType = "name",
                RoleClaimType = "role",
            };
        });

        services.AddAuthentication(AuthSchemes.Smart)
            // ── 1. JWT issued by our own /api/auth/jwt/login (options above) ─────
            .AddJwtBearer(AuthSchemes.Jwt)
            // ── 2. Token issued by the (fake) OpenID Connect provider ─────────────
            .AddJwtBearer(AuthSchemes.Oidc)
            // ── 3. Cookie: the server keeps the session, the browser keeps a ticket ──
            .AddCookie(AuthSchemes.Cookie, o =>
            {
                o.Cookie.Name = "devlab.auth";
                o.Cookie.HttpOnly = true;                    // JS cannot read it → XSS can't steal it
                o.Cookie.SameSite = SameSiteMode.Lax;        // CSRF mitigation #1
                o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                o.ExpireTimeSpan = TimeSpan.FromMinutes(30);
                o.SlidingExpiration = true;
                // An API must answer 401/403, not redirect to a login page.
                o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
                o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
            })
            // ── 4. API key: custom AuthenticationHandler ─────────────────────────
            .AddScheme<ApiKeyOptions, ApiKeyAuthenticationHandler>(AuthSchemes.ApiKey, _ => { })
            // ── 5. "Smart" policy scheme: choose the scheme from the request shape ──
            .AddPolicyScheme(AuthSchemes.Smart, "Pick scheme per request", o =>
            {
                o.ForwardDefaultSelector = ctx =>
                {
                    if (ctx.Request.Headers.ContainsKey("X-Api-Key")) return AuthSchemes.ApiKey;

                    var auth = ctx.Request.Headers.Authorization.ToString();
                    if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                    {
                        var idpIssuer = ctx.RequestServices.GetRequiredService<IOptions<IdpOptions>>().Value.Issuer;
                        return LooksLikeIdpToken(auth[7..], idpIssuer) ? AuthSchemes.Oidc : AuthSchemes.Jwt;
                    }

                    return AuthSchemes.Cookie;
                };
            });

        services.AddAntiforgery(o => o.HeaderName = "X-XSRF-TOKEN"); // Angular sends this header automatically
        return services;
    }

    // Peek at the (unverified) issuer claim to route the token to the right validator.
    private static bool LooksLikeIdpToken(string token, string idpIssuer)
    {
        try
        {
            var payload = token.Split('.')[1];
            payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=').Replace('-', '+').Replace('_', '/');
            return Encoding.UTF8.GetString(Convert.FromBase64String(payload)).Contains($"\"iss\":\"{idpIssuer}\"");
        }
        catch { return false; }
    }
}
