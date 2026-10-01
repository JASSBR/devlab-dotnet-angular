using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Products;

namespace DevLab.Api.Tests;

public class ProductsEndpointsTests : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client;

    public ProductsEndpointsTests(LabApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task List_is_paged_and_filtered()
    {
        var page = await _client.GetFromJsonAsync<PagedResult<ProductDto>>("/api/products?category=Training&pageSize=2");

        Assert.NotNull(page);
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(3, page.Total);
        Assert.All(page.Items, p => Assert.Equal("Training", p.Category));
    }

    [Fact]
    public async Task Create_requires_authentication()
    {
        var response = await _client.PostAsJsonAsync("/api/products", new CreateProductRequest("Test", "Hardware", 10, 1));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_validates_the_payload()
    {
        await AuthenticateAsync("alice", "alice123");
        var response = await _client.PostAsJsonAsync("/api/products", new CreateProductRequest("X", "Nope", -1, -5));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"name\"", body);
        Assert.Contains("\"category\"", body);
        Assert.Contains("\"price\"", body);
    }

    [Fact]
    public async Task Create_then_get_then_delete_as_admin()
    {
        await AuthenticateAsync("alice", "alice123");

        var created = await _client.PostAsJsonAsync("/api/products", new CreateProductRequest("Test product", "Hardware", 42, 3));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var dto = await created.Content.ReadFromJsonAsync<ProductDto>();

        var fetched = await _client.GetFromJsonAsync<ProductDto>($"/api/products/{dto!.Id}");
        Assert.Equal("Test product", fetched!.Name);

        var deleted = await _client.DeleteAsync($"/api/products/{dto.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/products/{dto.Id}")).StatusCode);
    }

    [Fact]
    public async Task Delete_is_forbidden_for_non_admin()
    {
        await AuthenticateAsync("bob", "bob123");
        var response = await _client.DeleteAsync("/api/products/1");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task AuthenticateAsync(string user, string password)
    {
        var login = await _client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest(user, password));
        var pair = await login.Content.ReadFromJsonAsync<TokenPair>();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pair!.AccessToken);
    }
}
