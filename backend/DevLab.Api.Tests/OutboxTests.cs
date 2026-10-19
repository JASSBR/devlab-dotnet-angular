using System.Net;
using System.Net.Http.Json;
using DevLab.Api.Features.Orders.Outbox;
using DevLab.Api.Features.Orders.PlaceOrder;
using DevLab.Api.Features.Orders.Shared;
using DevLab.Api.Features.Products;
using DevLab.Api.Features.Products.PublicApi;
using DevLab.Api.Infrastructure.Messaging;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace DevLab.Api.Tests;

public class OutboxTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Placing_an_order_writes_an_outbox_row_and_the_stock_moves_only_once_it_is_dispatched()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        await factory.FlushOutboxAsync();
        var before = await StockAsync(client, 5);

        var order = await (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(5, 3))).Content.ReadFromJsonAsync<OrderDto>();
        var pending = await MessageForAsync(client, order!.Id);

        Assert.Equal("OrderPlaced", pending.Type);
        Assert.Equal("pending", pending.Status);
        Assert.Equal(before, await StockAsync(client, 5));          // nothing delivered yet: eventual consistency

        Assert.True(await factory.FlushOutboxAsync() >= 1);
        var processed = await MessageForAsync(client, order.Id);

        Assert.Equal("processed", processed.Status);
        Assert.Equal(1, processed.Attempts);
        Assert.Equal(before - 3, await StockAsync(client, 5));
    }

    [Fact]
    public async Task A_failing_handler_is_retried_until_it_succeeds()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        await factory.FlushOutboxAsync();
        var before = await StockAsync(client, 6);
        await client.PostAsJsonAsync("/api/outbox/faults", new ArmFaultsRequest(2));

        var order = await (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(6, 1))).Content.ReadFromJsonAsync<OrderDto>();
        await factory.FlushOutboxAsync();
        var failed = await MessageForAsync(client, order!.Id);
        await factory.FlushOutboxAsync();
        await factory.FlushOutboxAsync();
        var processed = await MessageForAsync(client, order.Id);

        Assert.Equal("retrying", failed.Status);
        Assert.Contains("Simulated failure", failed.Error);
        Assert.Equal("processed", processed.Status);
        Assert.Equal(3, processed.Attempts);
        Assert.Null(processed.Error);
        Assert.Equal(before - 1, await StockAsync(client, 6));      // decremented once, despite 3 deliveries
    }

    [Fact]
    public async Task After_max_attempts_a_message_is_parked_as_poison()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        await factory.FlushOutboxAsync();
        await client.PostAsJsonAsync("/api/outbox/faults", new ArmFaultsRequest(10));

        var order = await (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(7, 1))).Content.ReadFromJsonAsync<OrderDto>();
        for (var i = 0; i < 7; i++) await factory.FlushOutboxAsync();
        await client.PostAsJsonAsync("/api/outbox/faults", new ArmFaultsRequest(0));
        var poison = await MessageForAsync(client, order!.Id);

        Assert.Equal("poison", poison.Status);
        Assert.Equal(5, poison.Attempts);                            // MaxAttempts, not 7: no more retries
    }

    [Fact]
    public async Task Redelivering_a_processed_message_is_absorbed_by_the_inbox()
    {
        var client = await factory.LoggedInAsync("bob", "bob123");
        var order = await (await client.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(8, 2))).Content.ReadFromJsonAsync<OrderDto>();
        await factory.FlushOutboxAsync();
        var message = await MessageForAsync(client, order!.Id);
        var afterFirst = await StockAsync(client, 8);

        var redeliver = await client.PostAsync($"/api/outbox/{message.Id}/redeliver", null);

        Assert.Equal(HttpStatusCode.NoContent, redeliver.StatusCode);
        Assert.Equal(afterFirst, await StockAsync(client, 8));      // at-least-once delivery, exactly-once effect
    }

    [Fact]
    public async Task Order_and_outbox_message_commit_in_the_same_transaction()
    {
        // A dedicated database whose SaveChanges blows up when the outbox row is written.
        var path = Path.Combine(Path.GetTempPath(), $"devlab-tx-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<OrdersDbContext>()
            .UseSqlite($"Data Source={path};Pooling=False")
            .AddInterceptors(new FailWhenOutboxIsWritten())
            .Options;
        try
        {
            await using (var setup = new OrdersDbContext(options)) await setup.Database.MigrateAsync();

            await using (var db = new OrdersDbContext(options))
            {
                var handler = new PlaceOrderHandler(db, new FixedCatalog());
                await Assert.ThrowsAsync<InvalidOperationException>(() => handler.HandleAsync(new PlaceOrderRequest(1, 1), "bob", CancellationToken.None));
            }

            await using var check = new OrdersDbContext(options);
            Assert.Equal(0, await check.Orders.CountAsync());           // the first SaveChanges (the order) was rolled back
            Assert.Equal(0, await check.OutboxMessages.CountAsync());
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static async Task<OutboxRow> MessageForAsync(HttpClient client, int orderId)
    {
        var state = await client.GetFromJsonAsync<OutboxState>("/api/outbox");
        return state!.Messages.Single(m => m.Type == "OrderPlaced" && m.Payload.Contains($"\"orderId\":{orderId},", StringComparison.Ordinal));
    }

    private static async Task<int> StockAsync(HttpClient client, int productId) =>
        (await client.GetFromJsonAsync<ProductDto>($"/api/products/{productId}"))!.Stock;

    private sealed class FixedCatalog : IProductCatalog
    {
        public Task<ProductInfo?> FindAsync(int productId, CancellationToken ct) =>
            Task.FromResult<ProductInfo?>(new ProductInfo(productId, "Test", 10m, 100));
    }

    private sealed class FailWhenOutboxIsWritten : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default) =>
            eventData.Context!.ChangeTracker.Entries<OutboxMessage>().Any(e => e.State == EntityState.Added)
                ? throw new InvalidOperationException("outbox write failed")
                : base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
