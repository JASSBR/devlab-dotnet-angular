using Asp.Versioning;

namespace DevLab.Api.Features.Versioning;

// v1 contract. MemberSince was added AFTER v1 shipped, without a new version: an optional
// field that old clients simply ignore is not a breaking change.
public record PersonV1(int Id, string Name, string Email, DateOnly? MemberSince);

// v2 contract. Splitting Name into FirstName/LastName removes a field clients read → breaking → v2.
public record PersonV2(int Id, string FirstName, string LastName, string Email, DateOnly? MemberSince);

public static class ApiVersioningLesson
{
    private static readonly ApiVersion V1 = new(1, 0);
    private static readonly ApiVersion V2 = new(2, 0);

    // Deprecated = "still works, stop building on it". Sunset = "the date it stops working".
    private static readonly DateTimeOffset DeprecatedSince = new(2026, 9, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset SunsetOn = new(2027, 6, 30, 0, 0, 0, TimeSpan.Zero);

    private static readonly (int Id, string First, string Last, string Email, DateOnly? Since)[] People =
    [
        (1, "Ada", "Lovelace", "ada@devlab.local", new DateOnly(2024, 3, 1)),
        (2, "Alan", "Turing", "alan@devlab.local", null),
    ];

    public static IServiceCollection AddApiVersioningLesson(this IServiceCollection services)
    {
        services.AddApiVersioning(o =>
            {
                o.DefaultApiVersion = V1;
                o.AssumeDefaultVersionWhenUnspecified = true;   // clients older than versioning get v1
                o.ReportApiVersions = true;                     // api-supported-versions / api-deprecated-versions
                o.ApiVersionReader = ApiVersionReader.Combine(
                    new UrlSegmentApiVersionReader(),            // /api/v2/people
                    new HeaderApiVersionReader("api-version"),   // api-version: 2.0
                    new QueryStringApiVersionReader("api-version")); // ?api-version=2.0

                // Deprecation (RFC 9745) and Sunset (RFC 8594) headers on every v1 response,
                // with a Link to where clients should migrate. Relative links are rendered
                // root-relative: a leading '/' here would come out as "//openapi/…".
                o.Policies.Deprecate(V1).Effective(DeprecatedSince)
                          .Link("openapi/v2.json").Title("v2 contract").Type("application/json");
                o.Policies.Sunset(V1).Effective(SunsetOn)
                          .Link("openapi/v2.json").Title("v2 contract").Type("application/json");
            })
            // Versioned ApiExplorer: one OpenAPI group per version ("v1", "v2"), {version} substituted.
            .AddApiExplorer(o =>
            {
                o.GroupNameFormat = "'v'V";
                o.SubstituteApiVersionInUrl = true;
            });

        // The default document ("v1", declared in Program.cs) keeps the whole lab + people v1.
        // This one only holds what belongs to the v2 group.
        services.AddOpenApi("v2", o => o.ShouldInclude = d => string.Equals(d.GroupName, "v2", StringComparison.Ordinal));
        return services;
    }

    public static IEndpointRouteBuilder MapApiVersioningEndpoints(this IEndpointRouteBuilder app)
    {
        var people = app.NewVersionedApi("People");

        // Same handlers, two ways to carry the version: in the path, or in a header / query string.
        var bySegment = people.MapGroup("/api/v{version:apiVersion}/people");
        var byHeaderOrQuery = people.MapGroup("/api/people");

        foreach (var group in new[] { bySegment, byHeaderOrQuery })
        {
            group.HasDeprecatedApiVersion(V1).HasApiVersion(V2).WithTags("Versioning");

            group.MapGet("", () => TypedResults.Ok(People.Select(p => new PersonV1(p.Id, $"{p.First} {p.Last}", p.Email, p.Since))))
                 .MapToApiVersion(V1);

            group.MapGet("", () => TypedResults.Ok(People.Select(p => new PersonV2(p.Id, p.First, p.Last, p.Email, p.Since))))
                 .MapToApiVersion(V2);
        }

        return app;
    }
}
