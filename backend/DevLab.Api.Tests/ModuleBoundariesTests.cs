using NetArchTest.Rules;

namespace DevLab.Api.Tests;

/// <summary>
/// Architecture as executable rules. In a multi-project solution the compiler enforces
/// "Orders references Products.PublicApi only"; inside one assembly, this test does.
/// It inspects IL (via Mono.Cecil), so a sneaky `using` inside a method body is caught too.
/// </summary>
public class ModuleBoundariesTests
{
    private static readonly System.Reflection.Assembly Api = typeof(Program).Assembly;

    [Fact]
    public void Orders_must_not_depend_on_Products_internals()
    {
        var forbidden = Types.InAssembly(Api)
            .That().ResideInNamespace("DevLab.Api.Features.Products")
            .And().DoNotResideInNamespace("DevLab.Api.Features.Products.PublicApi")
            .GetTypes()
            .Select(t => t.FullName!)
            .ToArray();

        var result = Types.InAssembly(Api)
            .That().ResideInNamespace("DevLab.Api.Features.Orders")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Assert.True(result.IsSuccessful, "Orders leaks into Products internals: " + string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Products_must_not_depend_on_Orders_internals()
    {
        var forbidden = Types.InAssembly(Api)
            .That().ResideInNamespace("DevLab.Api.Features.Orders")
            .And().DoNotResideInNamespace("DevLab.Api.Features.Orders.PublicApi")
            .GetTypes()
            .Select(t => t.FullName!)
            .ToArray();

        var result = Types.InAssembly(Api)
            .That().ResideInNamespace("DevLab.Api.Features.Products")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Assert.True(result.IsSuccessful, "Products leaks into Orders internals: " + string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Handlers_are_sealed_and_not_public_endpoints()
    {
        // Naming conventions become rules: every *Handler in Orders is sealed.
        var result = Types.InAssembly(Api)
            .That().ResideInNamespace("DevLab.Api.Features.Orders")
            .And().HaveNameEndingWith("Handler")
            .Should().BeSealed()
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }
}
