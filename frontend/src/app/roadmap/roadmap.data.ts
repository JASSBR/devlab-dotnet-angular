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
      { label: 'Syntaxe C#, types et POO', status: 'todo',
        note: 'Le lab écrit du C# moderne (records, primary constructors, pattern matching) mais ne l’enseigne jamais. Une leçon « C# pour qui vient de TypeScript » manque.' },
      { label: 'Collections et LINQ de base', status: 'partial', lessons: ['ef-core'],
        note: 'LINQ est utilisé partout côté EF Core, mais les opérateurs eux-mêmes ne sont pas expliqués.' },
      { label: 'async/await — bases', status: 'partial', lessons: ['ef-core', 'realtime'],
        note: 'Tout le code est async ; le « pourquoi » (libérer le thread) n’est traité que dans une question d’entretien.' },
      { label: 'Gestion des exceptions', status: 'covered', lessons: ['middleware'],
        note: 'IExceptionHandler global → ProblemDetails RFC 9457, avec démo /boom en 3 variantes.' },
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
      { label: 'LINQ avancé, IQueryable vs IEnumerable', status: 'covered', lessons: ['ef-core'],
        note: 'Composition paresseuse → une seule requête SQL, AsNoTracking, projection. Le piège du ToList() trop tôt est dans l’entretien.' },
      { label: 'async/await avancé, cancellation, deadlocks', status: 'partial', lessons: ['ef-core'],
        note: 'Les CancellationToken sont propagés partout dans le code ; la leçon dédiée (sync-over-async, thread pool starvation) reste à écrire.' },
      { label: 'EF Core : migrations, relations, perf', status: 'partial', lessons: ['ef-core'],
        note: 'Requêtes et perf oui ; mais le lab utilise EnsureCreated, sans migrations ni relations. La leçon migrations manque — c’est le plus gros trou du niveau.' },
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
        note: 'IMemoryCache vs OutputCache chronométrés, rate limiter 429, BackgroundService avec PeriodicTimer.' },
      { label: 'Logging structuré', status: 'partial', lessons: ['middleware'],
        note: 'ILogger est utilisé avec des templates corrects, mais Serilog, enrichers et corrélation n’ont pas de leçon.' },
      { label: 'Tests d’intégration', status: 'covered', lessons: ['testing'],
        note: 'WebApplicationFactory, base isolée, 17 tests réels — dont les 2 bugs qu’ils ont attrapés pendant la construction.' },
      { label: 'Conteneurisation Docker', status: 'partial',
        note: 'Le Dockerfile multi-stage du backend existe et est testé, mais aucune leçon ne l’explique. Facile à ajouter : le code est déjà là.' },
    ],
  },
  {
    id: 'senior', index: 3, label: 'Senior', color: '#86efac',
    blurb: 'Tenir la charge, la panne et la complexité.',
    skills: [
      { label: 'Profilage performance, mémoire, allocations', status: 'todo',
        note: 'Leçon à écrire : BenchmarkDotNet, dotnet-counters, Span<T>, allocations cachées (closures, boxing, LINQ en boucle chaude).' },
      { label: 'Concurrence, threading, thread safety', status: 'partial', lessons: ['realtime', 'di-lifetimes'],
        note: 'Interlocked et Lock sont utilisés (compteur SignalR, store de refresh tokens) avec commentaires, mais sans leçon dédiée.' },
      { label: 'Fondamentaux des systèmes distribués', status: 'todo',
        note: 'Leçon à écrire : latence, partitions, horloges, idempotence, at-least-once vs exactly-once.' },
      { label: 'Messaging : RabbitMQ, Kafka, Azure Service Bus', status: 'todo',
        note: 'Le lab a un bus d’événements in-process qui dit lui-même sa limite. L’étape suivante est un vrai broker.',
        azure: 'Azure Service Bus — inclus dans l’abonnement Student : file + topic/subscription réels, avec dead-letter queue visible.' },
      { label: 'Résilience : retries, circuit breakers (Polly)', status: 'todo',
        note: 'Leçon à écrire : Polly v8 / Microsoft.Extensions.Resilience, avec un endpoint instable pour voir le circuit s’ouvrir.' },
      { label: 'Observabilité : métriques, traces, OpenTelemetry', status: 'partial', lessons: ['middleware'],
        note: 'Le traceId circule déjà dans les ProblemDetails, et un middleware mesure la durée. Il manque OpenTelemetry et un backend de traces.',
        azure: 'Application Insights — traces distribuées et métriques, gratuit jusqu’à 5 Go/mois.' },
      { label: 'CQRS et patterns événementiels', status: 'partial', lessons: ['modular-monolith'],
        note: 'Les événements de domaine et le découplage inter-modules sont traités ; la séparation lecture/écriture (CQRS) non.' },
      { label: 'Transactions et conflits de concurrence', status: 'partial', lessons: ['modular-monolith'],
        note: 'La décrémentation de stock est atomique via ExecuteUpdate conditionnel. La concurrence optimiste (rowversion) reste à traiter.' },
      { label: 'Sécurité OWASP et gestion des secrets', status: 'partial', lessons: ['auth-cookie', 'options', 'auth-jwt'],
        note: 'XSS/CSRF démontrés pour de vrai, secrets hors du code expliqués. Il manque une leçon OWASP structurée (injection, IDOR, SSRF).',
        azure: 'Azure Key Vault — rotation et accès managé, branchable sur la leçon Options.' },
      { label: 'CI/CD et déploiement cloud', status: 'partial',
        note: 'Le lab EST déployé (Vercel + Docker), mais sans leçon. Le pipeline GitHub Actions reste à écrire et à raconter.',
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
      { label: 'System design : scale, disponibilité, fiabilité', status: 'todo',
        note: 'Format à créer : des études de cas chiffrées (« 10 000 élèves, pic à la rentrée »), dimensionnées et défendues — plus proche du mode entretien que d’une démo cliquable.' },
      { label: 'Monolithe vs modulaire vs microservices vs serverless', status: 'partial', lessons: ['modular-monolith'],
        note: 'L’arbitrage est argumenté dans la leçon et dans 2 questions d’entretien ; il mérite sa propre page comparative.' },
      { label: 'DDD stratégique : bounded contexts, context mapping', status: 'todo',
        note: 'Les modules Orders/Products SONT deux bounded contexts — il ne manque que le vocabulaire et la carte.' },
      { label: 'Cohérence, idempotence et sagas', status: 'todo',
        note: 'Leçon à écrire : outbox (déjà cité comme limite dans le lab), puis saga avec compensation sur une commande.' },
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
      { label: 'Stratégies de migration et modernisation', status: 'todo', note: 'À écrire (strangler fig, expand/contract — ce dernier est déjà dans l’entretien).' },
      { label: 'Standards, garde-fous, gouvernance', status: 'partial', lessons: ['project-setup'],
        note: 'C’est exactement ce que fait la leçon Setup : warnings = erreurs, analyzers, triage justifié, versions centralisées.' },
      { label: 'Architecture alignée sur les objectifs métier et le coût', status: 'todo',
        note: 'Leçon à écrire : relier une décision technique à une conséquence financière ou commerciale — le seul langage qui porte devant un comité de direction.' },
      { label: 'Loi de Conway et team topologies', status: 'todo',
        note: 'Leçon à écrire : l’architecture d’un système finit par copier l’organisation qui le produit. Découper en modules sans découper les équipes ne tient pas.' },
      { label: 'Communiquer les compromis aux parties prenantes', status: 'todo',
        note: 'Leçon à écrire : présenter 2 ou 3 options avec leur coût, leur risque et ce qu’on abandonne — jamais une seule « bonne » solution. C’est la compétence qui sépare senior et architecte.' },
      { label: 'Optimisation des coûts et économie du cloud', status: 'todo',
        note: 'Leçon à écrire : ce qui coûte vraiment cher (egress, requêtes, instances qui ne dorment jamais), et pourquoi le scale-to-zero change l’équation d’un side project.',
        azure: 'Azure Pricing Calculator + Cost Management sur un abonnement réel : chiffrer avant de construire.' },
      { label: 'Stratégie plateforme et expérience développeur', status: 'partial', lessons: ['project-setup'],
        note: 'Le setup outillé (props partagés, analyzers, lock centralisé) en est la brique de base.' },
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
