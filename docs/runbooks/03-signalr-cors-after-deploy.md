# Runbook 03 — Déconnexions SignalR ou erreurs CORS après un déploiement

> Topologie : le front est sur Vercel (`https://devlab-dotnet-angular.vercel.app`). `/api` et `/idp` passent par des
> **rewrites Vercel** (same-origin) ; les **WebSockets ne se proxifient pas** : SignalR appelle l'API en direct
> (`hubOrigin` dans `frontend/public/config.json`), donc en **cross-origin**, autorisé par `Cors__Origins__0`.

## Symptômes

- Console navigateur : `Access to fetch at 'https://devlab-api…/hubs/live/negotiate' from origin 'https://…vercel.app' has been blocked by CORS policy`.
- La leçon Temps réel n'affiche plus de ticks ; reconnexions en boucle (`WebSocket closed with status code 1006`).
- Les autres leçons marchent (elles passent par le rewrite same-origin) — c'est la signature de ce runbook.

## 1. Qualifier

```bash
API=https://$(az containerapp show -n devlab-api -g rg-devlab --query properties.configuration.ingress.fqdn -o tsv)
FRONT=https://devlab-dotnet-angular.vercel.app

# Le preflight CORS renvoie-t-il l'origine du front ?
curl -si -X OPTIONS "$API/hubs/live/negotiate" -H "Origin: $FRONT" \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control"
# Le front pointe-t-il vers la bonne API ?
curl -s $FRONT/config.json
# Quelle origine l'API autorise-t-elle ?
az containerapp show -n devlab-api -g rg-devlab \
  --query "properties.template.containers[0].env[?name=='Cors__Origins__0']" -o table
```

## 2. Diagnostic

| Constat | Cause |
|---|---|
| Pas de `Access-Control-Allow-Origin` dans le preflight | `Cors__Origins__0` absent ou différent de l'URL du front (preview Vercel `…-git-xxx.vercel.app`, slash final, `http` vs `https`). |
| `config.json` pointe vers un ancien FQDN | Front redéployé sans `deploy-azure.sh` (qui réécrit `vercel.json` + `config.json`), ou nouvel environnement ACA → nouveau FQDN. |
| Negotiate 200, puis WebSocket 1006 en boucle | Révision en redémarrage (voir runbook 01), ou réplique supprimée (scale-to-zero / scale-in) : SignalR doit se reconnecter (`withAutomaticReconnect`). |
| Déconnexions avec plusieurs répliques | Sans backplane (Redis / Azure SignalR Service), une connexion est liée à UNE réplique : messages de groupe perdus entre répliques. `max-replicas 2` suffit à le déclencher. |
| `AllowCredentials` + `*` | Interdit par la spec CORS : l'origine doit être explicite (c'est le cas dans `Program.cs`). |

Logs utiles : `az containerapp logs show -n devlab-api -g rg-devlab --follow | grep -i -E "cors|signalr|websocket"`.

## 3. Atténuation

```bash
# Corriger l'origine autorisée (crée une nouvelle révision)
az containerapp update -n devlab-api -g rg-devlab --set-env-vars "Cors__Origins__0=https://devlab-dotnet-angular.vercel.app"
# Déconnexions multi-répliques : revenir à une seule réplique le temps d'ajouter un backplane
az containerapp update -n devlab-api -g rg-devlab --max-replicas 1
# Front pointant sur un mauvais FQDN : relancer le recâblage complet
./deploy-azure.sh
```

## 4. Rollback

- Régression applicative (hub, auth du hub) : rollback d'image, runbook 01 §5.
- Régression front : Vercel → *Deployments* → déploiement précédent → *Promote to Production* (ou `vercel rollback`).

## 5. Prévention

- Un test de fumée post-déploiement qui fait le preflight CORS ci-dessus et échoue si l'en-tête manque.
- Plusieurs origines ? `Cors__Origins__1=…` (tableau) plutôt qu'un joker.
- Post-mortem : modèle du runbook 01.
