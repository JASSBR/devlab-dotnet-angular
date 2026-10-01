#!/usr/bin/env bash
# Deploys the .NET API to Railway, then points the Vercel frontend at it.
# Prerequisite (one interactive step, opens a browser): railway login
set -euo pipefail
cd "$(dirname "$0")"

VERCEL_URL="${VERCEL_URL:-https://devlab-dotnet-angular.vercel.app}"
PROJECT="${RAILWAY_PROJECT:-devlab-api}"

railway whoami >/dev/null 2>&1 || { echo "✗ Not logged in. Run:  railway login"; exit 1; }

# ── 1. Project ───────────────────────────────────────────────────────────────
if [ ! -f .railway/config.json ] && [ ! -d .railway ]; then
  echo "→ Creating Railway project '$PROJECT'"
  railway init --name "$PROJECT"
fi

# ── 2. Secrets & configuration (never committed) ─────────────────────────────
# A fresh signing key per deployment: the one in appsettings.Development.json is
# public (it is displayed by the lab itself) and must never sign real tokens.
JWT_KEY="${JWT_KEY:-$(openssl rand -base64 48 | tr -d '\n')}"

echo "→ Setting environment variables"
railway variables \
  --set "ASPNETCORE_ENVIRONMENT=Production" \
  --set "Jwt__SigningKey=$JWT_KEY" \
  --set "Cors__Origins__0=$VERCEL_URL" \
  --set "Idp__RedirectUris__0=$VERCEL_URL/lessons/auth-oidc/callback" \
  --set "Idp__RedirectUris__1=http://localhost:4200/lessons/auth-oidc/callback" \
  --set "ApiKeys__Keys__0__Key=lab-key-123" \
  --set "ApiKeys__Keys__0__Owner=reporting-service" \
  --set "ApiKeys__Keys__0__Roles__0=Service" \
  --set "ApiKeys__Keys__1__Key=lab-admin-key" \
  --set "ApiKeys__Keys__1__Owner=ops-bot" \
  --set "ApiKeys__Keys__1__Roles__0=Service" \
  --set "ApiKeys__Keys__1__Roles__1=Admin" \
  --skip-deploys

# ── 3. Build & deploy the Docker image ───────────────────────────────────────
echo "→ Deploying (Dockerfile at repo root)"
railway up --detach

echo "→ Waiting for a public domain"
API_URL="$(railway domain 2>/dev/null | grep -oE 'https?://[^ ]+' | head -1 || true)"
[ -n "$API_URL" ] || API_URL="$(railway status --json 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.up\.railway\.app' | head -1 || true)"
[ -n "$API_URL" ] || { echo "✗ No domain yet. Run 'railway domain' and re-run with API_URL=… ./deploy-backend.sh"; exit 1; }
echo "  API: $API_URL"

# ── 4. Point the frontend at it ──────────────────────────────────────────────
# /api and /idp are PROXIED by Vercel so the browser stays same-origin (cookies, CSRF).
# WebSockets cannot be proxied: SignalR dials the API directly, allowed by CORS above.
echo "→ Wiring the frontend"
python3 - "$API_URL" <<'PY'
import json, sys
api = sys.argv[1].rstrip('/')
with open('frontend/vercel.json') as f: cfg = json.load(f)
cfg['rewrites'] = [
    {"source": "/api/:path*", "destination": f"{api}/api/:path*"},
    {"source": "/idp/:path*", "destination": f"{api}/idp/:path*"},
    {"source": "/((?!api/|idp/|hubs/).*)", "destination": "/index.html"},
]
with open('frontend/vercel.json', 'w') as f: json.dump(cfg, f, indent=2); f.write('\n')
with open('frontend/public/config.json', 'w') as f: json.dump({"hubOrigin": api}, f); f.write('\n')
print(f"  vercel.json + config.json → {api}")
PY

(cd frontend && vercel --prod --yes)
echo "✓ Done — $VERCEL_URL now talks to $API_URL"
