namespace DevLab.Api.Infrastructure.Modules;

/// <summary>
/// A module = a bounded business area (Orders, Products…) that owns its data, its endpoints
/// and its services. Program.cs does not know the modules by name: it discovers them.
/// In a multi-project solution each module is its own assembly, referenced only through
/// its *.PublicApi project. Here they are folders in one assembly, and an architecture test
/// (ModuleBoundariesTests) enforces the same rule.
/// </summary>
public interface IModule
{
    void Register(IServiceCollection services, IConfiguration configuration);
}

/// <summary>One class per endpoint (a "slice"): found by assembly scanning, mapped automatically.</summary>
public interface IApiEndpoint
{
    void Map(IEndpointRouteBuilder app);
}
