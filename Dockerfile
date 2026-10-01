# ── Build stage ──────────────────────────────────────────────────────────────
# The SDK image is ~800 MB; it never ships. Only the published output moves on.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the manifests first: this layer is cached as long as no package changes,
# so a code-only edit skips the (slow) restore entirely.
COPY backend/Directory.Build.props backend/Directory.Packages.props backend/.editorconfig ./
COPY backend/DevLab.Api/DevLab.Api.csproj DevLab.Api/
RUN dotnet restore DevLab.Api/DevLab.Api.csproj

COPY backend/ ./
# Analyzers + TreatWarningsAsErrors run here too: a warning fails the image build.
RUN dotnet publish DevLab.Api/DevLab.Api.csproj -c Release -o /app/publish --no-restore

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

# The /api/source endpoint reads the project's real files from disk. Ship them so
# the deployed lab shows live code; SourceCodeEndpoints locates the root by
# looking for a "frontend" directory next to the content root (/app).
COPY backend/ ./backend/
COPY frontend/src/ ./frontend/src/
COPY frontend/proxy.conf.json ./frontend/

# SQLite files live in a dedicated directory owned by the non-root app user.
RUN mkdir -p /data && chown -R app:app /data /app
USER app
ENV ConnectionStrings__Default="Data Source=/data/devlab.db" \
    ConnectionStrings__Orders="Data Source=/data/orders.db" \
    DOTNET_CLI_TELEMETRY_OPTOUT=1

EXPOSE 8080
# Railway (and most PaaS) inject the port to listen on; default to 8080 locally.
ENTRYPOINT ["/bin/sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} exec dotnet DevLab.Api.dll"]
