using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Orders.PlaceOrder;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;

namespace DevLab.Api.Tests;

public class OrdersSliceTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Placing_an_order_decrements_stock_through_the_event()
    {
        var client = await LoggedInAsync("bob", "bob123");

        var before = (await client.GetFromJsonAsync<ProductDto>("/api/products/1"))!;
        var response = await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(1, 2));
        var order = await response.Content.ReadFromJsonAsync<OrderDto>();
        var after = (await client.GetFromJsonAsync<ProductDto>("/api/products/1"))!;

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("bob", order!.CustomerName);
        Assert.Equal(before.Price * 2, order.Total);
        Assert.Equal(before.Stock - 2, after.Stock);     // OrderPlaced → Products.OrderPlacedHandler
    }

    [Fact]
    public async Task Insufficient_stock_is_a_409_with_an_error_code()
    {
        var client = await LoggedInAsync("bob", "bob123");

        var response = await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(4, 5)); // product 4 has stock 0
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("orders.insufficient_stock", body);
    }

    [Fact]
    public async Task Unknown_product_is_a_404_and_quantity_is_validated()
    {
        var client = await LoggedInAsync("bob", "bob123");

        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(9999, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(1, 0))).StatusCode);
    }

    [Fact]
    public async Task Users_only_see_their_own_orders_and_cannot_cancel_others()
    {
        var bob = await LoggedInAsync("bob", "bob123");
        var carol = await LoggedInAsync("carol", "carol123");

        var created = await (await bob.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(3, 1))).Content.ReadFromJsonAsync<OrderDto>();

        var carolOrders = await carol.GetFromJsonAsync<List<OrderDto>>("/api/orders");
        Assert.DoesNotContain(carolOrders!, o => o.Id == created!.Id);

        var forbidden = await carol.PostAsync($"/api/orders/{created!.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var cancelled = await bob.PostAsync($"/api/orders/{created.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        var again = await bob.PostAsync($"/api/orders/{created.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);   // orders.already_cancelled
    }

    private async Task<HttpClient> LoggedInAsync(string user, string password)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/jwt/login", new LoginRequest(user, password));
        var pair = await login.Content.ReadFromJsonAsync<TokenPair>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pair!.AccessToken);
        return client;
    }
}
