using DevLab.Api.Features.Products;
using FluentValidation;

namespace DevLab.Api.Features.Validation;

/// <summary>Rules live in one place, are unit-testable, and read like a spec.</summary>
public sealed class CreateProductValidator : AbstractValidator<CreateProductRequest>
{
    private static readonly string[] Categories = ["Hardware", "Software", "Training", "Furniture"];

    public CreateProductValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(3).MaximumLength(120);
        RuleFor(x => x.Category).Must(c => Categories.Contains(c))
            .WithMessage($"Category must be one of: {string.Join(", ", Categories)}");
        RuleFor(x => x.Price).GreaterThan(0).LessThanOrEqualTo(10_000);
        RuleFor(x => x.Stock).GreaterThanOrEqualTo(0);
        RuleFor(x => x).Must(x => !(x.Category == "Software" && x.Stock < 100))
            .WithName("stock").WithMessage("Software is a digital good: stock must be ≥ 100");
    }
}

public sealed class UpdateProductValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(3);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.Stock).GreaterThanOrEqualTo(0);
    }
}

public record RegisterRequest(string Email, string Password, string ConfirmPassword, int Age);

public sealed class RegisterValidator : AbstractValidator<RegisterRequest>
{
    public RegisterValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).MinimumLength(8).Matches("[0-9]").WithMessage("Password needs a digit");
        RuleFor(x => x.ConfirmPassword).Equal(x => x.Password).WithMessage("Passwords do not match");
        RuleFor(x => x.Age).InclusiveBetween(13, 120);
    }
}

public static class ValidationLesson
{
    public static IServiceCollection AddValidationLesson(this IServiceCollection services)
    {
        // Scans the assembly and registers every AbstractValidator<T> as IValidator<T>.
        services.AddValidatorsFromAssemblyContaining<CreateProductValidator>();
        return services;
    }

    public static IEndpointRouteBuilder MapValidationEndpoints(this IEndpointRouteBuilder app)
    {
        // Public playground endpoint: submit anything, see the ProblemDetails shape.
        app.MapPost("/api/validation/register", (RegisterRequest req) =>
                TypedResults.Ok(new { message = $"Welcome {req.Email}!" }))
           .AddEndpointFilter<ValidationFilter<RegisterRequest>>()
           .WithTags("Validation");

        return app;
    }
}
