/**
 * The single source of truth for the lab: every lesson, its track, and the
 * REAL files (paths relative to the repo root) that the page will display.
 * The backend serves those files from disk → what you read is what runs.
 */
export type Track = 'angular' | 'dotnet' | 'auth';

export interface Lesson {
  id: string;
  track: Track;
  icon: string;
  title: string;
  summary: string;
  concepts: string[];
  files: string[];
}

const FE = 'frontend/src/app';
const BE = 'backend/DevLab.Api';

export const LESSONS: Lesson[] = [
  // ─── Angular ────────────────────────────────────────────────────────────
  {
    id: 'signals-state', track: 'angular', icon: '⚡', title: 'Signals & gestion d’état',
    summary: 'signal / computed / effect, un store maison, puis NgRx SignalStore — le même panier codé trois fois.',
    concepts: ['signal()', 'computed()', 'effect()', 'linkedSignal()', 'store service', '@ngrx/signals', 'patchState'],
    files: [`${FE}/lessons/angular/signals-state.ts`, `${FE}/lessons/angular/cart.store.ts`],
  },
  {
    id: 'rxjs-http', track: 'angular', icon: '🌊', title: 'RxJS, HttpClient & httpResource',
    summary: 'Recherche typeahead avec debounce/switchMap, toSignal, puis la même chose en httpResource.',
    concepts: ['HttpClient', 'debounceTime', 'switchMap', 'toSignal', 'httpResource', 'annulation'],
    files: [`${FE}/lessons/angular/rxjs-http.ts`],
  },
  {
    id: 'routing', track: 'angular', icon: '🧭', title: 'Routing, guards, resolvers, lazy',
    summary: 'Routes lazy, paramètres bindés en inputs, guards fonctionnels, resolvers, routes enfants.',
    concepts: ['loadComponent', 'withComponentInputBinding', 'canActivate', 'canMatch', 'resolve', 'children'],
    files: [`${FE}/lessons/angular/routing.ts`, `${FE}/core/auth/auth.guard.ts`, `${FE}/app.routes.ts`],
  },
  {
    id: 'forms', track: 'angular', icon: '📝', title: 'Reactive Forms typés',
    summary: 'FormBuilder non-nullable, validateurs custom sync & async (appel API), FormArray, erreurs serveur mappées.',
    concepts: ['FormGroup typé', 'Validators', 'AsyncValidator', 'FormArray', 'statusChanges', 'setErrors'],
    files: [`${FE}/lessons/angular/forms.ts`, `${BE}/Features/Validation/ValidationLesson.cs`],
  },
  {
    id: 'di', track: 'angular', icon: '🧩', title: 'Injection de dépendances',
    summary: 'inject(), InjectionToken, providers au niveau composant, multi-providers, injecteurs hiérarchiques.',
    concepts: ['inject()', 'InjectionToken', 'providedIn', 'useFactory', 'multi: true', 'hiérarchie'],
    files: [`${FE}/lessons/angular/di.ts`],
  },
  {
    id: 'interceptors', track: 'angular', icon: '🛡️', title: 'Interceptors HTTP',
    summary: 'Le vrai interceptor du lab : Bearer, refresh sur 401 avec retry, journal réseau, gestion d’erreurs.',
    concepts: ['HttpInterceptorFn', 'withInterceptors', 'catchError', 'retry', 'HttpContextToken'],
    files: [`${FE}/core/auth/auth.interceptor.ts`, `${FE}/core/http/request-log.interceptor.ts`, `${FE}/app.config.ts`, `${FE}/lessons/angular/interceptors.ts`],
  },
  {
    id: 'control-flow', track: 'angular', icon: '🔀', title: 'Control flow, @defer, zoneless',
    summary: '@if/@for/@switch/@let, chargement différé avec @defer, et ce que « zoneless » change.',
    concepts: ['@if', '@for track', '@switch', '@let', '@defer', 'OnPush', 'zoneless'],
    files: [`${FE}/lessons/angular/control-flow.ts`, `${FE}/app.config.ts`],
  },
  {
    id: 'components', track: 'angular', icon: '🧱', title: 'Composants modernes',
    summary: 'input()/output()/model(), projection de contenu, viewChild(), host directives, two-way binding.',
    concepts: ['input.required', 'output()', 'model()', 'ng-content', 'viewChild()', 'hostDirectives'],
    files: [`${FE}/lessons/angular/components.ts`],
  },
  {
    id: 'directives-pipes', track: 'angular', icon: '🎛️', title: 'Directives & pipes custom',
    summary: 'Directive structurelle *hasRole, directive d’attribut avec host bindings, pipe pur vs impur.',
    concepts: ['Directive', 'TemplateRef', 'ViewContainerRef', 'host: {}', 'Pipe', 'pure'],
    files: [`${FE}/lessons/angular/directives-pipes.ts`],
  },

  // ─── .NET ───────────────────────────────────────────────────────────────
  {
    id: 'minimal-vs-controllers', track: 'dotnet', icon: '🚪', title: 'Minimal API vs Controllers',
    summary: 'Le même endpoint écrit deux fois. Binding, TypedResults, OpenAPI & Scalar.',
    concepts: ['MapGet', 'MapGroup', '[ApiController]', 'TypedResults', 'OpenAPI'],
    files: [`${BE}/Features/Greetings/GreetingsEndpoints.cs`, `${BE}/Controllers/GreetingsController.cs`, `${BE}/Program.cs`],
  },
  {
    id: 'di-lifetimes', track: 'dotnet', icon: '♻️', title: 'DI : Transient / Scoped / Singleton',
    summary: 'Trois services identiques, trois durées de vie. Compare les GUIDs dans une requête et entre deux requêtes.',
    concepts: ['AddTransient', 'AddScoped', 'AddSingleton', 'primary constructor', 'captive dependency'],
    files: [`${BE}/Features/Di/DiLesson.cs`],
  },
  {
    id: 'middleware', track: 'dotnet', icon: '🧅', title: 'Pipeline de middlewares',
    summary: 'Aller et retour dans l’oignon, header de timing, exception handler → ProblemDetails, endpoint filters.',
    concepts: ['RequestDelegate', 'app.Use', 'IExceptionHandler', 'ProblemDetails', 'IEndpointFilter', 'ordre'],
    files: [`${BE}/Features/Middleware/PipelineTraceMiddleware.cs`, `${BE}/Features/Middleware/RequestTimingMiddleware.cs`, `${BE}/Features/Middleware/MiddlewareLesson.cs`, `${BE}/Program.cs`],
  },
  {
    id: 'ef-core', track: 'dotnet', icon: '🗄️', title: 'EF Core + SQLite',
    summary: 'DbContext, Fluent API, IQueryable composable (filtre + tri + pagination en une requête SQL), CRUD complet.',
    concepts: ['DbContext', 'OnModelCreating', 'IQueryable', 'AsNoTracking', 'ExecuteDeleteAsync', 'DTO'],
    files: [`${BE}/Features/Products/ProductsEndpoints.cs`, `${BE}/Features/Products/AppDbContext.cs`, `${BE}/Features/Products/Product.cs`, `${FE}/lessons/dotnet/ef-core.ts`],
  },
  {
    id: 'validation', track: 'dotnet', icon: '✅', title: 'Validation & ProblemDetails',
    summary: 'FluentValidation branché par un endpoint filter générique, réponses 400 au format RFC 9457.',
    concepts: ['AbstractValidator', 'IEndpointFilter', 'ValidationProblem', 'RFC 9457'],
    files: [`${BE}/Features/Validation/ValidationLesson.cs`, `${BE}/Features/Validation/ValidationFilter.cs`],
  },
  {
    id: 'realtime', track: 'dotnet', icon: '📡', title: 'SignalR + BackgroundService',
    summary: 'Un hub typé, un service hébergé qui pousse des ticks toutes les 2 s, un chat, la présence.',
    concepts: ['Hub<T>', 'IHubContext', 'BackgroundService', 'PeriodicTimer', 'Groups', 'WebSockets'],
    files: [`${BE}/Features/Realtime/LiveHub.cs`, `${BE}/Features/Realtime/TickerBackgroundService.cs`, `${FE}/lessons/dotnet/realtime.ts`],
  },
  {
    id: 'caching', track: 'dotnet', icon: '🚀', title: 'Cache & rate limiting',
    summary: 'IMemoryCache vs OutputCache, mesurés en direct. Puis un rate limiter qui répond 429.',
    concepts: ['IMemoryCache', 'GetOrCreateAsync', 'CacheOutput', 'VaryByQuery', 'RateLimiter', '429'],
    files: [`${BE}/Features/Caching/CachingLesson.cs`, `${FE}/lessons/dotnet/caching.ts`],
  },
  {
    id: 'options', track: 'dotnet', icon: '⚙️', title: 'Configuration & Options pattern',
    summary: 'appsettings en couches, IOptions vs IOptionsSnapshot vs IOptionsMonitor, validation au démarrage.',
    concepts: ['IConfiguration', 'Bind', 'IOptionsSnapshot', 'IOptionsMonitor', 'ValidateOnStart', 'user-secrets'],
    files: [`${BE}/Features/Config/ConfigLesson.cs`, `${BE}/appsettings.json`, `${BE}/appsettings.Development.json`],
  },
  {
    id: 'testing', track: 'dotnet', icon: '🧪', title: 'Tests d’intégration xUnit',
    summary: 'WebApplicationFactory boot l’app réelle en mémoire, base SQLite isolée, tests sur auth + EF + validation.',
    concepts: ['WebApplicationFactory', 'IClassFixture', 'HttpClient', 'ConfigureAppConfiguration'],
    files: ['backend/DevLab.Api.Tests/LabApiFactory.cs', 'backend/DevLab.Api.Tests/ProductsEndpointsTests.cs', 'backend/DevLab.Api.Tests/AuthTests.cs'],
  },
  {
    id: 'project-setup', track: 'dotnet', icon: '🏗️', title: 'Setup pro : props, analyzers, warnings = erreurs',
    summary: 'Directory.Build.props, Central Package Management, Meziantou + Sonar, et le triage des 230 erreurs que ça a levées sur ce lab.',
    concepts: ['Directory.Build.props', 'Directory.Packages.props', 'TreatWarningsAsErrors', 'AnalysisLevel', '.editorconfig', 'triage'],
    files: ['backend/Directory.Build.props', 'backend/Directory.Packages.props', 'backend/.editorconfig', `${BE}/DevLab.Api.csproj`],
  },
  {
    id: 'vertical-slice', track: 'dotnet', icon: '🍰', title: 'Vertical Slice Architecture + Result<T>',
    summary: 'Le module Orders : un dossier par cas d’usage (Endpoint / Handler / Validator), erreurs métier en valeurs, endpoints découverts par scan.',
    concepts: ['slice', 'Handler sans MediatR', 'Result<T>', 'Error code', 'IApiEndpoint', 'Match'],
    files: [`${BE}/Features/Orders/PlaceOrder/PlaceOrder.Handler.cs`, `${BE}/Features/Orders/PlaceOrder/PlaceOrder.Endpoint.cs`, `${BE}/Features/Orders/PlaceOrder/PlaceOrder.Validator.cs`, `${BE}/Infrastructure/Result.cs`, `${BE}/Features/Orders/Shared/OrderErrors.cs`, `${BE}/Features/Orders/CancelOrder/CancelOrder.cs`, `${BE}/Infrastructure/Modules/ModuleExtensions.cs`],
  },
  {
    id: 'modular-monolith', track: 'dotnet', icon: '🏛️', title: 'Modular Monolith : PublicApi, événements, frontières testées',
    summary: 'Orders ↔ Products ne se parlent que par IProductCatalog et OrderPlaced. Un test NetArchTest interdit tout le reste.',
    concepts: ['IModule', 'PublicApi', 'IDomainEvent', 'IEventBus', 'outbox', 'NetArchTest'],
    files: [`${BE}/Features/Products/PublicApi/IProductCatalog.cs`, `${BE}/Features/Products/Events/OrderPlacedHandler.cs`, `${BE}/Infrastructure/Events/InProcessEventBus.cs`, `${BE}/Features/Orders/OrdersModule.cs`, `${BE}/Features/Products/ProductsModule.cs`, `${BE}/Infrastructure/Modules/IModule.cs`, 'backend/DevLab.Api.Tests/ModuleBoundariesTests.cs', `${BE}/Program.cs`],
  },

  // ─── Auth (full-stack) ──────────────────────────────────────────────────
  {
    id: 'auth-jwt', track: 'auth', icon: '🎟️', title: 'JWT + refresh token',
    summary: 'Access token de 60 s, refresh token opaque avec rotation, interceptor qui rafraîchit tout seul. Regarde-le expirer.',
    concepts: ['JwtBearer', 'HS256', 'claims', 'refresh rotation', 'ClockSkew', 'revocation'],
    files: [`${BE}/Features/Auth/Jwt/JwtEndpoints.cs`, `${BE}/Features/Auth/Jwt/JwtTokenService.cs`, `${BE}/Features/Auth/LabAuthentication.cs`, `${FE}/core/auth/auth.store.ts`, `${FE}/lessons/auth/jwt.ts`],
  },
  {
    id: 'auth-cookie', track: 'auth', icon: '🍪', title: 'Cookie auth + CSRF',
    summary: 'SignInAsync → ticket chiffré HttpOnly. Puis une attaque CSRF bloquée par l’antiforgery (XSRF-TOKEN).',
    concepts: ['AddCookie', 'SignInAsync', 'HttpOnly', 'SameSite', 'Antiforgery', 'X-XSRF-TOKEN'],
    files: [`${BE}/Features/Auth/Cookie/CookieEndpoints.cs`, `${BE}/Features/Auth/LabAuthentication.cs`, `${FE}/lessons/auth/cookie.ts`, `${FE}/app.config.ts`],
  },
  {
    id: 'auth-apikey', track: 'auth', icon: '🔑', title: 'API key (scheme custom)',
    summary: 'Un AuthenticationHandler maison en 30 lignes pour les appels machine-to-machine.',
    concepts: ['AuthenticationHandler<T>', 'AuthenticateResult', 'HandleChallengeAsync', 'X-Api-Key'],
    files: [`${BE}/Features/Auth/ApiKey/ApiKeyAuthenticationHandler.cs`, `${FE}/lessons/auth/apikey.ts`],
  },
  {
    id: 'auth-oidc', track: 'auth', icon: '🌐', title: 'OAuth2 / OIDC — Authorization Code + PKCE',
    summary: 'Un mini Identity Provider embarqué. Angular génère le PKCE, redirige, échange le code : chaque étape est visible.',
    concepts: ['code_verifier', 'code_challenge S256', 'state', 'nonce', 'id_token', 'discovery'],
    files: [`${FE}/lessons/auth/oidc.ts`, `${BE}/Features/Auth/Oidc/FakeIdentityProviderEndpoints.cs`, `${BE}/Features/Auth/Oidc/FakeIdentityProvider.cs`],
  },
  {
    id: 'authorization', track: 'auth', icon: '🚧', title: 'Authorization : rôles, claims, policies',
    summary: 'Policies par rôle, par claim, requirement custom (âge), assertion, et resource-based. Multi-schemes avec « Smart ».',
    concepts: ['RequireRole', 'RequireClaim', 'IAuthorizationRequirement', 'IAuthorizationService', 'PolicyScheme'],
    files: [`${BE}/Features/Auth/Authorization/LabAuthorization.cs`, `${BE}/Features/Auth/LabAuthentication.cs`, `${FE}/lessons/auth/authorization.ts`],
  },
];

export const TRACKS: Record<Track, { label: string; color: string; blurb: string }> = {
  angular: { label: 'Angular', color: 'var(--angular)', blurb: 'Signals, RxJS, routing, forms, DI — la stack front moderne.' },
  dotnet: { label: '.NET', color: 'var(--dotnet)', blurb: 'ASP.NET Core 10 : minimal APIs, EF Core, middleware, SignalR.' },
  auth: { label: 'Auth full-stack', color: 'var(--auth)', blurb: 'JWT, cookie, API key, OIDC/PKCE, policies — des deux côtés.' },
};

export const lessonById = (id: string) => LESSONS.find(l => l.id === id);
