using System.Security.Claims;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Auth.Users;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;

namespace DevLab.Api.Features.Auth.Cookie;

public static class CookieEndpoints
{
    public static IEndpointRouteBuilder MapCookieEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth/cookie").WithTags("Auth · Cookie");

        // SignInAsync serializes the ClaimsPrincipal into an ENCRYPTED ticket (Data Protection)
        // and sets it as an HttpOnly cookie. Nothing is stored server-side by default.
        group.MapPost("/login", async (LoginRequest req, HttpContext ctx, InMemoryUserStore users) =>
        {
            var user = users.Validate(req.UserName, req.Password);
            if (user is null) return Results.Problem(statusCode: 401, title: "Invalid credentials");

            var identity = new ClaimsIdentity(InMemoryUserStore.ClaimsFor(user), AuthSchemes.Cookie);
            await ctx.SignInAsync(AuthSchemes.Cookie, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true });

            return Results.Ok(new { message = $"Cookie issued for {user.UserName}. Check DevTools → Application → Cookies." });
        }).AllowAnonymous();

        group.MapGet("/me", (ClaimsPrincipal user) => TypedResults.Ok(JwtEndpoints.Describe(user)))
             .RequireAuthorization(p => p.AddAuthenticationSchemes(AuthSchemes.Cookie).RequireAuthenticatedUser());

        group.MapPost("/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(AuthSchemes.Cookie); // deletes the cookie
            return TypedResults.NoContent();
        });

        // ── CSRF ─────────────────────────────────────────────────────────────
        // Cookies are sent automatically by the browser → a malicious site could POST on your behalf.
        // Defense: SameSite + a token the attacker cannot read. Angular reads the XSRF-TOKEN cookie
        // and echoes it in the X-XSRF-TOKEN header; the server compares both halves.
        group.MapGet("/csrf", (IAntiforgery antiforgery, HttpContext ctx) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(ctx);
            // Sonar S3330/S2092 flag this cookie. It is INTENTIONALLY readable by JavaScript: the
            // whole point of the double-submit pattern is that Angular copies it into a header.
            // Secure=false only because the lab runs on plain http://localhost.
#pragma warning disable S3330, S2092
            ctx.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!,
                new CookieOptions { HttpOnly = false, SameSite = SameSiteMode.Strict, Secure = ctx.Request.IsHttps });
#pragma warning restore S3330, S2092
            return TypedResults.Ok(new { message = "XSRF-TOKEN cookie set" });
        });

        group.MapPost("/transfer", async (IAntiforgery antiforgery, HttpContext ctx, ClaimsPrincipal user) =>
        {
            try { await antiforgery.ValidateRequestAsync(ctx); }
            catch (AntiforgeryValidationException) { return Results.Problem(statusCode: 400, title: "CSRF token missing or invalid"); }

            return Results.Ok(new { message = $"💸 Transfer executed for {user.Identity!.Name} (CSRF token was valid)" });
        }).RequireAuthorization(p => p.AddAuthenticationSchemes(AuthSchemes.Cookie).RequireAuthenticatedUser());

        return app;
    }
}
