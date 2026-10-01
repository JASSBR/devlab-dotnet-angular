using System.Security.Claims;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Auth.Users;

namespace DevLab.Api.Features.Auth.Oidc;

public static class FakeIdentityProviderEndpoints
{
    public static IServiceCollection AddFakeIdentityProvider(this IServiceCollection services, IConfiguration config) =>
        services.AddSingleton<FakeIdentityProvider>();

    public static IEndpointRouteBuilder MapFakeIdentityProviderEndpoints(this IEndpointRouteBuilder app)
    {
        var idp = app.MapGroup("/idp").WithTags("Auth · Fake IdP (OIDC)");

        // Discovery document: clients read this to find the endpoints (real IdPs also publish jwks_uri).
        idp.MapGet("/.well-known/openid-configuration", (FakeIdentityProvider p, HttpRequest req) => TypedResults.Ok(new
        {
            issuer = p.Options.Issuer,
            authorization_endpoint = $"{req.Scheme}://{req.Host}/idp/authorize",
            token_endpoint = $"{req.Scheme}://{req.Host}/idp/token",
            userinfo_endpoint = $"{req.Scheme}://{req.Host}/idp/userinfo",
            response_types_supported = new[] { "code" },
            code_challenge_methods_supported = new[] { "S256" },
            scopes_supported = new[] { "openid", "profile", "email" },
        }));

        // Step 1 — the browser is REDIRECTED here by Angular. The IdP shows its own login/consent UI.
        idp.MapGet("/authorize", (FakeIdentityProvider p, string client_id, string redirect_uri, string response_type,
                                  string code_challenge, string code_challenge_method, string state, string? scope, string? nonce) =>
        {
            if (response_type != "code" || code_challenge_method != "S256")
                return Results.BadRequest(new { error = "unsupported_response_type", hint = "Only code + PKCE S256" });
            if (!p.IsValidClient(client_id, redirect_uri))
                return Results.BadRequest(new { error = "invalid_client", hint = "client_id or redirect_uri not registered" });

            return Results.Content(ConsentPage(client_id, redirect_uri, code_challenge, state, nonce ?? "", scope ?? "openid"), "text/html");
        });

        // Step 2 — consent form submitted → code issued → redirect back to the SPA with ?code=&state=
        idp.MapPost("/authorize", async (HttpRequest req, FakeIdentityProvider p, InMemoryUserStore users) =>
        {
            var f = await req.ReadFormAsync();
            var redirectUri = f["redirect_uri"].ToString();
            var state = f["state"].ToString();

            if (f["action"] == "deny")
                return Results.Redirect($"{redirectUri}?error=access_denied&state={Uri.EscapeDataString(state)}");

            var user = users.Validate(f["username"].ToString(), f["password"].ToString());
            if (user is null)
                return Results.Content(ConsentPage(f["client_id"]!, redirectUri, f["code_challenge"]!, state, f["nonce"]!, f["scope"]!, "Invalid credentials"), "text/html");

            var code = p.IssueCode(user.UserName, f["code_challenge"]!, redirectUri, f["nonce"]!);
            return Results.Redirect($"{redirectUri}?code={Uri.EscapeDataString(code)}&state={Uri.EscapeDataString(state)}");
        });

        // Step 3 — back-channel: Angular POSTs code + code_verifier (form-encoded, per RFC 6749).
        idp.MapPost("/token", async (HttpRequest req, FakeIdentityProvider p) =>
        {
            var f = await req.ReadFormAsync();
            if (f["grant_type"] != "authorization_code")
                return Results.BadRequest(new { error = "unsupported_grant_type" });

            var (error, tokens) = p.Exchange(f["code"]!, f["code_verifier"]!, f["redirect_uri"]!);
            return error is null ? Results.Ok(tokens) : Results.BadRequest(new { error });
        }).DisableAntiforgery();

        idp.MapGet("/userinfo", (ClaimsPrincipal user, FakeIdentityProvider p) =>
                p.UserInfo(user.Identity!.Name!) is { } info ? Results.Ok(info) : Results.NotFound())
           .RequireAuthorization(a => a.AddAuthenticationSchemes(AuthSchemes.Oidc).RequireAuthenticatedUser());

        // Our API accepting the IdP's token (second JwtBearer scheme).
        app.MapGet("/api/auth/oidc/me", (ClaimsPrincipal user) => TypedResults.Ok(JwtEndpoints.Describe(user)))
           .RequireAuthorization(a => a.AddAuthenticationSchemes(AuthSchemes.Oidc).RequireAuthenticatedUser())
           .WithTags("Auth · Fake IdP (OIDC)");

        return app;
    }

    private static string ConsentPage(string clientId, string redirectUri, string challenge, string state, string nonce, string scope, string? error = null) => $$"""
        <!doctype html><html><head><meta charset="utf-8"><title>DevLab Identity Provider</title>
        <style>
          body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}
          .card{background:#1e293b;padding:2rem;border-radius:16px;width:360px;box-shadow:0 20px 60px #0008}
          h1{font-size:1.1rem;margin:0 0 .25rem}.muted{color:#94a3b8;font-size:.85rem}
          input{width:100%;box-sizing:border-box;padding:.6rem;margin:.35rem 0;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff}
          button{padding:.6rem 1rem;border-radius:8px;border:0;cursor:pointer;font-weight:600}
          .ok{background:#22c55e;color:#052e16}.deny{background:#334155;color:#e2e8f0}.row{display:flex;gap:.5rem;margin-top:1rem}
          .scope{background:#0f172a;border-radius:8px;padding:.5rem .75rem;margin:.75rem 0;font-size:.85rem}
          .err{color:#f87171;font-size:.85rem}
        </style></head><body>
        <form class="card" method="post" action="/idp/authorize">
          <h1>🔐 DevLab Identity Provider</h1>
          <p class="muted">This is the IdP's own page — a separate origin in real life (Google, Entra ID, Keycloak).</p>
          <p class="muted"><b>{{clientId}}</b> asks to access your account with scopes:</p>
          <div class="scope">{{scope}}</div>
          {{(error is null ? "" : $"<p class=\"err\">{error}</p>")}}
          <input name="username" placeholder="username (alice / bob / carol)" value="alice" autocomplete="username">
          <input name="password" type="password" placeholder="password (alice123 …)" value="alice123" autocomplete="current-password">
          <input type="hidden" name="client_id" value="{{clientId}}">
          <input type="hidden" name="redirect_uri" value="{{redirectUri}}">
          <input type="hidden" name="code_challenge" value="{{challenge}}">
          <input type="hidden" name="state" value="{{state}}">
          <input type="hidden" name="nonce" value="{{nonce}}">
          <input type="hidden" name="scope" value="{{scope}}">
          <div class="row">
            <button class="ok" name="action" value="allow" type="submit">Allow &amp; sign in</button>
            <button class="deny" name="action" value="deny" type="submit">Deny</button>
          </div>
        </form></body></html>
        """;
}
