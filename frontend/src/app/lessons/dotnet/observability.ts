import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface SpanEvent { name: string; timestamp: string; tags: Record<string, string | null>; }
interface Span {
  traceId: string; spanId: string; parentSpanId: string | null; name: string; source: string; kind: string;
  startUtc: string; durationMs: number; status: string; statusDescription: string | null;
  tags: Record<string, string | null>; events: SpanEvent[];
}
interface LogLine { timestamp: string; level: string; category: string; message: string; spanId: string | null; scopes: Record<string, string | null>; }
interface Trace { traceId: string; root: string; startUtc: string; durationMs: number; hasError: boolean; spans: Span[]; logs: LogLine[]; }
interface Checkout { orderId: string; traceId: string; outcome: string; durationMs: number; total: number; }
interface MetricPoint { instrument: string; outcome: string; count: number; sum: number; min: number; max: number; }
interface Row { span: Span; depth: number; left: number; width: number; }

const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');

@Component({
  selector: 'lesson-observability',
  imports: [LessonShell, DecimalPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Trois signaux, trois questions</h3>
        <ul>
          <li><strong>Logs</strong> — <em>que s'est-il passé ?</em> Des événements datés, riches, chers à stocker. <code>ILogger</code> + message templates : <code>LogInformation("Checkout &#123;OrderId&#125; started", id)</code> produit une propriété <code>OrderId</code> requêtable, pas juste du texte (jamais <code>$"…&#123;id&#125;"</code>). Un <code>BeginScope</code> ajoute <code>OrderId</code> à toutes les lignes écrites dedans.</li>
          <li><strong>Métriques</strong> — <em>combien, à quelle vitesse ?</em> Des agrégats numériques, très peu chers, la base des alertes. <code>Meter</code> (via <code>IMeterFactory</code>) → <code>Counter&lt;T&gt;</code>, <code>Histogram&lt;T&gt;</code> ; les dimensions sont des tags (<code>outcome=success</code>), à cardinalité bornée (pas d'<code>orderId</code> en tag !).</li>
          <li><strong>Traces</strong> — <em>où est passé le temps ?</em> Un arbre de <strong>spans</strong> partageant un <code>TraceId</code>. En .NET, un span = <code>Activity</code>, créé par une <code>ActivitySource</code> : nom, <em>kind</em> (Server / Client / Internal), tags, events (instants dans le span), status (<code>Ok</code> / <code>Error</code>), parent.</li>
        </ul>
        <p>.NET implémente l'API OpenTelemetry nativement (<code>System.Diagnostics</code>) : ASP.NET Core, HttpClient, le runtime émettent déjà spans et métriques. Le <strong>SDK</strong> OpenTelemetry (<code>AddOpenTelemetry()</code>, dans <code>ServiceDefaults</code>) les collecte, les fait passer dans des <em>processors</em> et les exporte.</p>

        <h3>Propagation W3C</h3>
        <p>Entre deux services, le contexte voyage dans un header : <code>traceparent: 00-&lt;traceId 32 hex&gt;-&lt;spanId parent 16 hex&gt;-&lt;flags&gt;</code>. <code>HttpClient</code> l'injecte, ASP.NET Core le lit et continue la trace : c'est ce qui relie le span <code>GET /inventory</code> au checkout ci-dessous. Le flag <code>01</code> = « échantillonné ». (<code>tracestate</code> et <code>baggage</code> transportent le reste.)</p>

        <h3>Corrélation et échantillonnage</h3>
        <p>Chaque log écrit pendant un span porte automatiquement son <code>TraceId</code>/<code>SpanId</code> : depuis une trace lente, on ouvre <em>ses</em> logs, et inversement. L'échantillonnage <strong>head</strong> décide à la racine (<code>ParentBased(TraceIdRatioBased(0.1))</code> = 10 %) et la décision se propage via le flag ; le <strong>tail</strong> sampling (garder toutes les traces en erreur) se fait dans un OpenTelemetry Collector. Les métriques, elles, ne sont jamais échantillonnées : les compteurs restent exacts.</p>

        <h3>OTLP : un protocole, n'importe quel backend</h3>
        <p>Le viewer ci-dessous est un <code>BaseProcessor&lt;Activity&gt;</code> maison qui garde les derniers spans en mémoire. En vrai, l'exporteur OTLP envoie <em>les mêmes données</em> dès que <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> est défini : <strong>dashboard Aspire</strong> en dev (<code>./aspire.sh</code>, l'AppHost injecte la variable), <strong>Jaeger</strong> (<code>docker run -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one</code>), <strong>Grafana</strong> (Tempo / Loki / Prometheus derrière un Collector), <strong>Azure Monitor</strong> (exporteur dédié ou Collector). Changer de backend = changer une variable d'environnement, pas le code.</p>
        <div class="callout"><strong>Aspire</strong> : <code>DevLab.AppHost</code> décrit la topologie en C# (l'API + <code>ng serve</code>) et lance le dashboard ; <code>DevLab.ServiceDefaults</code> est la plomberie commune (OpenTelemetry, health checks, service discovery) que l'API active avec <code>builder.AddServiceDefaults()</code>. L'API reste autonome : sans AppHost, rien n'est exporté, tout le reste marche (Docker, tests, Azure).</div>
        <div class="callout warn"><strong>Quand ça casse</strong> : les runbooks d'incident (5xx/readiness, latence/thread pool, SignalR/CORS après déploiement) sont dans les onglets de code ci-dessous — symptômes, requêtes, diagnostic, rollback <code>az containerapp</code>, modèle de post-mortem.</div>
      </div>

      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="checkout(false, 'none')">POST /checkout</button>
          <button (click)="checkout(true, 'none')">… paiement refusé</button>
          <button (click)="checkout(false, 'sampled')">… avec un traceparent du navigateur</button>
          <button (click)="checkout(false, 'unsampled')">… traceparent non échantillonné (flags 00)</button>
          <button (click)="refresh()">Rafraîchir</button>
        </div>

        @if (last(); as l) {
          <div class="card small">
            <div class="row">
              <span class="badge" [class.ok]="l.result.outcome === 'success'" [class.err]="l.result.outcome !== 'success'">{{ l.result.outcome }}</span>
              <span class="mono">{{ l.result.orderId }}</span> · {{ l.result.durationMs | number: '1.0-0' }} ms
            </div>
            @if (l.sent) { <div class="mono">→ traceparent envoyé : {{ l.sent }}</div> }
            <div class="mono">← traceparent reçu : {{ l.received ?? '—' }}</div>
            @if (l.sent?.endsWith('-00')) {
              <div class="muted">Non échantillonné : l'API a continué la trace sans l'enregistrer → elle n'apparaît pas dans le viewer. Le compteur <code>devlab.checkout.count</code>, lui, a bien été incrémenté.</div>
            }
          </div>
        }

        <div class="row">
          @for (t of traces(); track t.traceId) {
            <button class="sm" [class.primary]="t.traceId === selectedId()" (click)="selectedId.set(t.traceId)">
              {{ t.hasError ? '🔴' : '🟢' }} {{ t.root }} · {{ t.durationMs | number: '1.0-0' }} ms
            </button>
          } @empty { <span class="muted small">Aucune trace : lance un checkout.</span> }
        </div>

        @if (selected(); as t) {
          <div class="waterfall">
            <div class="mono small muted">trace {{ t.traceId }} · {{ t.spans.length }} spans · {{ t.durationMs | number: '1.1-1' }} ms</div>
            @for (r of rows(); track r.span.spanId) {
              <div class="wf-row" [class.active]="r.span.spanId === spanId()" (click)="spanId.set(r.span.spanId)">
                <div class="wf-name" [style.padding-left.rem]="r.depth * .9">
                  <span class="kind">{{ r.span.kind }}</span> {{ r.span.name }}
                </div>
                <div class="wf-track">
                  <div [class]="'wf-bar ' + r.span.kind + (r.span.status === 'Error' ? ' error' : '')"
                       [style.left.%]="r.left" [style.width.%]="r.width"></div>
                </div>
                <div class="wf-ms mono">{{ r.span.durationMs | number: '1.1-1' }} ms</div>
              </div>
            }
          </div>

          @if (span(); as s) {
            <div class="card small">
              <strong>{{ s.name }}</strong> <span class="muted">· {{ s.source }} · span {{ s.spanId }} · parent {{ s.parentSpanId ?? '—' }}</span>
              @if (s.status !== 'Unset') { <span class="badge" [class.ok]="s.status === 'Ok'" [class.err]="s.status === 'Error'">{{ s.status }} {{ s.statusDescription ?? '' }}</span> }
              <table>
                @for (tag of tagsOf(s); track tag[0]) { <tr><td class="mono">{{ tag[0] }}</td><td class="mono tag-value">{{ tag[1] }}</td></tr> }
                @for (e of s.events; track $index) { <tr><td class="mono">event</td><td class="mono">{{ e.name }} {{ e.tags['exception.message'] ?? '' }}</td></tr> }
              </table>
            </div>
          }

          <h3>Logs corrélés (même TraceId)</h3>
          <table class="small">
            <tr><th>+ms</th><th>niveau</th><th>message</th><th>span</th><th>scopes</th></tr>
            @for (l of t.logs; track $index) {
              <tr [class.hl]="l.spanId === spanId()">
                <td class="mono">{{ offset(t, l.timestamp) | number: '1.0-0' }}</td>
                <td><span class="badge" [class.warn]="l.level === 'Warning'" [class.err]="l.level === 'Error'">{{ l.level }}</span></td>
                <td>{{ l.message }}</td>
                <td class="mono"><a (click)="spanId.set(l.spanId)">{{ l.spanId?.slice(0, 8) }}</a></td>
                <td class="mono muted">{{ scopesOf(l) }}</td>
              </tr>
            } @empty { <tr><td colspan="5" class="muted">Aucun log pour cette trace.</td></tr> }
          </table>
        }

        <h3>Métriques custom (Meter « DevLab.Observability »)</h3>
        <table class="small">
          <tr><th>instrument</th><th>outcome</th><th>mesures</th><th>somme</th><th>min</th><th>moy.</th><th>max</th></tr>
          @for (m of metrics(); track m.instrument + m.outcome) {
            <tr><td class="mono">{{ m.instrument }}</td><td>{{ m.outcome }}</td><td>{{ m.count }}</td><td>{{ m.sum | number: '1.0-1' }}</td>
              <td>{{ m.min | number: '1.0-1' }}</td><td>{{ m.sum / m.count | number: '1.0-1' }}</td><td>{{ m.max | number: '1.0-1' }}</td></tr>
          } @empty { <tr><td colspan="7" class="muted">Pas encore de mesure.</td></tr> }
        </table>
        <p class="small muted">Ouvre le journal réseau : chaque réponse de l'API affiche son <code>traceparent</code>, et le bouton « avec un traceparent du navigateur » montre la requête qui l'envoie.</p>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .waterfall { border: 1px solid var(--border); border-radius: var(--radius); padding: .6rem; background: #0d1117; }
    .wf-row { display: grid; grid-template-columns: minmax(220px, 34%) 1fr 80px; gap: .5rem; align-items: center; padding: .15rem .3rem; border-radius: 6px; cursor: pointer; font-size: .8rem; }
    .wf-row:hover, .wf-row.active { background: var(--bg-3); }
    .wf-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wf-track { position: relative; height: 14px; background: #ffffff08; border-radius: 4px; }
    .wf-bar { position: absolute; top: 2px; bottom: 2px; min-width: 2px; border-radius: 3px; background: #8b9bb4; }
    .wf-bar.Server { background: var(--dotnet); } .wf-bar.Client { background: var(--brand-2); }
    .wf-bar.error { background: var(--err); }
    .wf-ms { text-align: right; color: var(--muted); }
    .kind { font-size: .62rem; padding: 0 .3rem; border-radius: 4px; background: #ffffff14; color: var(--muted); font-family: var(--mono); }
    .tag-value { word-break: break-all; }
    tr.hl { background: #7c5cff22; }
    a { cursor: pointer; }
  `],
})
export class ObservabilityLesson {
  readonly lesson = lessonById('observability')!;
  private readonly http = inject(HttpClient);

  readonly traces = signal<Trace[]>([]);
  readonly metrics = signal<MetricPoint[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly spanId = signal<string | null>(null);
  readonly last = signal<{ result: Checkout; sent?: string; received: string | null } | null>(null);

  readonly selected = computed(() => this.traces().find(t => t.traceId === this.selectedId()) ?? this.traces()[0]);
  readonly span = computed(() => this.selected()?.spans.find(s => s.spanId === this.spanId()));

  /** Depth-first walk of the span tree; bars positioned relative to the trace's start and duration. */
  readonly rows = computed<Row[]>(() => {
    const t = this.selected();
    if (!t) return [];
    const start = Date.parse(t.startUtc), total = Math.max(t.durationMs, 1);
    const ids = new Set(t.spans.map(s => s.spanId));
    const children = (parent: string | null) => t.spans
      .filter(s => parent === null ? !s.parentSpanId || !ids.has(s.parentSpanId) : s.parentSpanId === parent)
      .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
    const walk = (parent: string | null, depth: number): Row[] => children(parent).flatMap(span => [
      { span, depth, left: (Date.parse(span.startUtc) - start) / total * 100, width: Math.max(span.durationMs / total * 100, .4) },
      ...walk(span.spanId, depth + 1),
    ]);
    return walk(null, 0);
  });

  constructor() { this.refresh(); }

  checkout(fail: boolean, traceparent: 'none' | 'sampled' | 'unsampled') {
    // A browser-side trace context: the API will CONTINUE this trace instead of starting one.
    const sent = traceparent === 'none' ? undefined : `00-${hex(16)}-${hex(8)}-${traceparent === 'sampled' ? '01' : '00'}`;
    const headers = sent ? new HttpHeaders({ traceparent: sent }) : undefined;
    this.http.post<Checkout>('/api/observability/checkout', null, { params: fail ? { fail: true } : {}, headers, observe: 'response' })
      .subscribe((r: HttpResponse<Checkout>) => {
        this.last.set({ result: r.body!, sent, received: r.headers.get('traceparent') });
        this.selectedId.set(r.body!.traceId);
        this.spanId.set(null);
        // The server span ends right AFTER the response is sent: give it a moment.
        setTimeout(() => this.refresh(), 250);
      });
  }

  refresh() {
    this.http.get<Trace[]>('/api/observability/traces', { params: { limit: 8 } }).subscribe(t => this.traces.set(t));
    this.http.get<MetricPoint[]>('/api/observability/metrics').subscribe(m => this.metrics.set(m));
  }

  offset = (t: Trace, ts: string) => Date.parse(ts) - Date.parse(t.startUtc);
  tagsOf = (s: Span) => Object.entries(s.tags);
  scopesOf = (l: LogLine) => Object.entries(l.scopes).filter(([k]) => k === 'OrderId' || k === 'RequestPath').map(([k, v]) => `${k}=${v}`).join(' ');
}
