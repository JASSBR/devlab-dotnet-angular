using System.Security.Claims;
using Microsoft.AspNetCore.Identity;

namespace DevLab.Api.Features.Auth.Users;

public sealed record LabUser(string Id, string UserName, string DisplayName, string PasswordHash,
                             string[] Roles, string[] Permissions, int Age);

/// <summary>
/// Stand-in for a real user table (ASP.NET Identity, or your own). Passwords are
/// hashed with PBKDF2 via PasswordHasher — never store plain text, even in a lab.
/// </summary>
public sealed class InMemoryUserStore
{
    private readonly PasswordHasher<string> _hasher = new();
    private readonly List<LabUser> _users;

    public InMemoryUserStore()
    {
        _users =
        [
            Create("u-1", "alice", "Alice (Admin)", "alice123", ["Admin", "User"], ["products:write", "products:delete"], 34),
            Create("u-2", "bob", "Bob (User)", "bob123", ["User"], ["products:write"], 17),
            Create("u-3", "carol", "Carol (Viewer)", "carol123", ["User"], [], 25),
        ];
    }

    public LabUser? Validate(string userName, string password)
    {
        var user = _users.FirstOrDefault(u => u.UserName.Equals(userName, StringComparison.OrdinalIgnoreCase));
        if (user is null) return null;
        return _hasher.VerifyHashedPassword(user.UserName, user.PasswordHash, password)
            is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded ? user : null;
    }

    public LabUser? FindByName(string userName) =>
        _users.FirstOrDefault(u => u.UserName.Equals(userName, StringComparison.OrdinalIgnoreCase));

    public IEnumerable<object> Directory() => _users.Select(u => new { u.UserName, u.DisplayName, u.Roles, u.Permissions, u.Age });

    /// <summary>Claims are the universal currency of ASP.NET auth: every scheme ends up producing them.</summary>
    public static IEnumerable<Claim> ClaimsFor(LabUser user)
    {
        yield return new Claim(ClaimTypes.NameIdentifier, user.Id);
        yield return new Claim(ClaimTypes.Name, user.UserName);
        yield return new Claim("display_name", user.DisplayName);
        yield return new Claim("age", user.Age.ToString());
        foreach (var r in user.Roles) yield return new Claim(ClaimTypes.Role, r);
        foreach (var p in user.Permissions) yield return new Claim("permission", p);
    }

    private LabUser Create(string id, string name, string display, string pwd, string[] roles, string[] perms, int age) =>
        new(id, name, display, _hasher.HashPassword(name, pwd), roles, perms, age);
}

public static class UsersLesson
{
    public static IServiceCollection AddLabUsers(this IServiceCollection services) =>
        services.AddSingleton<InMemoryUserStore>();
}
