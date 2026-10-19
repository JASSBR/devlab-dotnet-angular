# Native AOT vs JIT — mesures réelles

Le même projet (`DevLab.AotDemo` : minimal API `CreateSlimBuilder` + `JsonSerializerContext`), publié deux fois
le 2026-10-19 sur un Mac Apple M4 (macOS 26.5.1, .NET SDK 10.0.401, runtime 10.0.12, Xcode/clang 21 installés).

```bash
cd backend/DevLab.AotDemo

# Native AOT : un exécutable natif, sans runtime .NET à installer
dotnet publish -c Release -r osx-arm64 -o ../../publish/aot

# JIT, framework-dependent : DLL IL + runtime partagé installé sur la machine
dotnet publish -c Release -r osx-arm64 --self-contained false \
  -p:PublishAot=false -p:IsAotCompatible=false -o ../../publish/jit
```

Le publish AOT a réussi du premier coup : la toolchain native (clang + linker d'Xcode) était présente,
**0 warning de trimming/AOT** (les analyzers `IsAotCompatible` tournent déjà à chaque `dotnet build` de la solution).

## Résultats

| | Native AOT | JIT (framework-dependent) |
|---|---:|---:|
| Taille publiée | **8,07 Mo** — un seul binaire Mach-O arm64 (8 457 616 octets) | **151 Ko** d'app… + **≈ 111 Mo** de runtime partagé requis (`Microsoft.NETCore.App` 82,5 Mo + `Microsoft.AspNetCore.App` 28,9 Mo) |
| Symboles de debug | `DevLab.AotDemo.dSYM` 35 Mo (à côté, jamais déployé) | `.pdb` 36 Ko |
| Durée du `dotnet publish` (incrémental) | **9,0 s** (« Generating native code ») | **1,9 s** |
| Prêt à servir (log `Ready in`, médiane de 8) | **106 ms** | **173 ms** |
| 1ʳᵉ réponse HTTP 200 (mesurée de l'extérieur, médiane de 8) | **109 ms** (min 87) | **226 ms** (min 184) |
| Mémoire (RSS) après la 1ʳᵉ requête | **24,4 Mo** | **83,1 Mo** |
| Mémoire (RSS) après 500 requêtes | **30,8 Mo** | **89,6 Mo** |
| `RuntimeFeature.IsDynamicCodeSupported` | `false` | `true` |

Mesures : `startup` = lancement du process → premier `GET /todos` qui répond 200, en interrogeant toutes les ms depuis
un seul process Python (pas de `curl` relancé à chaque essai). Le tout premier lancement d'un binaire AOT fraîchement
publié a pris 517 ms : macOS vérifie la signature d'un exécutable inconnu une fois, c'est exclu de la médiane… mais à
garder en tête sur un poste de dev.

## Ce que ça montre

- **Démarrage ÷ 2, mémoire ÷ 3,4** sur cette mini-API. C'est exactement le profil qui compte en scale-to-zero
  (Azure Container Apps, Lambda, Cloud Run) : on paie le cold start à chaque réveil, et la mémoire à la minute.
- **Pas de runtime à installer** : l'image Docker peut partir de `runtime-deps` (ou `chiseled`) au lieu de `aspnet`.
- **Un binaire par plateforme** : ce fichier ne tourne que sur macOS arm64. Pour Linux x64, il faut publier sur
  Linux (ou dans un conteneur `sdk`) : la cross-compilation d'OS n'est pas supportée.
- **Build 4,7× plus long**, et 35 Mo de symboles natifs à archiver si on veut des stack traces lisibles.

## Ce qui ne marche pas (et pourquoi le projet compile quand même)

- Pas de génération de code à l'exécution : pas de `Reflection.Emit`, `Expression.Compile()` retombe sur un
  interpréteur (lent), et pas de sérialisation JSON par réflexion → `AotJsonContext : JsonSerializerContext`
  génère le code au build.
- Les minimal APIs passent par le **Request Delegate Generator**, activé automatiquement par `PublishAot=true` : il
  remplace la réflexion de `MapGet(..., Delegate)` par du code généré. Preuve trouvée en mesurant : publier la variante
  JIT avec `-p:PublishAot=false` **sans** `-p:IsAotCompatible=false` échoue avec `IL2026`/`IL3050` sur chaque
  `MapGet` — sans le générateur, ces appels redeviennent réflexifs et l'analyzer les signale.
- MVC/controllers, Razor, SignalR (partiellement), EF Core (partiellement, modèles compilés) : la grosse API du lab
  (`DevLab.Api`) ne peut pas passer en AOT telle quelle. C'est pour ça que la démo est un projet séparé.
- Pas de Dynamic PGO : le code AOT est optimisé une fois pour toutes, sans profil d'exécution. En régime établi,
  un JIT tier-1 avec PGO peut être plus rapide sur du code très chaud.
