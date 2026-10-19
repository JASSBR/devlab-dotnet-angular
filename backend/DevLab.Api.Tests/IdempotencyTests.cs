using System.Net;
using System.Net.Http.Json;
using DevLab.Api.Features.Orders.PlaceOrder;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Infrastructure.Idempotency;

namespace DevLab.Api.Tests;

public class IdempotencyTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Replaying_the_same_key_and_payload_returns_the_stored_response_without_a_second_order()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        var key = Guid.NewGuid().ToString();
        var before = await CountOrdersAsync(client);

        var first = await PostAsync(client, key, new PlaceOrderRequest(3, 1));
        var replay = await PostAsync(client, key, new PlaceOrderRequest(3, 1));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode);
        Assert.False(first.Headers.Contains(IdempotencyHeaders.Replayed));
        Assert.Equal("true", Assert.Single(replay.Headers.GetValues(IdempotencyHeaders.Replayed)));
        Assert.Equal((await first.Content.ReadFromJsonAsync<OrderDto>())!.Id, (await replay.Content.ReadFromJsonAsync<OrderDto>())!.Id);
        Assert.Equal(before + 1, await CountOrdersAsync(client));
    }

    [Fact]
    public async Task Same_key_with_another_payload_is_a_422()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        var key = Guid.NewGuid().ToString();

        await PostAsync(client, key, new PlaceOrderRequest(3, 1));
        var mismatch = await PostAsync(client, key, new PlaceOrderRequest(3, 2));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, mismatch.StatusCode);
        Assert.Contains("idempotency.payload_mismatch", await mismatch.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Keys_are_scoped_per_user()
    {
        var bob = await factory.LoggedInAsync("bob", "bob123");
        var carol = await factory.LoggedInAsync("carol", "carol123");
        var key = Guid.NewGuid().ToString();

        var bobOrder = await (await PostAsync(bob, key, new PlaceOrderRequest(3, 1))).Content.ReadFromJsonAsync<OrderDto>();
        var carolResponse = await PostAsync(carol, key, new PlaceOrderRequest(3, 1));

        // Same key, other user: a brand-new order, never bob's stored response.
        Assert.Equal(HttpStatusCode.Created, carolResponse.StatusCode);
        Assert.False(carolResponse.Headers.Contains(IdempotencyHeaders.Replayed));
        Assert.NotEqual(bobOrder!.Id, (await carolResponse.Content.ReadFromJsonAsync<OrderDto>())!.Id);
    }

    [Fact]
    public async Task Business_errors_are_replayed_too_and_invalid_requests_do_not_claim_the_key()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");

        var outOfStock = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.Conflict, (await PostAsync(client, outOfStock, new PlaceOrderRequest(4, 1))).StatusCode);
        var replayed = await PostAsync(client, outOfStock, new PlaceOrderRequest(4, 1));
        Assert.Equal(HttpStatusCode.Conflict, replayed.StatusCode);
        Assert.True(replayed.Headers.Contains(IdempotencyHeaders.Replayed));

        // The validation filter runs first: a 400 never reaches the idempotency filter.
        var key = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.BadRequest, (await PostAsync(client, key, new PlaceOrderRequest(3, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostAsync(client, key, new PlaceOrderRequest(3, 1))).StatusCode);
    }

    [Fact]
    public async Task Concurrent_duplicates_create_a_single_order()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        var key = Guid.NewGuid().ToString();
        var before = await CountOrdersAsync(client);

        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => PostAsync(client, key, new PlaceOrderRequest(3, 1))));

        // The winner gets 201; the others either replay it (201) or are told to retry later (409).
        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }));
        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.Created && !r.Headers.Contains(IdempotencyHeaders.Replayed));
        Assert.Equal(before + 1, await CountOrdersAsync(client));
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string key, PlaceOrderRequest request)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "/api/orders") { Content = JsonContent.Create(request) };
        message.Headers.Add(IdempotencyHeaders.Key, key);
        return client.SendAsync(message);
    }

    private static async Task<int> CountOrdersAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders"))!.Count;
}
