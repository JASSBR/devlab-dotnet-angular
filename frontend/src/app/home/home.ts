import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LESSONS, TRACKS, Track } from '../lessons/catalog';
import { Progress } from '../shared/progress';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="hero fade-in">
      <div class="glow"></div>
      <span class="badge brand">Lab interactif · code réel</span>
      <h1>Re-apprends <span class="grad">.NET</span> et <span class="grad2">Angular</span><br>en lisant le code qui tourne.</h1>
      <p class="lead">
        Chaque leçon = une démo branchée sur une vraie API ASP.NET Core 10, et les fichiers exacts
        qui la font marcher, servis depuis le disque. Modifie le code, recharge, observe.
        Le panneau <strong>Réseau</strong> en bas à droite te montre chaque requête, header et statut.
      </p>
      <div class="row">
        <a routerLink="/roadmap" class="btn primary">🧭 Suivre le parcours</a>
        <a routerLink="/interview" class="btn">🎤 Me faire interroger</a>
        <a routerLink="/lessons/signals-state" class="btn">Commencer par Angular ⚡</a>
        <a routerLink="/lessons/auth-jwt" class="btn">Aller direct à l'auth 🎟️</a>
        <a href="/scalar/v1" target="_blank" class="btn">OpenAPI ↗</a>
      </div>

      <div class="stats stagger">
        @for (s of stats; track s.label) {
          <div class="stat"><strong>{{ s.value }}</strong><span>{{ s.label }}</span></div>
        }
      </div>
    </section>

    <section class="tracks stagger">
      @for (t of tracks; track t[0]) {
        <div class="card track fade-in">
          <h2 [style.color]="t[1].color">{{ t[1].label }}</h2>
          <p class="muted">{{ t[1].blurb }}</p>
          <ol>
            @for (l of lessonsOf(t[0]); track l.id) {
              <li><a [routerLink]="['/lessons', l.id]">{{ l.icon }} {{ l.title }}</a>
                @if (progress.isDone(l.id)) { <span class="done">✓</span> }
              </li>
            }
          </ol>
        </div>
      }
    </section>

    <section class="card how fade-in">
      <h2>Comment c'est fait</h2>
      <div class="grid-2">
        <div>
          <h3>Backend — <code>backend/DevLab.Api</code></h3>
          <ul>
            <li>ASP.NET Core 10, Minimal APIs + un Controller pour comparer</li>
            <li>EF Core + SQLite, FluentValidation, SignalR, OutputCache, RateLimiter</li>
            <li>5 schémas d'auth : JWT, Cookie, API key, OIDC (IdP embarqué), « Smart »</li>
            <li>xUnit + WebApplicationFactory</li>
          </ul>
        </div>
        <div>
          <h3>Frontend — <code>frontend/src/app</code></h3>
          <ul>
            <li>Angular 22 zoneless, standalone, signals partout</li>
            <li>Interceptors fonctionnels (auth + journal réseau)</li>
            <li>NgRx SignalStore, httpResource, &#64;defer, view transitions</li>
            <li>Ce code viewer lit les fichiers via <code>/api/source</code></li>
          </ul>
        </div>
      </div>
      <p class="muted small">Comptes de test : <code>alice/alice123</code> (Admin, 34 ans) · <code>bob/bob123</code> (User, 17 ans) · <code>carol/carol123</code> (User sans permission). API key : <code>lab-key-123</code>.</p>
    </section>
  `,
  styles: [`
    :host { display: block; max-width: 1100px; margin: 0 auto; padding: 2rem; }
    .hero { position: relative; padding: 3.5rem 0 2rem; }
    .glow { position: absolute; inset: -60px -20% auto -20%; height: 380px; pointer-events: none;
      background: radial-gradient(600px 220px at 25% 0%, #7c5cff30, transparent 70%),
                  radial-gradient(520px 220px at 78% 12%, #22d3ee1f, transparent 70%);
      mask-image: linear-gradient(180deg, #000 30%, transparent); }
    h1 { font-size: clamp(2rem, 1.2rem + 3.4vw, 3.1rem); margin: 1rem 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .6rem; margin-top: 2rem; }
    .stat { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: .7rem .9rem;
      display: flex; flex-direction: column; box-shadow: var(--shadow-sm); }
    .stat strong { font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em;
      background: linear-gradient(135deg, #c4b5fd, #67e8f9); -webkit-background-clip: text; color: transparent; }
    .stat span { font-size: .74rem; color: var(--muted); }
    .grad { background: linear-gradient(90deg, #a78bfa, #7c5cff); -webkit-background-clip: text; color: transparent; }
    .grad2 { background: linear-gradient(90deg, #fb7185, #ef4468); -webkit-background-clip: text; color: transparent; }
    .lead { font-size: 1.1rem; color: #b7c0d1; max-width: 720px; margin-bottom: 1.5rem; }
    .tracks { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin: 2rem 0; }
    .track { transition: transform .16s, border-color .16s; }
    .track:hover { transform: translateY(-3px); border-color: var(--border-strong); }
    ol { padding-left: 1.2rem; margin: 0; } li { margin: .3rem 0; } .done { color: var(--ok); margin-left: .3rem; }
    .how ul { padding-left: 1.1rem; }
    @media (max-width: 700px) { h1 { font-size: 2rem; } }
  `],
})
export class Home {
  readonly progress = inject(Progress);
  readonly stats = [
    { value: 26, label: 'leçons' },
    { value: 53, label: 'questions d’entretien' },
    { value: 51, label: 'compétences cartographiées' },
    { value: 17, label: 'tests backend' },
    { value: '⌘K', label: 'pour tout trouver' },
  ];
  readonly tracks = Object.entries(TRACKS) as [Track, (typeof TRACKS)[Track]][];
  readonly lessonsOf = (track: Track) => LESSONS.filter(l => l.track === track);
}
