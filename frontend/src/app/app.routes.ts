import { Routes } from '@angular/router';
import { authGuard, hasRoleMatch } from './core/auth/auth.guard';

/**
 * Every lesson is lazy-loaded: `loadComponent` returns a promise → a separate JS
 * chunk downloaded on first navigation. Look at the Network tab: one file per lesson.
 */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home), title: 'DevLab' },

  // ── Angular ──────────────────────────────────────────────────────────────
  { path: 'lessons/signals-state', loadComponent: () => import('./lessons/angular/signals-state').then(m => m.SignalsStateLesson), title: 'Signals & state' },
  { path: 'lessons/rxjs-http', loadComponent: () => import('./lessons/angular/rxjs-http').then(m => m.RxjsHttpLesson), title: 'RxJS & HTTP' },
  { path: 'lessons/forms', loadComponent: () => import('./lessons/angular/forms').then(m => m.FormsLesson), title: 'Reactive forms' },
  { path: 'lessons/di', loadComponent: () => import('./lessons/angular/di').then(m => m.DiLesson), title: 'Dependency injection' },
  { path: 'lessons/interceptors', loadComponent: () => import('./lessons/angular/interceptors').then(m => m.InterceptorsLesson), title: 'Interceptors' },
  { path: 'lessons/control-flow', loadComponent: () => import('./lessons/angular/control-flow').then(m => m.ControlFlowLesson), title: 'Control flow & @defer' },
  { path: 'lessons/components', loadComponent: () => import('./lessons/angular/components').then(m => m.ComponentsLesson), title: 'Composants' },
  { path: 'lessons/directives-pipes', loadComponent: () => import('./lessons/angular/directives-pipes').then(m => m.DirectivesPipesLesson), title: 'Directives & pipes' },

  // Routing lesson: child routes, params → inputs, resolver, guards.
  {
    path: 'lessons/routing',
    loadComponent: () => import('./lessons/angular/routing').then(m => m.RoutingLesson),
    title: 'Routing',
    children: [
      { path: '', loadComponent: () => import('./lessons/angular/routing').then(m => m.RoutingIndex) },
      {
        path: 'product/:id',
        loadComponent: () => import('./lessons/angular/routing').then(m => m.RoutingProduct),
        resolve: { product: () => import('./lessons/angular/routing').then(m => m.productResolver) },
        data: { source: 'resolver' },
      },
      // Same path, two components: canMatch picks the first whose guard passes.
      { path: 'secret', canMatch: [hasRoleMatch('Admin')], loadComponent: () => import('./lessons/angular/routing').then(m => m.RoutingAdminSecret) },
      { path: 'secret', canActivate: [authGuard], loadComponent: () => import('./lessons/angular/routing').then(m => m.RoutingUserSecret) },
    ],
  },

  // ── .NET ─────────────────────────────────────────────────────────────────
  { path: 'lessons/minimal-vs-controllers', loadComponent: () => import('./lessons/dotnet/minimal-vs-controllers').then(m => m.MinimalVsControllersLesson) },
  { path: 'lessons/di-lifetimes', loadComponent: () => import('./lessons/dotnet/di-lifetimes').then(m => m.DiLifetimesLesson) },
  { path: 'lessons/middleware', loadComponent: () => import('./lessons/dotnet/middleware').then(m => m.MiddlewareLesson) },
  { path: 'lessons/ef-core', loadComponent: () => import('./lessons/dotnet/ef-core').then(m => m.EfCoreLesson) },
  { path: 'lessons/validation', loadComponent: () => import('./lessons/dotnet/validation').then(m => m.ValidationLesson) },
  { path: 'lessons/realtime', loadComponent: () => import('./lessons/dotnet/realtime').then(m => m.RealtimeLesson) },
  { path: 'lessons/caching', loadComponent: () => import('./lessons/dotnet/caching').then(m => m.CachingLesson) },
  { path: 'lessons/options', loadComponent: () => import('./lessons/dotnet/options').then(m => m.OptionsLesson) },
  { path: 'lessons/project-setup', loadComponent: () => import('./lessons/dotnet/project-setup').then(m => m.ProjectSetupLesson) },
  { path: 'lessons/vertical-slice', loadComponent: () => import('./lessons/dotnet/vertical-slice').then(m => m.VerticalSliceLesson) },
  { path: 'lessons/modular-monolith', loadComponent: () => import('./lessons/dotnet/modular-monolith').then(m => m.ModularMonolithLesson) },
  { path: 'lessons/testing', loadComponent: () => import('./lessons/dotnet/testing').then(m => m.TestingLesson) },

  // ── Auth ─────────────────────────────────────────────────────────────────
  { path: 'lessons/auth-jwt', loadComponent: () => import('./lessons/auth/jwt').then(m => m.JwtLesson) },
  { path: 'lessons/auth-cookie', loadComponent: () => import('./lessons/auth/cookie').then(m => m.CookieLesson) },
  { path: 'lessons/auth-apikey', loadComponent: () => import('./lessons/auth/apikey').then(m => m.ApiKeyLesson) },
  { path: 'lessons/auth-oidc', loadComponent: () => import('./lessons/auth/oidc').then(m => m.OidcLesson) },
  { path: 'lessons/auth-oidc/callback', loadComponent: () => import('./lessons/auth/oidc').then(m => m.OidcCallback) },
  { path: 'lessons/authorization', loadComponent: () => import('./lessons/auth/authorization').then(m => m.AuthorizationLesson) },

  { path: 'roadmap', loadComponent: () => import('./roadmap/roadmap').then(m => m.Roadmap), title: 'Mode carrière' },
  { path: 'interview', loadComponent: () => import('./interview/interview').then(m => m.Interview), title: 'Entretien' },

  { path: '**', redirectTo: '' },
];
