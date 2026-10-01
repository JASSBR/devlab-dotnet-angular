using FluentValidation;

namespace DevLab.Api.Features.Validation;

/// <summary>
/// Generic endpoint filter: finds the argument of type T, runs its validator and
/// short-circuits with a 400 ValidationProblemDetails when invalid.
/// Registered per endpoint with .AddEndpointFilter&lt;ValidationFilter&lt;T&gt;&gt;().
/// </summary>
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var model = ctx.Arguments.OfType<T>().FirstOrDefault();
        if (model is null) return await next(ctx);

        var result = await validator.ValidateAsync(model, ctx.HttpContext.RequestAborted);
        if (result.IsValid) return await next(ctx);

        var errors = result.Errors
            .GroupBy(e => e.PropertyName)
            .ToDictionary(g => char.ToLowerInvariant(g.Key[0]) + g.Key[1..], g => g.Select(e => e.ErrorMessage).ToArray());

        return TypedResults.ValidationProblem(errors, title: "One or more validation errors occurred.");
    }
}
