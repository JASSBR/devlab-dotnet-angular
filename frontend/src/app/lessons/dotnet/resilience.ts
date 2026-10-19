import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { concat, defer, finalize, tap } from 'rxjs';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

type Pipeline = 'none' | 'standard' | 'custom';
interface FlakyConfig { failureRate: number; latencyMs: number; failNext: number; }
interface Attempt { number: number; outcome: string; durationMs: number; retryDelayMs: number | null; }
interface Call { index: number; success: boolean; outcome: string; elapsedMs: number; attempts: Attempt[]; }
interface RunReport { pipeline: Pipeline; calls: Call[]; successRate: number; p50Ms: number; p95Ms: number; circuit: string; }
interface ResilienceEvent { at: string; pipeline: string; kind: string; detail: string; }
interface ResilienceState { config: FlakyConfig; flakyCalls: number; circuits: Record<'standard' | 'custom', string>; events: ResilienceEvent[]; }

@Component({
  selector: 'lesson-resilience',
  imports: [LessonShell, RouterLink],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Une dépendance distante finit toujours par flancher</h3>
        <p>503 pendant un redéploiement, pic de latence, connexion coupée : ces pannes sont <strong>transitoires</strong>. Sans stratégie, chacune remonte jusqu'à l'utilisateur.
        <code>Microsoft.Extensions.Http.Resilience</code> (Polly v8 dessous) branche un pipeline de stratégies sur un <code>HttpClient</code> nommé ou typé, comme un <code>DelegatingHandler</code>.</p>

        <h3><code>AddStandardResilienceHandler()</code> : 5 stratégies, dans cet ordre</h3>
        <table>
          <tr><th>#</th><th>stratégie</th><th>rôle</th><th>défaut</th><th>ici</th></tr>
          <tr><td>1</td><td>Rate limiter</td><td>borne les requêtes concurrentes sortantes</td><td>1000</td><td>50</td></tr>
          <tr><td>2</td><td>Total timeout</td><td>budget de l'appel complet, retries inclus</td><td>30 s</td><td>6 s</td></tr>
          <tr><td>3</td><td>Retry</td><td>backoff exponentiel + jitter sur 408/429/5xx, <code>HttpRequestException</code>, timeouts</td><td>3 × 2 s</td><td>3 × 200 ms</td></tr>
          <tr><td>4</td><td>Circuit breaker</td><td>trop d'échecs → coupe et rejette sans appeler</td><td>10 % / 100 appels / 30 s</td><td>50 % / 5 / 10 s</td></tr>
          <tr><td>5</td><td>Attempt timeout</td><td>durée max d'<em>une</em> tentative</td><td>10 s</td><td>1 s</td></tr>
        </table>
        <p class="small muted">Lu de l'extérieur vers l'intérieur : le retry enveloppe le circuit breaker, qui enveloppe le timeout par tentative. Une tentative trop lente est coupée puis retentée ; le total timeout borne le tout.</p>

        <h3>Pipeline sur mesure</h3>
        <p><code>AddResilienceHandler("custom", b =&gt; b.AddTimeout(…).AddRetry(…).AddCircuitBreaker(…).AddTimeout(…))</code> : mêmes briques, ton ordre, tes seuils, et des callbacks <code>OnRetry</code> / <code>OnOpened</code> / <code>OnHalfOpened</code> / <code>OnClosed</code> pour logguer ou émettre des métriques. <code>CircuitBreakerStateProvider</code> lit l'état, <code>CircuitBreakerManualControl</code> l'ouvre ou le ferme à la main.</p>

        <h3>Ce qui fait la différence en prod</h3>
        <ul>
          <li><strong>Idempotence d'abord.</strong> Ne retenter que ce qui peut être rejoué : GET, PUT, DELETE. Un POST retenté peut débiter deux fois — d'où <code>DisableForUnsafeHttpMethods()</code> ici. Pour retenter un POST, il faut une <em>clé d'idempotence</em> côté serveur : voir <a routerLink="/lessons/idempotency-outbox">Idempotence &amp; outbox</a>.</li>
          <li><strong>Retry storm.</strong> 3 retries à chacune de 3 couches = jusqu'à 4³ = 64 appels pour un clic. Un seul niveau retente, avec jitter (sinon tous les clients retentent à la même milliseconde), et le circuit breaker coupe l'amplification.</li>
          <li><strong>Budget de timeouts.</strong> tentatives × attempt timeout + délais ≤ total timeout ≤ timeout de ton propre appelant. Sinon tu retentes pour un client déjà parti.</li>
          <li><strong>Fallback.</strong> <code>AddFallback</code> : une valeur dégradée (dernier résultat en cache, liste vide) plutôt qu'une 500, quand le métier l'accepte.</li>
          <li><strong>Hedging.</strong> <code>AddStandardHedgingHandler()</code> : si la réponse tarde, envoie une 2ᵉ requête en parallèle (même hôte ou un autre) et garde la première réponse. Réduit le p99, multiplie la charge : lectures idempotentes seulement.</li>
        </ul>
        <p class="small muted">Le pendant côté serveur — protéger <em>ton</em> API des clients trop pressés — est le rate limiting (429 + <code>Retry-After</code>, que le retry standard respecte) : voir <a routerLink="/lessons/caching">Cache &amp; rate limiting</a>.</p>
      </div>

      <div demo class="col">
        <div class="card col">
          <h3>La dépendance instable — <code>GET /api/resilience/flaky</code></h3>
          <div class="grid-2">
            <div>
              <label>Taux d'échec (500/503) : <strong>{{ pct(config().failureRate) }}</strong></label>
              <input type="range" min="0" max="100" step="5" [value]="config().failureRate * 100"
                     (input)="patch({ failureRate: +$any($event.target).value / 100 })" (change)="apply()">
            </div>
            <div>
              <label>Latence : <strong>{{ config().latencyMs }} ms</strong> <span class="muted">(attempt timeout : 1 s standard, 800 ms custom)</span></label>
              <input type="range" min="0" max="3000" step="100" [value]="config().latencyMs"
                     (input)="patch({ latencyMs: +$any($event.target).value })" (change)="apply()">
            </div>
          </div>
          <div class="row">
            <button (click)="patch({ failNext: 2 }); apply()">Les 2 prochains appels échouent</button>
            <label class="inline">Appels par pipeline
              <input type="number" min="1" max="20" [value]="calls()" (input)="calls.set(clampCalls(+$any($event.target).value))">
            </label>
            <button (click)="reset()">Reset (config + circuits)</button>
            @if (config().failNext) { <span class="badge warn">{{ config().failNext }} échec(s) forcé(s) en attente</span> }
          </div>
        </div>

        <div class="row">
          @for (p of pipelines; track p) {
            <button class="primary" [disabled]="running()" (click)="run(p)">{{ calls() }} appels → {{ p }}</button>
          }
          <button [disabled]="running()" (click)="runAll()">Comparer les 3</button>
          @if (running()) { <span class="badge info pulse">{{ running() }} en cours…</span> }
        </div>

        <div class="row circuits">
          @for (c of circuitNames; track c) {
            <div class="circuit">
              <span class="muted small">circuit <strong>{{ c }}</strong></span>
              @for (s of states; track s) {
                <span [class]="'light ' + s.toLowerCase() + (state()?.circuits?.[c] === s ? ' on' : '')">{{ s }}</span>
              }
            </div>
          }
          <button class="sm" (click)="refresh()">rafraîchir</button>
          <span class="muted small">appels reçus par /flaky : {{ state()?.flakyCalls ?? 0 }}</span>
        </div>

        <div class="grid-3">
          @for (p of pipelines; track p) {
            <div class="card col">
              <div class="row"><h3>{{ p }}</h3>
                @if (reports()[p]; as r) {
                  <span class="badge" [class.ok]="r.successRate >= 0.9" [class.warn]="r.successRate < 0.9 && r.successRate >= 0.5" [class.err]="r.successRate < 0.5">{{ pct(r.successRate) }} succès</span>
                  <span class="badge">p50 {{ r.p50Ms }} ms</span><span class="badge">p95 {{ r.p95Ms }} ms</span>
                }
              </div>
              @if (reports()[p]; as r) {
                <div class="timeline">
                  @for (call of r.calls; track call.index) {
                    <div class="call fade-in">
                      <span class="mono muted">#{{ call.index }}</span>
                      @for (a of call.attempts; track a.number) {
                        <span [class]="'att ' + kind(a.outcome)" [title]="'tentative ' + a.number + ' — ' + a.durationMs + ' ms'">{{ a.outcome }}</span>
                        @if (a.retryDelayMs !== null) { <span class="wait">⏱{{ a.retryDelayMs }}</span> }
                      }
                      <span class="spacer"></span>
                      <span class="mono small" [class.ok-text]="call.success" [class.err-text]="!call.success">{{ call.elapsedMs }} ms</span>
                    </div>
                  }
                </div>
              } @else {
                <p class="muted small">{{ blurb[p] }}</p>
              }
            </div>
          }
        </div>
        <p class="small muted">Chaque pastille = une tentative réelle vue par le handler le plus interne (<code>AttemptRecorderHandler</code>) ; ⏱ = délai de backoff choisi par le retry (exponentiel + jitter). <code>circuit-open</code> = rejet immédiat, la dépendance n'est même pas appelée.</p>

        @if (state()?.events?.length) {
          <div class="card">
            <h3>Événements des callbacks (OnRetry, OnOpened, OnHalfOpened, OnClosed)</h3>
            <table>
              @for (e of state()!.events.slice(0, 12); track $index) {
                <tr><td class="mono small">{{ e.at.slice(11, 23) }}</td><td><code>{{ e.pipeline }}</code></td><td><span class="badge" [class.err]="e.kind === 'circuit-opened'" [class.warn]="e.kind === 'circuit-half-open'" [class.ok]="e.kind === 'circuit-closed'">{{ e.kind }}</span></td><td class="small">{{ e.detail }}</td></tr>
              }
            </table>
          </div>
        }
      </div>
    </lesson-shell>
  `,
  styles: [`
    input[type=range] { width: 100%; padding: 0; }
    label.inline { display: flex; align-items: center; gap: .4rem; margin: 0; }
    label.inline input { width: 4.5rem; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .8rem; }
    .circuits { gap: 1.2rem; }
    .circuit { display: flex; align-items: center; gap: .3rem; }
    .light { font-size: .7rem; padding: .1rem .45rem; border-radius: 999px; border: 1px solid var(--border); opacity: .35; }
    .light.on { opacity: 1; font-weight: 700; }
    .light.closed.on { color: #86efac; border-color: #14532d; background: #052e16; }
    .light.halfopen.on { color: #fde68a; border-color: #713f12; background: #2a1c05; }
    .light.open.on, .light.isolated.on { color: #fca5a5; border-color: #7f1d1d; background: #2a0808; }
    .timeline { display: flex; flex-direction: column; gap: .25rem; max-height: 360px; overflow: auto; }
    .call { display: flex; align-items: center; gap: .25rem; flex-wrap: wrap; font-size: .75rem; }
    .spacer { flex: 1; }
    .att { font-family: var(--mono); font-size: .7rem; padding: .05rem .35rem; border-radius: 6px; border: 1px solid var(--border); }
    .att.ok { color: #86efac; border-color: #14532d; background: #052e16; }
    .att.err { color: #fca5a5; border-color: #7f1d1d; background: #2a0808; }
    .att.slow { color: #fde68a; border-color: #713f12; background: #2a1c05; }
    .att.open { color: #c4b5fd; border-color: #4c1d95; background: #1e1040; }
    .wait { color: var(--muted); font-size: .68rem; }
    .ok-text { color: var(--ok); } .err-text { color: var(--err); }
  `],
})
export class ResilienceLesson {
  readonly lesson = lessonById('resilience')!;
  private readonly http = inject(HttpClient);

  readonly pipelines: Pipeline[] = ['none', 'standard', 'custom'];
  readonly circuitNames = ['standard', 'custom'] as const;
  readonly states = ['Closed', 'HalfOpen', 'Open'];
  readonly blurb: Record<Pipeline, string> = {
    none: 'HttpClient nu : la première 503 ou le premier appel lent remonte tel quel.',
    standard: 'AddStandardResilienceHandler() : rate limiter, total timeout, retry, circuit breaker, attempt timeout.',
    custom: 'AddResilienceHandler("custom") : timeout 5 s → retry ×4 (100 ms exp.) → circuit 50 %/4 → timeout 800 ms.',
  };

  readonly config = signal<FlakyConfig>({ failureRate: 0.3, latencyMs: 50, failNext: 0 });
  readonly calls = signal(10);
  readonly reports = signal<Partial<Record<Pipeline, RunReport>>>({});
  readonly running = signal<Pipeline | null>(null);
  readonly state = signal<ResilienceState | null>(null);

  constructor() { this.refresh(true); }

  patch(change: Partial<FlakyConfig>) { this.config.update(c => ({ ...c, ...change })); }

  apply() { this.http.put<FlakyConfig>('/api/resilience/flaky/config', this.config()).subscribe(c => this.config.set(c)); }

  refresh(loadConfig = false) {
    this.http.get<ResilienceState>('/api/resilience/state').subscribe(s => {
      this.state.set(s);
      if (loadConfig) this.config.set(s.config);
    });
  }

  reset() {
    this.http.post('/api/resilience/reset', null).subscribe(() => { this.reports.set({}); this.refresh(true); });
  }

  run(p: Pipeline) { this.runSequence([p]); }
  runAll() { this.runSequence(this.pipelines); }

  /** Pipelines run one after the other: they share the flaky dependency, so the comparison stays fair. */
  private runSequence(list: Pipeline[]) {
    concat(...list.map(p => defer(() => {
      this.running.set(p);
      return this.http.post<RunReport>('/api/resilience/run', { pipeline: p, calls: this.calls() }).pipe(
        tap(r => this.reports.update(m => ({ ...m, [p]: r }))),
      );
    }))).pipe(finalize(() => { this.running.set(null); this.refresh(true); })).subscribe();
  }

  kind(outcome: string): string {
    if (outcome === 'timeout') return 'slow';
    if (outcome === 'circuit-open') return 'open';
    return outcome.startsWith('2') ? 'ok' : 'err';
  }

  clampCalls = (n: number) => Math.min(20, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));
  pct = (x: number) => `${Math.round(x * 100)} %`;
}
