using System.Security.Claims;
using DevLab.Api.Features.Auth.Jwt;
using Microsoft.AspNetCore.Authorization;

namespace DevLab.Api.Features.Auth.Authorization;

// ── Custom requirement + handler: "user must be at least N years old" ─────────
public sealed class MinimumAgeRequirement(int minimumAge) : IAuthorizationRequirement
{
    public int MinimumAge { get; } = minimumAge;
}

public sealed class MinimumAgeHandler : AuthorizationHandler<MinimumAgeRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext ctx, MinimumAgeRequirement req)
    {
        var age = ctx.User.FindFirst("age")?.Value;
        if (int.TryParse(age, out var years) && years >= req.MinimumAge)
            ctx.Succeed(req);           // not calling Succeed = requirement not met → 403
        return Task.CompletedTask;
    }
}

// ── Resource-based: the decision depends on the resource, not only on the user ──
public record Document(int Id, string Title, string OwnerUserName);

public sealed class DocumentOwnerRequirement : IAuthorizationRequirement;

public sealed class DocumentOwnerHandler : AuthorizationHandler<DocumentOwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext ctx, DocumentOwnerRequirement req, Document doc)
    {
        if (ctx.User.Identity?.Name == doc.OwnerUserName || ctx.User.IsInRole("Admin"))
            ctx.Succeed(req);
        return Task.CompletedTask;
    }
}

public static class LabAuthorization
{
    public static IServiceCollection AddLabAuthorization(this IServiceCollection services)
    {
        services.AddSingleton<IAuthorizationHandler, MinimumAgeHandler>();
        services.AddSingleton<IAuthorizationHandler, DocumentOwnerHandler>();

        services.AddAuthorizationBuilder()
            .AddPolicy("AdminOnly", p => p.RequireRole("Admin"))
            .AddPolicy("CanWriteProducts", p => p.RequireClaim("permission", "products:write"))
            .AddPolicy("Adult", p => p.AddRequirements(new MinimumAgeRequirement(18)))
            .AddPolicy("ServiceOrAdmin", p => p.RequireAssertion(ctx =>
                ctx.User.IsInRole("Service") || ctx.User.IsInRole("Admin")))
            .AddPolicy("DocumentOwner", p => p.AddRequirements(new DocumentOwnerRequirement()));

        return services;
    }

    private static readonly Document[] Documents =
    [
        new(1, "Alice's roadmap", "alice"),
        new(2, "Bob's notes", "bob"),
        new(3, "Carol's diary", "carol"),
    ];

    public static IEndpointRouteBuilder MapAuthorizationEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/authz").WithTags("Authorization");

        g.MapGet("/admin", (ClaimsPrincipal u) => Ok(u, "AdminOnly")).RequireAuthorization("AdminOnly");
        g.MapGet("/write", (ClaimsPrincipal u) => Ok(u, "CanWriteProducts")).RequireAuthorization("CanWriteProducts");
        g.MapGet("/adult", (ClaimsPrincipal u) => Ok(u, "Adult")).RequireAuthorization("Adult");
        g.MapGet("/service", (ClaimsPrincipal u) => Ok(u, "ServiceOrAdmin")).RequireAuthorization("ServiceOrAdmin");

        // Imperative authorization: we need the resource before we can decide.
        g.MapGet("/documents/{id:int}", async (int id, ClaimsPrincipal user, IAuthorizationService authz) =>
        {
            var doc = Documents.FirstOrDefault(d => d.Id == id);
            if (doc is null) return Results.NotFound();

            var result = await authz.AuthorizeAsync(user, doc, "DocumentOwner");
            return result.Succeeded ? Results.Ok(doc) : Results.Forbid();
        }).RequireAuthorization();

        g.MapGet("/documents", () => TypedResults.Ok(Documents)).AllowAnonymous();

        return app;
    }

    private static IResult Ok(ClaimsPrincipal user, string policy) =>
        Results.Ok(new { policy, granted = true, user = user.Identity?.Name, via = user.Identity?.AuthenticationType });

    /// <summary>Works with ANY scheme thanks to the "Smart" policy scheme (default).</summary>
    public static IEndpointRouteBuilder MapWhoAmIEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/auth/whoami", (ClaimsPrincipal user) => TypedResults.Ok(JwtEndpoints.Describe(user)))
           .WithTags("Auth");
        return app;
    }
}
