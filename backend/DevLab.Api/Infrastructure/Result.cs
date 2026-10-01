namespace DevLab.Api.Infrastructure;

/// <summary>
/// Expected business failures are VALUES, not exceptions. An exception is for the unexpected
/// (bug, network down); "product not found" or "insufficient stock" are normal outcomes that
/// the caller must handle — the type system now forces it.
/// </summary>
public enum ErrorType { Validation, NotFound, Conflict, Forbidden }

public sealed record Error(string Code, string Description, ErrorType Type)
{
    public static Error NotFound(string code, string description) => new(code, description, ErrorType.NotFound);
    public static Error Conflict(string code, string description) => new(code, description, ErrorType.Conflict);
    public static Error Validation(string code, string description) => new(code, description, ErrorType.Validation);
    public static Error Forbidden(string code, string description) => new(code, description, ErrorType.Forbidden);
}

public readonly record struct Result<T>
{
    public T? Value { get; }
    public Error? Error { get; }
    public bool IsSuccess => Error is null;

    private Result(T? value, Error? error) { Value = value; Error = error; }

    public static Result<T> Success(T value) => new(value, null);
    public static Result<T> Failure(Error error) => new(default, error);

    // Implicit conversions keep handlers readable: `return order;` or `return OrderErrors.NotFound(id);`
    public static implicit operator Result<T>(T value) => Success(value);
    public static implicit operator Result<T>(Error error) => Failure(error);

    /// <summary>Railway-style: one place decides what happens in each branch.</summary>
    public TOut Match<TOut>(Func<T, TOut> onSuccess, Func<Error, TOut> onFailure) =>
        IsSuccess ? onSuccess(Value!) : onFailure(Error!);
}

public static class ResultExtensions
{
    /// <summary>Maps an Error to the right HTTP status + ProblemDetails. Endpoints never switch on ErrorType themselves.</summary>
    public static IResult ToProblem(this Error error) => Results.Problem(
        statusCode: error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            _ => StatusCodes.Status500InternalServerError,
        },
        title: error.Description,
        extensions: new Dictionary<string, object?> { ["code"] = error.Code });
}
