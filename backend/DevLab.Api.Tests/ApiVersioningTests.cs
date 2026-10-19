using System.Net;
using System.Text.Json;

namespace DevLab.Api.Tests;

public sealed class ApiVersioningTests(LabApiFactory factory) : IClassFixture<LabApiFactory>
{
    [Fact]
    public async Task Url_segment_selects_the_contract()
    {
        var client = factory.CreateClient();

        var v1 = await FirstPersonAsync(await client.GetAsync("/api/v1/people"));
        var v2 = await FirstPersonAsync(await client.GetAsync("/api/v2/people"));

        Assert.True(v1.TryGetProperty("name", out _));
        Assert.False(v1.TryGetProperty("firstName", out _));
        Assert.True(v2.TryGetProperty("firstName", out _));
        Assert.True(v2.TryGetProperty("lastName", out _));
        Assert.False(v2.TryGetProperty("name", out _));
    }

    [Fact]
    public async Task Header_and_query_string_select_the_contract()
    {
        var client = factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/people");
        request.Headers.Add("api-version", "2.0");
        var byHeader = await FirstPersonAsync(await client.SendAsync(request));
        var byQuery = await FirstPersonAsync(await client.GetAsync("/api/people?api-version=1.0"));

        Assert.True(byHeader.TryGetProperty("firstName", out _));
        Assert.True(byQuery.TryGetProperty("name", out _));
    }

    [Fact]
    public async Task No_version_falls_back_to_the_default_v1()
    {
        var person = await FirstPersonAsync(await factory.CreateClient().GetAsync("/api/people"));
        Assert.True(person.TryGetProperty("name", out _));
    }

    [Fact]
    public async Task Supported_and_deprecated_versions_are_reported()
    {
        var response = await factory.CreateClient().GetAsync("/api/v2/people");

        Assert.Contains("2.0", string.Join(',', response.Headers.GetValues("api-supported-versions")));
        Assert.Contains("1.0", string.Join(',', response.Headers.GetValues("api-deprecated-versions")));
        Assert.False(response.Headers.Contains("Sunset"));
    }

    [Fact]
    public async Task Deprecated_v1_carries_Deprecation_and_Sunset_headers()
    {
        var response = await factory.CreateClient().GetAsync("/api/v1/people");

        Assert.True(response.Headers.Contains("Deprecation"));
        Assert.True(response.Headers.Contains("Sunset"));
        Assert.Contains(response.Headers.GetValues("Link"), l => l.Contains("rel=\"sunset\"", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Unknown_version_is_rejected()
    {
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/people?api-version=3.0")).StatusCode);
        Assert.False((await client.GetAsync("/api/v3/people")).IsSuccessStatusCode);
    }

    [Fact]
    public async Task One_OpenAPI_document_per_version_and_v1_keeps_the_rest_of_the_lab()
    {
        var client = factory.CreateClient();

        var v1 = await client.GetStringAsync("/openapi/v1.json");
        var v2 = await client.GetStringAsync("/openapi/v2.json");

        Assert.Contains("/api/v1/people", v1);
        Assert.Contains("/api/products", v1);          // the existing document is untouched
        Assert.DoesNotContain("/api/v2/people", v1);
        Assert.Contains("/api/v2/people", v2);
        Assert.Contains("firstName", v2);
        Assert.DoesNotContain("/api/products", v2);
    }

    private static async Task<JsonElement> FirstPersonAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement[0].Clone();
    }
}
