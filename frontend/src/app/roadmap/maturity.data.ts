/**
 * The ".NET Maturity Stack" (7 concentric levels, after dipjyotisikder.com), mapped
 * topic by topic onto the lessons that teach it. Unlike the career roadmap, every
 * topic here has a lesson: this page is the learning path, not a gap analysis.
 */
export interface MaturityTopic {
  label: string;
  /** Lessons that teach it (ids from lessons/catalog.ts), the most specific first. */
  lessons: string[];
}

export interface MaturityLevel {
  index: number;
  title: string;
  color: string;
  outcome: string;
  topics: MaturityTopic[];
  /** Lessons that go beyond the infographic's topics but belong at this level. */
  extras?: string[];
}

export const MATURITY: MaturityLevel[] = [
  {
    index: 1, title: 'Fondamentaux C#', color: '#4ade80',
    outcome: 'Écrire, lire et déboguer du C# qui marche, sans hésiter.',
    topics: [
      { label: 'Variables', lessons: ['csharp-fundamentals'] },
      { label: 'Loops', lessons: ['csharp-fundamentals'] },
      { label: 'Methods', lessons: ['csharp-fundamentals'] },
      { label: 'if / switch', lessons: ['csharp-fundamentals'] },
      { label: 'Classes', lessons: ['csharp-fundamentals'] },
      { label: 'Strings', lessons: ['csharp-fundamentals'] },
      { label: 'Enums', lessons: ['csharp-fundamentals'] },
      { label: 'try / catch', lessons: ['csharp-fundamentals', 'middleware'] },
    ],
  },
  {
    index: 2, title: 'Types & conception objet', color: '#a78bfa',
    outcome: 'Modéliser un domaine avec des types qui disent ce qu’ils veulent dire.',
    topics: [
      { label: 'Generics', lessons: ['csharp-fundamentals'] },
      { label: 'Records', lessons: ['csharp-fundamentals', 'vertical-slice'] },
      { label: 'Composition', lessons: ['csharp-fundamentals'] },
      { label: 'Interfaces', lessons: ['csharp-fundamentals', 'modular-monolith'] },
      { label: 'Inheritance', lessons: ['csharp-fundamentals'] },
      { label: 'struct vs class', lessons: ['csharp-fundamentals'] },
    ],
  },
  {
    index: 3, title: 'Collections & LINQ', color: '#60a5fa',
    outcome: 'Transformer des données brutes en requêtes claires et composables.',
    topics: [
      { label: 'Where / Select / GroupBy', lessons: ['collections-linq'] },
      { label: 'Any()', lessons: ['collections-linq'] },
      { label: 'IReadOnlyList', lessons: ['collections-linq'] },
      { label: 'HashSet', lessons: ['collections-linq'] },
      { label: 'Dictionary', lessons: ['collections-linq'] },
      { label: 'Deferred execution', lessons: ['collections-linq'] },
      { label: 'IEnumerable', lessons: ['collections-linq'] },
      { label: 'IQueryable', lessons: ['ef-core', 'collections-linq'] },
    ],
  },
  {
    index: 4, title: 'Async & concurrence', color: '#fb7185',
    outcome: 'Tenir la charge sur de l’I/O sans bloquer de threads.',
    topics: [
      { label: 'async / await', lessons: ['async-concurrency'] },
      { label: 'Task.WhenAll', lessons: ['async-concurrency'] },
      { label: 'ValueTask', lessons: ['async-concurrency'] },
      { label: 'Channels', lessons: ['async-concurrency'] },
      { label: 'SemaphoreSlim', lessons: ['async-concurrency'] },
      { label: 'Lock', lessons: ['async-concurrency'] },
      { label: 'CancellationToken', lessons: ['async-concurrency'] },
      { label: 'IAsyncEnumerable', lessons: ['async-concurrency'] },
      { label: 'Interlocked', lessons: ['async-concurrency', 'realtime'] },
      { label: 'Thread Pool', lessons: ['async-concurrency'] },
    ],
  },
  {
    index: 5, title: 'ASP.NET Core & données', color: '#fbbf24',
    outcome: 'Livrer des API sécurisées et testables, branchées sur de vraies données.',
    topics: [
      { label: 'Middleware', lessons: ['middleware'] },
      { label: 'DI Lifetimes', lessons: ['di-lifetimes'] },
      { label: 'Minimal APIs', lessons: ['minimal-vs-controllers'] },
      { label: 'Options', lessons: ['options'] },
      { label: 'AuthN / AuthZ', lessons: ['auth-jwt', 'authorization'] },
      { label: 'Problem Details', lessons: ['validation', 'middleware'] },
      { label: 'EF Core', lessons: ['ef-core'] },
      { label: 'Migrations', lessons: ['ef-migrations'] },
      { label: 'Integration Tests', lessons: ['testing'] },
      { label: 'Health Checks', lessons: ['health-checks'] },
    ],
    extras: ['realtime', 'project-setup'],
  },
  {
    index: 6, title: 'Performance & runtime', color: '#2dd4bf',
    outcome: 'Des services plus rapides, moins chers et prévisibles quand la charge monte.',
    topics: [
      { label: 'GC & Allocations', lessons: ['performance-runtime'] },
      { label: 'Span<T>', lessons: ['performance-runtime'] },
      { label: 'ArrayPool', lessons: ['performance-runtime'] },
      { label: 'BenchmarkDotNet', lessons: ['performance-runtime'] },
      { label: 'dotnet-counters', lessons: ['performance-runtime'] },
      { label: 'dotnet-trace', lessons: ['performance-runtime'] },
      { label: 'Tiered JIT', lessons: ['performance-runtime'] },
      { label: 'Native AOT', lessons: ['performance-runtime'] },
    ],
  },
  {
    index: 7, title: 'Systèmes en production', color: '#c084fc',
    outcome: '.NET devient l’outil de systèmes qui survivent à la production.',
    topics: [
      { label: 'Modular Monolith', lessons: ['modular-monolith'] },
      { label: 'Messaging', lessons: ['idempotency-outbox', 'modular-monolith'] },
      { label: 'HybridCache', lessons: ['caching'] },
      { label: 'Idempotency', lessons: ['idempotency-outbox'] },
      { label: 'Outbox', lessons: ['idempotency-outbox'] },
      { label: 'Resilience', lessons: ['resilience'] },
      { label: 'OpenTelemetry', lessons: ['observability'] },
      { label: 'API Versioning', lessons: ['api-versioning'] },
      { label: 'Rate Limiting', lessons: ['caching'] },
      { label: 'Aspire', lessons: ['observability'] },
      { label: 'Incident Runbooks', lessons: ['observability'] },
    ],
    extras: ['vertical-slice'],
  },
];

/** Distinct lessons of a level, in topic order then extras: the reading order the page suggests. */
export const lessonsOfLevel = (level: MaturityLevel): string[] =>
  [...new Set([...level.topics.flatMap(t => t.lessons), ...(level.extras ?? [])])];
