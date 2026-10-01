using System.Reflection;

namespace DevLab.Api.Infrastructure.Modules;

public static class ModuleExtensions
{
    /// <summary>Instantiates every IModule in the assembly and lets it register its services.</summary>
    public static IServiceCollection AddModules(this IServiceCollection services, IConfiguration configuration, Assembly assembly)
    {
        foreach (var module in Discover<IModule>(assembly))
            module.Register(services, configuration);
        return services;
    }

    /// <summary>Instantiates every IApiEndpoint and maps it. Adding a slice = adding a file, nothing else.</summary>
    public static IEndpointRouteBuilder MapApiEndpoints(this IEndpointRouteBuilder app, Assembly assembly)
    {
        foreach (var endpoint in Discover<IApiEndpoint>(assembly))
            endpoint.Map(app);
        return app;
    }

    private static IEnumerable<T> Discover<T>(Assembly assembly) =>
        assembly.GetTypes()
            .Where(t => typeof(T).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false })
            .Select(t => (T)Activator.CreateInstance(t)!);
}
