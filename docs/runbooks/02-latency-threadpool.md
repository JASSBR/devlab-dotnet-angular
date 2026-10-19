# Runbook 02 — Pic de latence / famine du thread pool

> Périmètre : `devlab-api` (`RG=rg-devlab APP=devlab-api`), 0,5 vCPU / 1 Gi, `min-replicas 0`, `max-replicas 2`.

## Symptômes

- Les requêtes passent de quelques ms à plusieurs secondes, **toutes en même temps**, même les plus simples (`/health`).
- Le header `X-Elapsed-Ms` (posé par `RequestTimingMiddleware`) explose, ou les appels finissent en timeout côté Vercel (504).
- Probes en échec → redémarrages en boucle (la liveness ne répond plus à temps).

## 1. Écarter le faux positif : le cold start

`min-replicas 0` : après une période sans trafic, la première requête démarre un conteneur (≈ 5-15 s). Une seule requête lente après un silence = cold start, pas un incident.

```bash
az containerapp replica list -n $APP -g $RG -o table     # 0 réplique juste avant ? → cold start
az containerapp logs show -n $APP -g $RG --type system --tail 30   # "Scaling", "Pulling image"
```

## 2. Où regarder

- **Dashboard Aspire** (local, `./aspire.sh`) → *Metrics* → ressource `api` :
  - `http.server.request.duration` (p50/p95/p99 par route) — la route lente est-elle unique ou est-ce tout le monde ?
  - `dotnet.thread_pool.queue.length` qui monte + `dotnet.thread_pool.thread.count` qui grimpe lentement (≈ 1 à 2 threads/s) = **famine**.
  - `devlab.checkout.duration` (métrique custom de la leçon Observabilité).
- *Traces* → trier par durée : un span long et « vide » (aucun enfant) = attente bloquante ; un span DB/HTTP long = dépendance lente.
- En prod, à chaud, avec les outils .NET (dans le conteneur ou en local) :

```bash
dotnet-counters monitor -n DevLab.Api --counters System.Runtime,Microsoft.AspNetCore.Hosting
dotnet-stack report -n DevLab.Api        # des dizaines de threads bloqués sur le même .Result/.Wait() ?
```

## 3. Diagnostic

| Observation | Cause probable |
|---|---|
| Queue du thread pool qui monte, CPU bas, tout est lent | **Sync-over-async** : `.Result`, `.Wait()`, `Thread.Sleep` dans un handler. Chaque requête bloque un thread ; le pool en ajoute lentement. |
| CPU à 100 % sur 0,5 vCPU | Calcul lourd dans la requête, boucle, sérialisation énorme, regex catastrophique. |
| Une seule route lente, span DB long | Requête N+1, index manquant, `ToList()` avant le `Where` (cf. leçon EF Core). |
| Span HTTP sortant long | Dépendance lente sans timeout → les requêtes s'empilent derrière elle. |
| Mémoire qui monte, GC gen2 fréquents (check `memory` *Degraded*) | Fuite (cache sans limite, events non désabonnés), pauses GC. |

## 4. Atténuation

- Gagner du temps : `az containerapp update -n $APP -g $RG --min-replicas 1 --max-replicas 4` (plus de cold start, plus de répliques).
- Dépendance lente : la couper (feature flag) ou réduire son timeout ; ne jamais laisser une dépendance sans timeout.
- Famine avérée, en dernier recours et temporairement : `DOTNET_ThreadPool_MinThreads` / `ThreadPool.SetMinThreads` — un pansement qui masque le vrai bug.

## 5. Correctif et rollback

- Correctif = supprimer l'appel bloquant (`await` de bout en bout) et ajouter le test de charge qui l'aurait vu.
- Si la régression suit un déploiement : rollback de l'image (voir runbook 01, §5) :
  `az containerapp update -n $APP -g $RG --image ghcr.io/jassbr/devlab-api:sha-<commit-sain>`

## 6. Post-mortem

Reprendre le modèle du runbook 01. Questions spécifiques : quelle métrique aurait alerté **avant** les utilisateurs (p95 de `http.server.request.duration`, longueur de queue du thread pool) ? Le seuil d'alerte existe-t-il ?
