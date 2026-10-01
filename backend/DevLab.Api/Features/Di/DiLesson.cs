namespace DevLab.Api.Features.Di;

// ── Three services, identical code, three lifetimes ──────────────────────────
// Each instance gets a Guid when constructed; comparing Guids reveals when the
// container created a new object.
public interface ITransientProbe { Guid Id { get; } }
public interface IScopedProbe { Guid Id { get; } }
public interface ISingletonProbe { Guid Id { get; } }

public sealed class TransientProbe : ITransientProbe { public Guid Id { get; } = Guid.NewGuid(); }
public sealed class ScopedProbe : IScopedProbe { public Guid Id { get; } = Guid.NewGuid(); }
public sealed class SingletonProbe : ISingletonProbe { public Guid Id { get; } = Guid.NewGuid(); }

/// <summary>A consumer that itself depends on the three probes (primary constructor DI).</summary>
public sealed class ProbeConsumer(ITransientProbe transient, IScopedProbe scoped, ISingletonProbe singleton)
{
    public LifetimeSnapshot Snapshot(string owner) => new(owner, transient.Id, scoped.Id, singleton.Id);
}

public record LifetimeSnapshot(string Owner, Guid Transient, Guid Scoped, Guid Singleton);

public static class DiLesson
{
    public static IServiceCollection AddDiLesson(this IServiceCollection services)
    {
        services.AddTransient<ITransientProbe, TransientProbe>(); // new instance every resolve
        services.AddScoped<IScopedProbe, ScopedProbe>();          // one per HTTP request (scope)
        services.AddSingleton<ISingletonProbe, SingletonProbe>(); // one for the app lifetime
        services.AddTransient<ProbeConsumer>();
        return services;
    }

    public static IEndpointRouteBuilder MapDiEndpoints(this IEndpointRouteBuilder app)
    {
        // The endpoint resolves the probes directly AND through two consumers.
        // Within one request: transient differs everywhere, scoped is shared, singleton is shared.
        // Across requests: singleton stays the same, scoped changes.
        app.MapGet("/api/di/lifetimes", (
            ITransientProbe transient, IScopedProbe scoped, ISingletonProbe singleton,
            ProbeConsumer consumerA, ProbeConsumer consumerB) =>
        {
            var snapshots = new[]
            {
                new LifetimeSnapshot("endpoint", transient.Id, scoped.Id, singleton.Id),
                consumerA.Snapshot("consumer A"),
                consumerB.Snapshot("consumer B"),
            };
            return TypedResults.Ok(snapshots);
        })
        .WithTags("DI");

        return app;
    }
}
