# DevLab — .NET 10 × Angular 22, expliqué par le code qui tourne

Un lab interactif pour (re)apprendre ASP.NET Core et Angular. Chaque leçon est une page avec :

1. une **explication** courte (le modèle mental, les pièges) ;
2. une **démo live** branchée sur la vraie API ;
3. **les fichiers sources exacts** qui font tourner la démo, lus depuis le disque par `GET /api/source`.

Un **panneau Réseau** (en bas à droite) montre chaque requête HttpClient : méthode, URL, headers (dont `Authorization`), statut, durée.

## Interface

- **⌘K / Ctrl+K partout** — palette de commandes qui cherche dans les 26 leçons, les 53 questions d'entretien et
  les 51 compétences de la roadmap, avec navigation clavier. L'index des questions (85 kB) n'est chargé qu'à la
  première ouverture, pour ne pas alourdir le premier rendu.
- **Roadmap en timeline** — les 4 niveaux sur un fil conducteur, anneau de progression SVG par niveau.
- Thème sombre avec deux sources de lumière, typographie fluide (`clamp()`), révélations décalées qui se
  désactivent sous `prefers-reduced-motion` — et qui ne conditionnent jamais la visibilité du contenu.

## Mode carrière

`/roadmap` : le référentiel .NET Junior → Middle → Senior → Architect (51 compétences) confronté à ce que le lab
enseigne réellement. Trois états honnêtes — **leçon dédiée** (11), **partiel** (17), **à construire** (23) — chaque trou
décrivant la leçon manquante. Couverture actuelle : **38 %**, forte sur Junior/Middle, mince sur Senior, quasi nulle sur Architect.
Les items marqués ☁️ deviennent des démos réelles avec un abonnement Azure.

## Mode entretien

`/interview` : 53 questions (Angular, .NET, Auth & sécurité, Architecture · Junior → Senior), QCM auto-corrigés et questions ouvertes
avec détection des points-clés dans ta réponse + auto-évaluation, explication, schéma SVG et lien vers la leçon. Score et « à revoir » persistés en localStorage.

## Les 26 leçons

| Angular | .NET | Auth full-stack |
|---|---|---|
| Signals & state (+ NgRx SignalStore) | Minimal API vs Controllers | JWT + refresh token (rotation, expiration 60 s) |
| RxJS, HttpClient, httpResource | DI : Transient / Scoped / Singleton | Cookie auth + CSRF (antiforgery) |
| Routing, guards, resolvers, lazy | Pipeline de middlewares + ProblemDetails | API key (AuthenticationHandler custom) |
| Reactive Forms typés (+ validateur async) | EF Core + SQLite (CRUD paginé) | OAuth2/OIDC Authorization Code + PKCE (IdP embarqué) |
| Injection de dépendances | Validation (FluentValidation + endpoint filter) | Authorization : rôles, claims, policies, resource-based |
| Interceptors HTTP (refresh auto sur 401) | SignalR + BackgroundService | |
| Control flow, @defer, zoneless | Cache (IMemoryCache, OutputCache) + rate limiting | |
| Composants (input/output/model, viewChild, hostDirectives) | Options pattern & configuration | |
| Directives & pipes custom | Tests d'intégration xUnit (+ tests d'architecture NetArchTest) | |
| | Setup pro : Directory.Build.props, CPM, analyzers, triage | |
| | Vertical Slice Architecture + Result<T> (module Orders) | |
| | Modular Monolith : PublicApi, événements, frontières testées | |

## Déploiement

| Partie | Où | Pourquoi |
|---|---|---|
| Frontend Angular | **Vercel** → https://devlab-dotnet-angular.vercel.app | statique, CDN, preview par déploiement |
| API .NET | **Railway** (Docker) | Vercel n'exécute pas ASP.NET Core : il faut un conteneur long-running (SignalR, EF, SQLite) |

```bash
# 1. front (déjà fait, à refaire après chaque modif)
cd frontend && vercel --prod

# 2. back : une seule étape interactive, puis tout est scripté
railway login
./deploy-backend.sh          # build Docker + variables + déploie + recâble le front
```

**Comment le front trouve le back** : `frontend/vercel.json` proxifie `/api/*` et `/idp/*` vers Railway
(le navigateur reste en *same-origin* → les leçons Cookie et CSRF fonctionnent réellement).
Les WebSockets ne peuvent pas être proxifiés par un edge CDN : SignalR appelle l'API en direct via
`frontend/public/config.json` (`hubOrigin`), autorisé par le CORS configuré côté API.

**Sans backend déployé, le site reste utile** : explications, schémas, *mode entretien* complet, et tout le
code source — un snapshot (`npm run snapshot`) est embarqué au build et sert de repli quand `/api/source`
ne répond pas (badge « snapshot » dans le lecteur de code). Une bannière l'annonce sur chaque démo.

**Secrets** : la clé JWT de dev est publique (le lab l'affiche lui-même). `deploy-backend.sh` génère une
**nouvelle clé aléatoire** par déploiement (`Jwt__SigningKey`) : jamais celle du repo.

## Prérequis

- .NET SDK 10 (installé dans `~/.dotnet` par `dotnet-install.sh`) → `export PATH="$HOME/.dotnet:$PATH"`
- Node 24 (`nvm use` lit le `.nvmrc`)

## Lancer

```bash
# Terminal 1 — API sur http://localhost:5080  (Scalar/OpenAPI : /scalar/v1)
cd backend/DevLab.Api && dotnet run

# Terminal 2 — Angular sur http://localhost:4200 (proxy /api, /hubs, /idp → :5080)
cd frontend && npm start
```

ou en une commande : `./dev.sh`.

## Tester

```bash
cd backend && dotnet test        # 17 tests : intégration (WebApplicationFactory) + architecture (NetArchTest)
cd frontend && npm test          # Vitest
```

## Comptes de test

| Utilisateur | Mot de passe | Rôles | Permissions | Âge |
|---|---|---|---|---|
| alice | alice123 | Admin, User | products:write, products:delete | 34 |
| bob | bob123 | User | products:write | 17 |
| carol | carol123 | User | — | 25 |

API keys (dev) : `lab-key-123` (Service), `lab-admin-key` (Service + Admin).

## Structure

```
backend/
  Directory.Build.props      règles communes : warnings = erreurs, analyzers Meziantou + Sonar
  Directory.Packages.props   versions de packages centralisées
  .editorconfig              style + triage des analyzers (chaque exception est justifiée)
backend/DevLab.Api/
  Program.cs                 composition root : chaque feature s'enregistre via une extension method
  Infrastructure/            Result<T>, IModule/IApiEndpoint (scan), InProcessEventBus
  Features/Orders/           module en vertical slices (PlaceOrder/, GetOrders/, CancelOrder/, PublicApi/, Shared/)
  Features/Products/PublicApi/  le seul contrat que les autres modules voient (IProductCatalog)
  Features/<Feature>/        un dossier = une leçon (endpoints + services + options)
  Features/Auth/             Jwt/ Cookie/ ApiKey/ Oidc/ Authorization/ + LabAuthentication.cs (5 schemes)
backend/DevLab.Api.Tests/    xUnit + WebApplicationFactory
frontend/src/app/
  lessons/catalog.ts         la liste des leçons et les fichiers qu'elles affichent
  lessons/{angular,dotnet,auth}/  un fichier = une leçon
  core/auth/                 AuthStore (signals), authInterceptor (refresh sur 401), guards
  core/http/                 requestLogInterceptor → panneau Réseau
  shared/                    lesson-shell, code-viewer (highlight.js), network-panel, progress, diagrams (SVG)
  interview/                 mode entretien : questions.ts (banque), interview.ts, interview.store.ts
```

## Secrets

La clé JWT de dev est dans `appsettings.Development.json` (préfixée `DEV-ONLY`) pour que le lab démarre sans config.
En vrai projet : `dotnet user-secrets set "Jwt:SigningKey" "…"` ou variable d'env `Jwt__SigningKey`.
