using DevLab.Api.Features.Auth;
using DevLab.Api.Features.Auth.ApiKey;
using DevLab.Api.Features.Auth.Authorization;
using DevLab.Api.Features.Auth.Cookie;
using DevLab.Api.Features.Auth.Jwt;
using DevLab.Api.Features.Auth.Oidc;
using DevLab.Api.Features.Auth.Users;
using DevLab.Api.Features.Caching;
using DevLab.Api.Features.Config;
using DevLab.Api.Features.Di;
using DevLab.Api.Features.Greetings;
using DevLab.Api.Features.Middleware;
using DevLab.Api.Features.Products;
using DevLab.Api.Features.Realtime;
using DevLab.Api.Features.SourceCode;
using DevLab.Api.Features.Validation;
using DevLab.Api.Infrastructure;
using DevLab.Api.Infrastructure.Modules;
using Scalar.AspNetCore;

// ─────────────────────────────────────────────────────────────────────────────
// Program.cs is the "composition root": every feature registers its services
// (builder.Services) and its endpoints (app.Map...) through a small extension
// method that lives next to the feature. Read one feature folder = one lesson.
// ─────────────────────────────────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);

// Lesson: Options pattern & configuration
builder.Services.AddLabOptions(builder.Configuration);

// Lesson: DI lifetimes
builder.Services.AddDiLesson();

// Lesson: Middleware pipeline (exception handler + ProblemDetails)
builder.Services.AddMiddlewareLesson();

// Lesson: EF Core + SQLite
builder.Services.AddProductsFeature(builder.Configuration);

// Lesson: Validation (FluentValidation + endpoint filters)
builder.Services.AddValidationLesson();

// Lesson: SignalR + BackgroundService
builder.Services.AddRealtimeLesson();

// Lesson: Caching + rate limiting
builder.Services.AddCachingLesson();

// Lesson: Authentication (JWT, Cookie, API key, OIDC) + Authorization policies
builder.Services.AddLabUsers();
builder.Services.AddLabAuthentication(builder.Configuration);
builder.Services.AddLabAuthorization();
builder.Services.AddFakeIdentityProvider(builder.Configuration);

// Lessons: Vertical Slice + Modular Monolith — modules register themselves (Orders, Products.PublicApi)
builder.Services.AddModules(builder.Configuration, typeof(Program).Assembly);

// Lesson: Minimal API vs Controllers
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Deployment: a cheap endpoint the platform can poll to know the app is alive.
builder.Services.AddHealthChecks();

// The Angular dev server (:4200) proxies /api, /hubs and /idp to us, so same-origin.
// Deployed, the SPA lives on another domain: origins come from configuration
// (Cors__Origins__0=… as an environment variable) — never hardcode a production URL.
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:4200"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

// ── Pipeline order matters: read it top to bottom as a request would ──────────
app.UseExceptionHandler();                 // 1. catch-all → ProblemDetails
app.UseMiddleware<PipelineTraceMiddleware>("after-exception-handler");
app.UseMiddleware<RequestTimingMiddleware>();
app.UseCors();
app.UseRateLimiter();
app.UseOutputCache();
app.UseAuthentication();                   // who are you?
app.UseMiddleware<PipelineTraceMiddleware>("after-authentication");
app.UseAuthorization();                    // are you allowed?
app.UseMiddleware<PipelineTraceMiddleware>("after-authorization");

app.MapHealthChecks("/health");
app.MapOpenApi();
app.MapScalarApiReference();               // http://localhost:5080/scalar/v1

app.MapControllers();
app.MapSourceCodeEndpoints(app.Environment);
app.MapGreetingsEndpoints();
app.MapDiEndpoints();
app.MapMiddlewareEndpoints();
app.MapProductsEndpoints();
app.MapValidationEndpoints();
app.MapRealtimeEndpoints();
app.MapCachingEndpoints();
app.MapConfigEndpoints();
app.MapJwtEndpoints();
app.MapCookieEndpoints();
app.MapApiKeyEndpoints();
app.MapFakeIdentityProviderEndpoints();
app.MapAuthorizationEndpoints();
app.MapWhoAmIEndpoint();
app.MapApiEndpoints(typeof(Program).Assembly);   // every IApiEndpoint slice, discovered by scanning

await app.Services.SeedDatabaseAsync();

await app.RunAsync();

// Exposed so integration tests can bootstrap the app with WebApplicationFactory<Program>.
public partial class Program { }
