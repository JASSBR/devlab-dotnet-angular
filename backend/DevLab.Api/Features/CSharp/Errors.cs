using System.Globalization;

namespace DevLab.Api.Features.CSharp;

/// <summary>
/// A custom exception carries DATA about the failure (here: the shortfall), so callers
/// can react precisely instead of parsing a message. Derive from Exception, never ApplicationException.
/// </summary>
public sealed class InsufficientFundsException : Exception
{
    public InsufficientFundsException() { }
    public InsufficientFundsException(string message) : base(message) { }
    public InsufficientFundsException(string message, Exception innerException) : base(message, innerException) { }

    public InsufficientFundsException(decimal balance, decimal amount)
        : base($"Cannot withdraw {amount} with a balance of {balance}.")
        => Shortfall = amount - balance;

    public decimal Shortfall { get; }
}

public sealed class BankAccount(decimal balance)
{
    public decimal Balance { get; private set; } = balance;

    public void Withdraw(decimal amount, bool allowOverdraft = false)
    {
        // Guard clauses: fail fast with the most specific built-in exception.
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(amount);
        if (amount > Balance && !allowOverdraft)
            throw new InsufficientFundsException(Balance, amount);
        Balance -= amount;
    }
}

public record ExceptionDemo(decimal Amount, decimal BalanceAfter, string Outcome, IReadOnlyList<string> Trace);

public static class ErrorsLab
{
    public const decimal StartingBalance = 100m;
    public const decimal OverdraftLimit = 20m;

    public static ExceptionDemo Run(decimal amount)
    {
        var trace = new List<string>();
        var account = new BankAccount(StartingBalance);
        string outcome;

        try
        {
            trace.Add($"try: Withdraw({Fmt(amount)}) on a balance of {Fmt(account.Balance)}");
            account.Withdraw(amount);
            outcome = "withdrawn";
            trace.Add("try: no exception");
        }
        // Exception filter: evaluated BEFORE the stack unwinds. If it returns false, this catch
        // is skipped as if it did not exist — unlike `catch { if (...) throw; }` which loses the
        // original throw site for debuggers. TypeScript has no equivalent (one catch, then if/else).
        catch (InsufficientFundsException ex) when (Filter(trace, ex.Shortfall))
        {
            trace.Add($"catch (when Shortfall <= {Fmt(OverdraftLimit)}): small overdraft, retry with allowOverdraft");
            account.Withdraw(amount, allowOverdraft: true);
            outcome = "overdraft accepted";
        }
        catch (InsufficientFundsException ex)
        {
            trace.Add($"catch InsufficientFundsException: {ex.Message} (shortfall {Fmt(ex.Shortfall)})");
            outcome = "refused";
        }
        catch (ArgumentOutOfRangeException ex)
        {
            trace.Add($"catch ArgumentOutOfRangeException: {ex.ParamName} must be > 0");
            outcome = "invalid amount";
        }
        finally
        {
            // Runs on every path: success, handled exception, even an unhandled one or a `return`.
            trace.Add($"finally: always runs — balance is now {Fmt(account.Balance)}");
        }

        return new ExceptionDemo(amount, account.Balance, outcome, trace);
    }

    private static bool Filter(List<string> trace, decimal shortfall)
    {
        var accepted = shortfall <= OverdraftLimit;
        trace.Add($"filter evaluated: shortfall {Fmt(shortfall)} <= {Fmt(OverdraftLimit)} → {(accepted ? "true" : "false")}");
        return accepted;
    }

    private static string Fmt(decimal value) => value.ToString(CultureInfo.InvariantCulture);
}
