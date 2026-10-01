#!/usr/bin/env bash
# Déploie l'API .NET sur Azure Container Apps, puis recâble le front Vercel dessus.
# Prérequis (une seule étape interactive, ouvre un navigateur) :  az login
set -euo pipefail
cd "$(dirname "$0")"

RG="${RG:-rg-devlab}"
LOCATION="${LOCATION:-westeurope}"
APP="${APP:-devlab-api}"
ENVIRONMENT="${ENVIRONMENT:-devlab-env}"
VERCEL_URL="${VERCEL_URL:-https://devlab-dotnet-angular.vercel.app}"

az account show >/dev/null 2>&1 || { echo "✗ Pas connecté. Lance d'abord :  az login"; exit 1; }
echo "→ Abonnement : $(az account show --query name -o tsv)"

# L'extension et les fournisseurs ne sont provisionnés qu'une fois par abonnement.
az extension add --name containerapp --upgrade --only-show-errors >/dev/null
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry; do
  az provider register --namespace "$ns" --wait --only-show-errors >/dev/null &
done
wait

echo "→ Groupe de ressources $RG ($LOCATION)"
az group create --name "$RG" --location "$LOCATION" --only-show-errors >/dev/null

# Clé de signature neuve : celle du repo est publique (le lab l'affiche lui-même).
JWT_KEY="${JWT_KEY:-$(openssl rand -base64 48 | tr -d '\n')}"

echo "→ Build de l'image et déploiement (première fois : ~5 min, Azure construit le Dockerfile)"
az containerapp up \
  --name "$APP" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --environment "$ENVIRONMENT" \
  --source . \
  --ingress external \
  --target-port 8080 \
  --only-show-errors

echo "→ Secrets et configuration"
az containerapp secret set --name "$APP" --resource-group "$RG" \
  --secrets "jwt-key=$JWT_KEY" --only-show-errors >/dev/null

az containerapp update --name "$APP" --resource-group "$RG" \
  --min-replicas 0 --max-replicas 2 \
  --set-env-vars \
    "ASPNETCORE_ENVIRONMENT=Production" \
    "Jwt__SigningKey=secretref:jwt-key" \
    "Cors__Origins__0=$VERCEL_URL" \
    "Idp__RedirectUris__0=$VERCEL_URL/lessons/auth-oidc/callback" \
    "Idp__RedirectUris__1=http://localhost:4200/lessons/auth-oidc/callback" \
    "ApiKeys__Keys__0__Key=lab-key-123" \
    "ApiKeys__Keys__0__Owner=reporting-service" \
    "ApiKeys__Keys__0__Roles__0=Service" \
    "ApiKeys__Keys__1__Key=lab-admin-key" \
    "ApiKeys__Keys__1__Owner=ops-bot" \
    "ApiKeys__Keys__1__Roles__0=Service" \
    "ApiKeys__Keys__1__Roles__1=Admin" \
  --only-show-errors >/dev/null

API_URL="https://$(az containerapp show --name "$APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
echo "  API : $API_URL"

echo "→ Attente du health check"
for _ in $(seq 1 40); do
  curl -sf "$API_URL/health" >/dev/null && break || sleep 5
done
curl -sf "$API_URL/health" >/dev/null && echo "  ✓ /health répond" || { echo "  ✗ pas de réponse — voir : az containerapp logs show -n $APP -g $RG --follow"; exit 1; }

# /api et /idp passent par un rewrite Vercel → le navigateur reste en same-origin
# (les leçons Cookie et CSRF en dépendent). Les WebSockets ne se proxifient pas :
# SignalR appelle l'API en direct, autorisé par le CORS configuré plus haut.
echo "→ Recâblage du front"
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
echo
echo "✓ $VERCEL_URL parle maintenant à $API_URL"
echo "  Coût : scale-to-zero activé, l'app s'éteint sans trafic (grant gratuit Container Apps)."
echo "  Logs : az containerapp logs show -n $APP -g $RG --follow"
