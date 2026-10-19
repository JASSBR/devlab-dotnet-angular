using System.Net;
using System.Net.Http.Json;
using DevLab.Api.Features.CSharp;

namespace DevLab.Api.Tests;

public class CSharpFundamentalsTests : IClassFixture<LabApiFactory>
{
    private readonly HttpClient _client;

    public CSharpFundamentalsTests(LabApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Struct_is_copied_class_is_shared()
    {
        var scenarios = await _client.GetFromJsonAsync<List<CopyScenario>>("/api/csharp/struct-vs-class");

        Assert.NotNull(scenarios);
        var structAssign = scenarios.Single(s => s.Kind == "struct" && s.Scenario == "assignment");
        Assert.Equal(structAssign.OriginalBefore, structAssign.OriginalAfter);   // the copy was modified, not the original
        Assert.NotEqual(structAssign.CopyAfter, structAssign.OriginalAfter);

        var classAssign = scenarios.Single(s => s.Kind == "class" && s.Scenario == "assignment");
        Assert.Equal(classAssign.CopyAfter, classAssign.OriginalAfter);         // same object behind both variables
        Assert.NotEqual(classAssign.OriginalBefore, classAssign.OriginalAfter);

        var structMethod = scenarios.Single(s => s.Kind == "struct" && s.Scenario == "method argument");
        Assert.Equal(structMethod.OriginalBefore, structMethod.OriginalAfter);
        var classMethod = scenarios.Single(s => s.Kind == "class" && s.Scenario == "method argument");
        Assert.NotEqual(classMethod.OriginalBefore, classMethod.OriginalAfter);
    }

    [Fact]
    public async Task Records_have_value_equality_and_with_copies()
    {
        var snippets = await GetSnippetsAsync("/api/csharp/records");

        Assert.Equal("True", Result(snippets, "record =="));
        Assert.Equal("False", Result(snippets, "ReferenceEquals"));
        Assert.Equal("False", Result(snippets, "class =="));
        Assert.Contains("Paris", Result(snippets, "original after with"));
    }

    [Theory]
    [InlineData("", "empty")]
    [InlineData("7", "one element: 7")]
    [InlineData("0,4,5", "starts with 0")]
    [InlineData("3,8,3", "same first and last (3)")]
    [InlineData("1,2,3,4", "4 elements, 2 after the first two")]
    public async Task List_patterns_classify_the_numbers(string numbers, string expected)
    {
        var snippets = await GetSnippetsAsync($"/api/csharp/patterns?numbers={numbers}&country=FR&total=120");
        Assert.Equal(expected, Result(snippets, "list pattern"));
    }

    [Theory]
    [InlineData("FR", 120, false, "0")]
    [InlineData("FR", 40, false, "4.90")]
    [InlineData("BE", 200, false, "0")]
    [InlineData("US", 30, false, "12")]
    [InlineData("FR", 500, true, "15")]
    public async Task Property_and_relational_patterns_compute_shipping(string country, decimal total, bool express, string fee)
    {
        var snippets = await GetSnippetsAsync($"/api/csharp/patterns?numbers=1&country={country}&total={total}&express={express}");
        Assert.Equal(fee, Result(snippets, "property pattern"));
    }

    [Theory]
    [InlineData(50, "withdrawn")]
    [InlineData(110, "overdraft accepted")]
    [InlineData(500, "refused")]
    [InlineData(-5, "invalid amount")]
    public async Task Exception_filters_route_each_failure(decimal amount, string outcome)
    {
        var demo = await _client.GetFromJsonAsync<ExceptionDemo>($"/api/csharp/exceptions?amount={amount}");

        Assert.NotNull(demo);
        Assert.Equal(outcome, demo.Outcome);
        Assert.StartsWith("finally", demo.Trace[^1], StringComparison.Ordinal);   // finally always runs, last
    }

    [Fact]
    public async Task Exception_filter_is_evaluated_before_the_catch_runs()
    {
        var demo = await _client.GetFromJsonAsync<ExceptionDemo>("/api/csharp/exceptions?amount=500");
        Assert.Contains(demo!.Trace, t => t.StartsWith("filter", StringComparison.Ordinal) && t.EndsWith("false", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Strings_compare_concatenation_and_string_builder()
    {
        var demo = await _client.GetFromJsonAsync<StringsDemo>("/api/csharp/strings?n=2000");

        Assert.NotNull(demo);
        Assert.Equal(2000, demo.N);
        Assert.Equal(demo.ConcatLength, demo.BuilderLength);
        Assert.Equal("hello", Result(demo.Snippets, "immutability"));
    }

    [Fact]
    public async Task Strings_clamp_n_to_protect_the_server()
    {
        var demo = await _client.GetFromJsonAsync<StringsDemo>("/api/csharp/strings?n=99999999");
        Assert.Equal(StringsLab.MaxN, demo!.N);
    }

    [Fact]
    public async Task Flags_enum_combines_bits()
    {
        var demo = await _client.GetFromJsonAsync<FlagsDemo>("/api/csharp/flags?permissions=Read,Delete");

        Assert.NotNull(demo);
        Assert.Equal(5, demo.Value);
        Assert.Equal("0101", demo.Binary);
        Assert.Equal("Read, Delete", demo.Name);
        Assert.False(demo.CanWrite);
        Assert.True(demo.CanDelete);
        Assert.False(demo.IsAdmin);
    }

    [Fact]
    public async Task Flags_rejects_unknown_values()
    {
        var response = await _client.GetAsync("/api/csharp/flags?permissions=Read,Fly");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Basics_show_inference_methods_and_nullability()
    {
        var snippets = await GetSnippetsAsync("/api/csharp/basics");

        Assert.Equal("System.Decimal", Result(snippets, "var"));
        Assert.Equal("12.50 USD", Result(snippets, "named arguments"));
        Assert.Equal("True → 42", Result(snippets, "out"));
        Assert.Equal("0", Result(snippets, "null-conditional"));
    }

    [Fact]
    public async Task Oop_shows_generics_default_members_and_composition()
    {
        var snippets = await GetSnippetsAsync("/api/csharp/oop");

        Assert.Equal("9", Result(snippets, "generic Max<int>"));
        Assert.Equal("pear", Result(snippets, "generic Max<string>"));
        Assert.Equal("Hello, Ada!", Result(snippets, "default interface member"));
        Assert.Contains("NotSupportedException", Result(snippets, "inheritance"));
        Assert.Equal("Penguin: waddles, honks", Result(snippets, "composition"));
    }

    private async Task<List<Snippet>> GetSnippetsAsync(string url)
    {
        var snippets = await _client.GetFromJsonAsync<List<Snippet>>(url);
        Assert.NotNull(snippets);
        return snippets;
    }

    private static string Result(IEnumerable<Snippet> snippets, string concept) =>
        snippets.Single(s => s.Concept == concept).Result;
}
