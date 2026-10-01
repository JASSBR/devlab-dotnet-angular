using System.Net;
using System.Net.Http.Json;
using DevLab.Api.Features.Auth.Jwt;

namespace DevLab.Api.Tests;

public class AuthTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Jwt_login_refresh_and_rotation()
    {
        var client = factory.CreateClient();

        var login = await client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest("alice", "alice123"));
        var first = (await login.Content.ReadFromJsonAsync<TokenPair>())!;

        var refresh = await client.PostAsJsonAsync("/api/auth/jwt/refresh", new RefreshRequest(first.RefreshToken));
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        var second = (await refresh.Content.ReadFromJsonAsync<TokenPair>())!;
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);

        // Rotation: the old refresh token is dead.
        var replay = await client.PostAsJsonAsync("/api/auth/jwt/refresh", new RefreshRequest(first.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
    }

    [Fact]
    public async Task Wrong_password_is_401()
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest("alice", "nope"));
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Api_key_scheme_authenticates_services()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "test-key");

        var response = await client.GetAsync("/api/auth/whoami");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"name\":\"test-bot\"", body);
        Assert.Contains("ApiKey", body);
    }

    [Fact]
    public async Task Cookie_login_sets_httponly_cookie_and_me_works()
    {
        var client = factory.CreateClient(new() { HandleCookies = true });

        var login = await client.PostAsJsonAsync("/api/auth/cookie/login", new LoginRequest("bob", "bob123"));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var setCookie = login.Headers.GetValues("Set-Cookie").First();
        Assert.Contains("devlab.auth=", setCookie);
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);

        var me = await client.GetAsync("/api/auth/cookie/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Contains("\"name\":\"bob\"", await me.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Policies_admin_and_adult()
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest("bob", "bob123"));
        var pair = (await login.Content.ReadFromJsonAsync<TokenPair>())!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", pair.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/authz/admin")).StatusCode); // bob is not Admin
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/authz/adult")).StatusCode); // bob is 17
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/authz/write")).StatusCode);        // has products:write
    }
}
