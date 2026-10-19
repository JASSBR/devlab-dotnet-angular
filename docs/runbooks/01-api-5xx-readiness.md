# Runbook 01 — L'API répond 5xx / la readiness échoue

> Périmètre : `devlab-api` (Azure Container Apps, groupe `rg-devlab`, environnement `devlab-env`, région `italynorth`).
> Variables utilisées ci-dessous : `RG=rg-devlab APP=devlab-api API=https://<fqdn>` (FQDN : `az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv`).

## Symptômes

- Les démos du front (Vercel) affichent « L'API .NET n'est pas joignable » ou des erreurs 500/502/503.
- `GET $API/health/ready` → **503**, ou `GET $API/health` ne répond plus.
- Dans le dashboard Aspire (local) : la ressource `api` passe en *Unhealthy*.

## 1. Qualifier en 2 minutes

```bash
curl -s -o /dev/null -w "%{http_code}\n" $API/health          # liveness : le process répond-il ?
curl -s $API/health/ready | jq '.status, (.checks[] | {name, status, description, error})'
curl -s $API/health/startup | jq .status                         # démarrage terminé ?
```

| `/health` | `/health/ready` | Lecture |
|---|---|---|
| 200 | 200 *Healthy* | Pas un problème de santé : regarder les 5xx d'un endpoint précis (étape 2). |
| 200 | 200 *Degraded* | Dégradé (mémoire, dépendance lente) : service rendu, surveiller. |
| 200 | 503 | Une dépendance est KO → le check `Unhealthy` est nommé dans le JSON. |
| timeout / 5xx | — | Process planté, en boucle de redémarrage, ou à zéro réplique (cold start). |

## 2. Où regarder

```bash
# Logs applicatifs (stdout du conteneur), en direct
az containerapp logs show -n $APP -g $RG --follow --tail 100
# Logs système : pull d'image, probes, redémarrages, OOMKilled
az containerapp logs show -n $APP -g $RG --type system --tail 50
# Révisions : laquelle reçoit le trafic, est-elle Healthy/Running ?
az containerapp revision list -n $APP -g $RG -o table \
  --query "[].{name:name, active:properties.active, traffic:properties.trafficWeight, health:properties.healthState, state:properties.runningState, created:properties.createdTime}"
# Répliques en cours
az containerapp replica list -n $APP -g $RG -o table
```

- **Corrélation** : chaque réponse porte `traceparent: 00-<traceId>-<spanId>-01`, et les ProblemDetails un `traceId`. Chercher ce traceId dans les logs (`az containerapp logs show ... | grep <traceId>`) ou, en local, dans le dashboard Aspire (onglet *Traces*).
- En local : `./aspire.sh` → dashboard → ressource `api` → *Structured logs* filtrés par niveau `Error`.

## 3. Diagnostic

1. **Le check `database` est Unhealthy** → fichier SQLite inaccessible (`/data` non inscriptible, disque plein). Les logs EF Core indiquent l'exception exacte.
2. **Le check `payment-gateway` est Unhealthy** → dépendance externe (ici simulée, auto-réparée en 60 s). En réel : vérifier la page de statut du fournisseur, les timeouts.
3. **`/health` ne répond pas** → regarder les logs *system* : `OOMKilled` (mémoire 1 Gi), échec de pull de l'image `ghcr.io/jassbr/devlab-api:sha-…`, crash au démarrage (`OptionsValidationException: Jwt:SigningKey…` = secret `jwt-key` manquant).
4. **5xx sur un seul endpoint, santé verte** → bug applicatif : le `traceId` du ProblemDetails mène au log `Unhandled exception on {Path}`.
5. **Juste après un déploiement ?** → comparer la révision active et la précédente (`revision list`) : c'est presque toujours la cause.

## 4. Atténuation

- Dépendance KO : la readiness sort la réplique du load balancer ; si toutes les répliques sont KO, communiquer, et désactiver la fonctionnalité dépendante si possible.
- Process instable : `az containerapp revision restart -n $APP -g $RG --revision <revision>`.
- Capacité : `az containerapp update -n $APP -g $RG --min-replicas 1` (supprime le cold start pendant l'incident ; à remettre à 0 ensuite — coût).

## 5. Rollback

```bash
# Mode révision unique (défaut de deploy-azure.sh) : redéployer l'image du dernier commit sain.
# Les images sont taguées par commit par le workflow GitHub « Images ».
git log --oneline -5
az containerapp update -n $APP -g $RG --image ghcr.io/jassbr/devlab-api:sha-<commit-sain>

# Mode multiple (si activé : az containerapp revision set-mode -n $APP -g $RG --mode multiple) :
# l'ancienne révision existe encore, on lui rend le trafic sans rien reconstruire.
az containerapp revision list -n $APP -g $RG -o table
az containerapp revision activate -n $APP -g $RG --revision <revision-precedente>
az containerapp ingress traffic set -n $APP -g $RG --revision-weight <revision-precedente>=100
```

Vérifier ensuite : `curl $API/health/ready` → 200, puis une démo du front.

## 6. Post-mortem (sans blâme, sous 48 h)

```markdown
### Incident AAAA-MM-JJ — <titre>
- Impact : qui, quoi, combien de temps (début → détection → résolution)
- Détection : comment l'a-t-on su ? (alerte, utilisateur, hasard) — combien de temps après le début ?
- Chronologie : horodatages UTC, actions, résultats
- Cause racine : les 5 pourquoi, jusqu'au processus (pas jusqu'à une personne)
- Ce qui a bien marché / mal marché
- Actions : [ ] correctif  [ ] test qui l'aurait attrapé  [ ] alerte/probe manquante — propriétaire + échéance
```
