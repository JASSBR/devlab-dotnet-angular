// ─────────────────────────────────────────────────────────────────────────────
// Aspire AppHost: `dotnet run --project backend/DevLab.AppHost` (or ./aspire.sh)
// starts the API and the Angular dev server, then prints the dashboard URL.
// Every resource gets OTEL_EXPORTER_OTLP_ENDPOINT pointing at the dashboard,
// so the API's AddServiceDefaults() starts exporting logs, metrics and traces.
// ─────────────────────────────────────────────────────────────────────────────
var builder = DistributedApplication.CreateBuilder(args);

// The API keeps its launch profile (http://localhost:5080): the Angular proxy (proxy.conf.json)
// targets that port, so nothing changes on the front side.
var api = builder.AddProject<Projects.DevLab_Api>("api")
    .WithHttpHealthCheck("/health/ready")   // the dashboard shows the API "Unhealthy" when readiness fails
    .WithExternalHttpEndpoints();

// `npm start` = `ng serve` on :4200. isProxied: false → Angular listens on 4200 itself.
builder.AddJavaScriptApp("frontend", "../../frontend", "start")
    .WithNpm(install: false)     // ./aspire.sh runs `npm ci` once; no npm install (and lockfile churn) on every boot
    .WithHttpEndpoint(port: 4200, isProxied: false)
    .WithReference(api)          // injects services__api__http__0 (service discovery)
    .WaitFor(api);               // ng serve starts once the API is healthy

await builder.Build().RunAsync();
