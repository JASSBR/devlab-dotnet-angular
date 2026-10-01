using System.Security.Claims;
using DevLab.Api.Features.Auth.Users;
using Microsoft.AspNetCore.Authorization;

namespace DevLab.Api.Features.Auth.Jwt;

public record LoginRequest(string UserName, string Password);
public record RefreshRequest(string RefreshToken);

public static class JwtEndpoints
{
    public static IEndpointRouteBuilder MapJwtEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth/jwt").WithTags("Auth · JWT");

        // 1. Credentials → access token (short) + refresh token (long, opaque, stored).
        group.MapPost("/login", (LoginRequest req, InMemoryUserStore users, JwtTokenService jwt, RefreshTokenStore refresh) =>
        {
            var user = users.Validate(req.UserName, req.Password);
            if (user is null) return Results.Problem(statusCode: 401, title: "Invalid credentials");

            var pair = jwt.Issue(InMemoryUserStore.ClaimsFor(user));
            refresh.Save(pair.RefreshToken, user.UserName);
            return Results.Ok(pair);
        }).AllowAnonymous();

        // 2. Refresh: rotate the refresh token, issue a new pair. No credentials involved.
        group.MapPost("/refresh", (RefreshRequest req, InMemoryUserStore users, JwtTokenService jwt, RefreshTokenStore refresh) =>
        {
            var userName = refresh.Consume(req.RefreshToken);
            var user = userName is null ? null : users.FindByName(userName);
            if (user is null) return Results.Problem(statusCode: 401, title: "Refresh token invalid or expired");

            var pair = jwt.Issue(InMemoryUserStore.ClaimsFor(user));
            refresh.Save(pair.RefreshToken, user.UserName);
            return Results.Ok(pair);
        }).AllowAnonymous();

        // 3. Protected resource: the Bearer scheme validates signature, issuer, audience, expiry.
        group.MapGet("/me", (ClaimsPrincipal user) => TypedResults.Ok(Describe(user)))
             .RequireAuthorization(p => p.AddAuthenticationSchemes(AuthSchemes.Jwt).RequireAuthenticatedUser());

        // 4. Logout with JWT = revoke refresh tokens; the access token stays valid until it expires
        //    (that is WHY access tokens must be short-lived).
        group.MapPost("/logout", (ClaimsPrincipal user, RefreshTokenStore refresh) =>
        {
            refresh.RevokeAllFor(user.Identity!.Name!);
            return TypedResults.NoContent();
        }).RequireAuthorization(p => p.AddAuthenticationSchemes(AuthSchemes.Jwt).RequireAuthenticatedUser());

        group.MapGet("/users", (InMemoryUserStore users) => TypedResults.Ok(users.Directory())).AllowAnonymous();

        return app;
    }

    public static object Describe(ClaimsPrincipal user) => new
    {
        name = user.Identity?.Name,
        authenticationType = user.Identity?.AuthenticationType,
        isAuthenticated = user.Identity?.IsAuthenticated ?? false,
        roles = user.FindAll(ClaimTypes.Role).Select(c => c.Value).Concat(user.FindAll("role").Select(c => c.Value)),
        claims = user.Claims.Select(c => new { type = ShortClaimType(c.Type), c.Value }),
    };

    private static string ShortClaimType(string type) => type.Contains('/') ? type[(type.LastIndexOf('/') + 1)..] : type;
}
