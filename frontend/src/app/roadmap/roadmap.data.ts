/**
 * The .NET career reference (Junior → Middle → Senior → Architect), mapped onto
 * what this lab actually teaches. The mapping is deliberately honest: a skill is
 * "covered" only when a lesson *teaches* it, not when the code merely uses it.
 */
export type SkillStatus = 'covered' | 'partial' | 'todo';
export type LevelId = 'junior' | 'middle' | 'senior' | 'architect';

export interface Skill {
  label: string;
  status: SkillStatus;
  /** Lessons that teach it (ids from lessons/catalog.ts). */
  lessons?: string[];
  /** Honest note: what is covered, or what the missing lesson would contain. */
  note: string;
  /** Set when the user's Azure Student subscription would make the demo real. */
  azure?: string;
}

export interface Level {
  id: LevelId;
  index: number;
  label: string;
  color: string;
  blurb: string;
  skills: Skill[];
}

export const LEVELS: Level[] = [
  {
    id: 'junior', index: 1, label: 'Junior', color: '#a78bfa',
    blurb: 'Écrire du C# correct et une API qui marche.',
    skills: [
      { label: 'Syntaxe C#, types et POO', status: 'covered', lessons: ['csharp-fundamentals'],
        note: 'C# comparé à TypeScript, exécuté en live : switch expressions et patterns, struct vs class (copie prouvée), records et with, génériques contraints, default interface members, composition vs héritage, NRT.' },
      { label: 'Collections et LINQ de base', status: 'covered', lessons: ['collections-linq', 'ef-core'],
        note: 'List / Dictionary / HashSet (benchmark Contains en direct), exposition en lecture seule, opérateurs LINQ exécutés, deferred execution tracée élément par élément.' },
      { label: 'async/await — bases', status: 'covered', lessons: ['async-concurrency', 'ef-core', 'realtime'],
        note: 'Machine à états, thread rendu au pool pendant l’I/O, séquentiel vs Task.WhenAll mesuré en direct (≈ somme vs ≈ max).' },
      { label: 'Gestion des exceptions', status: 'covered', lessons: ['middleware', 'csharp-fundamentals'],
        note: 'IExceptionHandler global → ProblemDetails RFC 9457, avec démo /boom en 3 variantes ; côté langage, exception métier, filtres when et finally tracés.' },
      { label: 'API de base : Controllers et EF Core', status: 'covered', lessons: ['minimal-vs-controllers', 'ef-core'],
        note: 'Le même endpoint écrit en Minimal API et en Controller, + CRUD EF Core complet paginé.' },
      { label: 'Configuration depuis appsettings.json', status: 'covered', lessons: ['options'],
        note: 'Sources en couches, IOptions vs Snapshot vs Monitor, ValidateOnStart, user-secrets.' },
      { label: 'Git et débogage dans l’IDE', status: 'todo',
        note: 'Hors périmètre d’un lab web : rien à exécuter dans le navigateur.' },
    ],
  },
  {
    id: 'middle', index: 2, label: 'Middle', color: '#fb7185',
    blurb: 'Structurer, sécuriser et tester une vraie application.',
    skills: [
      { label: 'LINQ avancé, IQueryable vs IEnumerable', status: 'covered', lessons: ['ef-core', 'collections-linq'],
        note: 'Composition paresseuse → une seule requête SQL, AsNoTracking, projection ; côté mémoire, yield return et l’énumération multiple démontrés. Le piège du ToList() trop tôt est dans l’entretien.' },
      { label: 'async/await avancé, cancellation, deadlocks', status: 'covered', lessons: ['async-concurrency', 'ef-core'],
        note: 'Annulation réelle via RequestAborted, WhenAny/timeout, IAsyncEnumerable en streaming, ValueTask, sync-over-async et starvation mesurés. Le deadlock .Result (contexte UI / ASP.NET classique) est expliqué, pas reproduit : ASP.NET Core n’a pas de SynchronizationContext.' },
      { label: 'EF Core : migrations, relations, perf', status: 'partial', lessons: ['ef-core', 'ef-migrations'],
        note: 'Requêtes, perf et migrations réelles (deux par module, snapshot, historique, bundle vs script, expand/contract). Les relations (navigations, Include, owned types) restent sans leçon.' },
      { label: 'SOLID et design patterns', status: 'todo',
        note: 'Les patterns sont appliqués (Strategy dans les policies, Decorator dans les middlewares) mais jamais nommés ni expliqués.' },
      { label: 'Architecture propre en couches', status: 'covered', lessons: ['vertical-slice', 'modular-monolith'],
        note: 'Comparaison N-Layered / Clean / Vertical Slice avec schéma, puis le module Orders en slices.' },
      { label: 'Authentification et autorisation', status: 'covered', lessons: ['auth-jwt', 'auth-cookie', 'auth-apikey', 'auth-oidc', 'authorization'],
        note: 'Le point fort du lab : 5 schemes réels (JWT+refresh, cookie+CSRF, API key, OIDC/PKCE avec IdP embarqué) et les policies.' },
      { label: 'Middleware, filtres et model binding', status: 'covered', lessons: ['middleware', 'minimal-vs-controllers'],
        note: 'Pipeline en oignon tracé en direct, endpoint filters, binding par convention.' },
      { label: 'Validation, mapping et DI', status: 'covered', lessons: ['validation', 'di-lifetimes'],
        note: 'FluentValidation via filter générique, DTO ↔ entité, et les 3 durées de vie visualisées par GUID.' },
      { label: 'Scheduling et caching', status: 'covered', lessons: ['caching', 'realtime'],
        note: 'IMemoryCache vs OutputCache vs HybridCache chronométrés (stampede : factory exécutée 1× contre 10×, invalidation par tag), rate limiter 429, BackgroundService avec PeriodicTimer. Le L2 Redis est expliqué, pas branché.' },
      { label: 'Logging structuré', status: 'covered', lessons: ['observability', 'middleware'],
        note: 'Message templates, scopes (BeginScope), corrélation log ↔ trace par TraceId visible en direct, export OTLP. Serilog et ses enrichers restent hors leçon.' },
      { label: 'Tests d’intégration', status: 'covered', lessons: ['testing'],
        note: 'WebApplicationFactory, base isolée, 112 tests réels — dont les 2 bugs qu’ils ont attrapés pendant la construction.' },
      { label: 'Conteneurisation Docker', status: 'partial',
        note: 'Le Dockerfile multi-stage du backend existe et est testé, mais aucune leçon ne l’explique. Facile à ajouter : le code est déjà là.' },
    ],
  },
  {
    id: 'senior', index: 3, label: 'Senior', color: '#86efac',
    blurb: 'Tenir la charge, la panne et la complexité.',
    skills: [
      { label: 'Profilage performance, mémoire, allocations', status: 'covered', lessons: ['performance-runtime'],
        note: 'BenchmarkDotNet avec [MemoryDiagnoser] (Span, ArrayPool, StringBuilder, LINQ — résultats réels commités), allocations mesurées en direct par GC.GetAllocatedBytesForCurrentThread, GC/LOH/DATAS, tiered JIT + OSR observés, dotnet-counters et dotnet-trace exécutés pour de vrai.' },
      { label: 'Concurrence, threading, thread safety', status: 'covered', lessons: ['async-concurrency', 'realtime', 'di-lifetimes'],
        note: 'Race condition counter++ vs Interlocked vs Lock (C# 13), SemaphoreSlim, Channels bornés, compteurs du ThreadPool. Hors périmètre : primitives bas niveau (Monitor.Wait, volatile, memory model) et collections concurrentes en profondeur.' },
      { label: 'Fondamentaux des systèmes distribués', status: 'partial', lessons: ['idempotency-outbox'],
        note: 'Idempotence, at-least-once vs exactly-once et dual write sont démontrés. Latence, partitions réseau et horloges restent à écrire.' },
      { label: 'Messaging : RabbitMQ, Kafka, Azure Service Bus', status: 'partial', lessons: ['idempotency-outbox'],
        note: 'Les garanties d’un broker sont jouées en vrai (outbox, retries, poison message, consommateur idempotent) mais sur un bus in-process. Il manque un vrai broker et Wolverine/MassTransit.',
        azure: 'Azure Service Bus — inclus dans l’abonnement Student : file + topic/subscription réels, avec dead-letter queue visible.' },
      { label: 'Résilience : retries, circuit breakers (Polly)', status: 'covered', lessons: ['resilience'],
        note: 'Endpoint instable réglable, standard handler vs pipeline Polly v8 sur mesure : tentatives, backoff + jitter, timeouts, circuit qui s’ouvre, p50/p95. Fallback et hedging sont expliqués, pas démontrés.' },
      { label: 'Observabilité : métriques, traces, OpenTelemetry', status: 'covered', lessons: ['observability', 'health-checks', 'performance-runtime', 'middleware'],
        note: 'OpenTelemetry via les ServiceDefaults Aspire : spans custom imbriqués, propagation W3C, Meter (counter + histogram), viewer de traces in-app, dashboard Aspire en OTLP, runbooks d’incident.',
        azure: 'Application Insights — traces distribuées et métriques, gratuit jusqu’à 5 Go/mois.' },
      { label: 'CQRS et patterns événementiels', status: 'partial', lessons: ['modular-monolith', 'idempotency-outbox'],
        note: 'Les événements de domaine et le découplage inter-modules sont traités ; la séparation lecture/écriture (CQRS) non.' },
      { label: 'Transactions et conflits de concurrence', status: 'partial', lessons: ['modular-monolith', 'idempotency-outbox'],
        note: 'Stock décrémenté par ExecuteUpdate conditionnel ; commande + outbox + clé d’idempotence dans une transaction ; doublons concurrents tranchés par un index unique. La concurrence optimiste (rowversion) reste à traiter.' },
      { label: 'Sécurité OWASP et gestion des secrets', status: 'partial', lessons: ['auth-cookie', 'options', 'auth-jwt'],
        note: 'XSS/CSRF démontrés pour de vrai, secrets hors du code expliqués. Il manque une leçon OWASP structurée (injection, IDOR, SSRF).',
        azure: 'Azure Key Vault — rotation et accès managé, branchable sur la leçon Options.' },
      { label: 'CI/CD et déploiement cloud', status: 'partial', lessons: ['health-checks'],
        note: 'Le lab EST déployé (Vercel + Azure Container Apps, image construite par GitHub Actions). Les probes startup/liveness/readiness ont leur leçon ; le pipeline lui-même reste à raconter.',
        azure: 'Azure Container Apps — héberger l’API .NET avec scale-to-zero ; plus proche du réel que Railway.' },
      { label: 'Domain modeling — DDD tactique', status: 'todo',
        note: 'Leçon à écrire : entités vs value objects, agrégats et invariants, racine d’agrégat. Le module Orders est le terrain idéal.' },
      { label: 'Revue de code et mentorat', status: 'todo',
        note: 'Non transposable en démo cliquable — mais le mode entretien en est la version « je t’interroge ».' },
      { label: 'Analyse de compromis et choix d’outils', status: 'partial',
        note: 'Chaque leçon argumente ses choix (Minimal vs Controller, cookie vs JWT, slice vs clean), sans page de synthèse.' },
      { label: 'Monolithe modulaire et frontières de service', status: 'covered', lessons: ['modular-monolith'],
        note: 'PublicApi, événements, et un test NetArchTest qui échoue si une frontière est franchie.' },
    ],
  },
  {
    id: 'architect', index: 4, label: 'Architect', color: '#fcd34d',
    blurb: 'Décider, arbitrer, et assumer les conséquences.',
    skills: [
      { label: 'System design : scale, disponibilité, fiabilité', status: 'partial', lessons: ['health-checks'],
        note: 'La brique fiabilité est traitée (probes, éviction par readiness, Degraded vs Unhealthy). Reste un format à créer : des études de cas chiffrées (« 10 000 élèves, pic à la rentrée »), dimensionnées et défendues — plus proche du mode entretien que d’une démo cliquable.' },
      { label: 'Monolithe vs modulaire vs microservices vs serverless', status: 'partial', lessons: ['modular-monolith'],
        note: 'L’arbitrage est argumenté dans la leçon et dans 2 questions d’entretien ; il mérite sa propre page comparative.' },
      { label: 'DDD stratégique : bounded contexts, context mapping', status: 'todo',
        note: 'Les modules Orders/Products SONT deux bounded contexts — il ne manque que le vocabulaire et la carte.' },
      { label: 'Cohérence, idempotence et sagas', status: 'partial', lessons: ['idempotency-outbox'],
        note: 'Idempotency-Key, outbox transactionnelle et inbox sont réels et testés. La saga avec compensation (paiement refusé → annuler la commande) reste à écrire.' },
      { label: 'Architecture de données, event sourcing, polyglot', status: 'todo',
        note: 'Leçon à écrire : quand le journal d’événements devient la source de vérité (et le prix à payer : projections, rejeu, versionnement), et quand mélanger relationnel + document + cache est justifié plutôt que subi.' },
      { label: 'Compromis CAP et PACELC', status: 'todo', note: 'À écrire — théorie, mais indispensable en entretien architecte.' },
      { label: 'Sécurité et identité, zero-trust', status: 'partial', lessons: ['auth-oidc', 'authorization'],
        note: 'OIDC et les frontières d’autorisation sont solides ; le zero-trust (mTLS, identités de charge) manque.',
        azure: 'Microsoft Entra ID — remplacer l’IdP factice du lab par un vrai fournisseur.' },
      { label: 'Exigences non fonctionnelles et attributs qualité', status: 'todo',
        note: 'Leçon à écrire : transformer « ça doit être rapide » en objectif mesurable (p95 < 300 ms sur 1000 req/s), et montrer que performance, sécurité et coût se contredisent — il faut choisir.' },
      { label: 'ADR et diagrammes C4', status: 'todo',
        note: 'Très rentable : le lab a déjà 8 schémas SVG maison, il ne manque que le formalisme C4 et un exemple d’ADR.' },
      { label: 'Stratégies de migration et modernisation', status: 'partial', lessons: ['ef-migrations', 'api-versioning'],
        note: 'Expand/contract et migrations de schéma sans downtime, puis migration des clients d’un contrat d’API (v1 dépréciée avec Deprecation + Sunset, servie à côté de v2). Le strangler fig (moderniser une application entière) reste à écrire.' },
      { label: 'Standards, garde-fous, gouvernance', status: 'partial', lessons: ['project-setup'],
        note: 'C’est exactement ce que fait la leçon Setup : warnings = erreurs, analyzers, triage justifié, versions centralisées.' },
      { label: 'Architecture alignée sur les objectifs métier et le coût', status: 'todo',
        note: 'Leçon à écrire : relier une décision technique à une conséquence financière ou commerciale — le seul langage qui porte devant un comité de direction.' },
      { label: 'Loi de Conway et team topologies', status: 'todo',
        note: 'Leçon à écrire : l’architecture d’un système finit par copier l’organisation qui le produit. Découper en modules sans découper les équipes ne tient pas.' },
      { label: 'Communiquer les compromis aux parties prenantes', status: 'todo',
        note: 'Leçon à écrire : présenter 2 ou 3 options avec leur coût, leur risque et ce qu’on abandonne — jamais une seule « bonne » solution. C’est la compétence qui sépare senior et architecte.' },
      { label: 'Optimisation des coûts et économie du cloud', status: 'partial', lessons: ['performance-runtime'],
        note: 'Côté runtime seulement : Native AOT mesuré (démarrage, mémoire, taille) — ce qui rend le scale-to-zero bon marché. Reste à écrire : ce qui coûte vraiment cher (egress, requêtes, instances qui ne dorment jamais) et le chiffrage avant de construire.',
        azure: 'Azure Pricing Calculator + Cost Management sur un abonnement réel : chiffrer avant de construire.' },
      { label: 'Stratégie plateforme et expérience développeur', status: 'partial', lessons: ['project-setup', 'observability'],
        note: 'Le setup outillé (props partagés, analyzers, lock centralisé) et Aspire (AppHost + ServiceDefaults : une commande, un dashboard, la même télémétrie partout) en sont les briques de base.' },
      { label: 'Reprise après sinistre et continuité', status: 'todo',
        note: 'Leçon à écrire : RTO et RPO d’abord, puis les conséquences (réplication, sauvegardes testées — une sauvegarde jamais restaurée n’est pas une sauvegarde).' },
      { label: 'Multi-tenancy et isolation des données', status: 'todo',
        note: 'Leçon à fort impact : Row-Level Security PostgreSQL, une ligne de policy qui isole les tenants — avec le test qui prouve qu’un tenant ne voit pas l’autre.',
        azure: 'Azure Database for PostgreSQL — RLS réel plutôt que SQLite.' },
    ],
  },
];

/** Angular is not part of this .NET reference, but the lab teaches it — surfaced separately. */
export const ANGULAR_BONUS = [
  'signals-state', 'rxjs-http', 'routing', 'forms', 'di', 'interceptors', 'control-flow', 'components', 'directives-pipes',
];

export const STATUS_LABEL: Record<SkillStatus, string> = {
  covered: 'Leçon dédiée',
  partial: 'Partiel',
  todo: 'À construire',
};
