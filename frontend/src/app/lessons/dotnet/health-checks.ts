import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Entry { name: string; status: string; durationMs: number; description: string | null; tags: string[]; data: Record<string, unknown>; error: string | null; }
interface Report { status: string; totalDurationMs: number; checkedAt: string; checks: Entry[]; }
interface Dependency { status: string; resetsInSeconds: number | null; }
type Probe = 'live' | 'ready' | 'startup';

@Component({
  selector: 'lesson-health-checks',
  imports: [LessonShell, DecimalPipe, JsonPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Trois probes, trois questions</h3>
        <table>
          <tr><th>Probe</th><th>Question</th><th>Si elle échoue</th><th>Ce qu'elle vérifie</th></tr>
          <tr><td><code>startup</code></td><td>As-tu fini de démarrer ?</td><td>On attend (les autres probes ne sont pas encore appelées)</td><td>Migrations, warm-up, host démarré</td></tr>
          <tr><td><code>liveness</code></td><td>Es-tu bloqué ?</td><td><strong>Redémarrage</strong> du conteneur</td><td>Le process répond. <em>Rien d'externe.</em></td></tr>
          <tr><td><code>readiness</code></td><td>Peux-tu servir du trafic maintenant ?</td><td>Sorti du load balancer, <em>pas</em> redémarré</td><td>Base, dépendances critiques</td></tr>
        </table>
        <div class="callout warn"><strong>Le piège n°1</strong> : mettre la base de données dans la liveness. La base tombe → toutes les répliques sont redémarrées en boucle → elles reviennent sans base → re-redémarrées. Une panne externe devient une panne totale. La base va dans la <em>readiness</em>.</div>

        <h3>Dans ASP.NET Core</h3>
        <ul>
          <li><code>AddHealthChecks().AddCheck&lt;T&gt;("nom", tags: ["ready"])</code> : un registre unique de checks ; <code>MapHealthChecks("/health/ready", new() &#123; Predicate = r =&gt; r.Tags.Contains("ready") &#125;)</code> en filtre un sous-ensemble par tag.</li>
          <li><code>IHealthCheck</code> renvoie <code>Healthy</code> / <code>Degraded</code> / <code>Unhealthy</code> → HTTP <strong>200 / 200 / 503</strong> par défaut. <em>Degraded</em> = « je marche, mais regarde-moi » : alerte, pas d'éviction.</li>
          <li><code>AddDbContextCheck&lt;AppDbContext&gt;()</code> (package <code>…HealthChecks.EntityFrameworkCore</code>) appelle <code>CanConnectAsync</code>.</li>
          <li>Le writer par défaut répond un mot ; un <code>ResponseWriter</code> JSON détaille chaque check (statut, durée, description, data). Attention en production : ne pas y exposer de secrets ni de détails d'infrastructure à un endpoint public.</li>
          <li><code>IHealthCheckPublisher</code> : le mode <em>push</em>. Un service hébergé exécute les checks périodiquement (<code>HealthCheckPublisherOptions.Period</code>) et pousse le rapport vers un monitoring (ici : log des transitions + dernier rapport).</li>
        </ul>
        <p>Compatibilité : <code>/health</code> (Railway, <code>deploy-azure.sh</code>) reste la liveness historique, servie par <code>MapDefaultEndpoints()</code> des ServiceDefaults Aspire ; l'AppHost, lui, surveille <code>/health/ready</code>. Sur Azure Container Apps, les probes HTTP se déclarent dans la révision :</p>
        <pre class="json">probes:   # az containerapp update -n devlab-api -g rg-devlab --yaml app.yaml
  - &#123; type: Startup,   httpGet: &#123; path: /health/startup, port: 8080 &#125;, periodSeconds: 2, failureThreshold: 30 &#125;
  - &#123; type: Liveness,  httpGet: &#123; path: /health/live,    port: 8080 &#125;, periodSeconds: 10 &#125;
  - &#123; type: Readiness, httpGet: &#123; path: /health/ready,   port: 8080 &#125;, periodSeconds: 5 &#125;</pre>
      </div>

      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="probe('live')">GET live</button>
          <button class="primary" (click)="probe('ready')">GET ready</button>
          <button class="primary" (click)="probe('startup')">GET startup</button>
          <span class="muted small">(<code>/api/health-lab/probes/*</code> — les mêmes options que <code>/health/*</code>, sous le préfixe que le proxy relaie)</span>
        </div>

        <div class="card">
          <h3>Casser la dépendance « payment-gateway »</h3>
          <div class="row">
            <button (click)="setDependency('healthy')">Healthy</button>
            <button (click)="setDependency('degraded')">Degraded</button>
            <button (click)="setDependency('unhealthy')">Unhealthy (down)</button>
            @if (dependency(); as d) {
              <span class="badge" [class.ok]="d.status === 'Healthy'" [class.warn]="d.status === 'Degraded'" [class.err]="d.status === 'Unhealthy'">{{ d.status }}</span>
              @if (d.resetsInSeconds) { <span class="muted small">retour automatique à Healthy dans {{ d.resetsInSeconds }} s</span> }
            }
          </div>
          <p class="small muted">Passe-la en Unhealthy puis compare <em>live</em> (200 : le process va bien) et <em>ready</em> (503 : ne m'envoie plus de trafic). En Degraded, <em>ready</em> reste à 200.</p>
        </div>

        @if (result(); as r) {
          <div class="row">
            <span class="badge" [class.ok]="r.code === 200" [class.err]="r.code !== 200">HTTP {{ r.code }}</span>
            <code>{{ r.probe }}</code> → <strong>{{ r.report.status }}</strong>
            <span class="muted small">en {{ r.report.totalDurationMs | number: '1.1-1' }} ms</span>
          </div>
          <table>
            <tr><th>check</th><th>statut</th><th>durée</th><th>tags</th><th>description</th><th>data</th></tr>
            @for (c of r.report.checks; track c.name) {
              <tr class="fade-in">
                <td class="mono">{{ c.name }}</td>
                <td><span class="badge" [class.ok]="c.status === 'Healthy'" [class.warn]="c.status === 'Degraded'" [class.err]="c.status === 'Unhealthy'">{{ c.status }}</span></td>
                <td class="mono">{{ c.durationMs | number: '1.1-1' }} ms</td>
                <td class="mono small">{{ c.tags.join(', ') }}</td>
                <td class="small">{{ c.description ?? c.error ?? '' }}</td>
                <td class="mono small">{{ c.data | json }}</td>
              </tr>
            }
          </table>
        }

        <div class="row">
          <button class="sm" (click)="loadPublished()">Dernier rapport poussé par le publisher</button>
          @if (published(); as p) { <span class="small">{{ p.status }} à <span class="mono">{{ p.checkedAt.slice(11, 19) }}</span> ({{ p.checks.length }} checks, toutes probes confondues)</span> }
        </div>
      </div>
    </lesson-shell>
  `,
})
export class HealthChecksLesson {
  readonly lesson = lessonById('health-checks')!;
  private readonly http = inject(HttpClient);
  readonly result = signal<{ probe: Probe; code: number; report: Report } | null>(null);
  readonly dependency = signal<Dependency | null>(null);
  readonly published = signal<Report | null>(null);

  constructor() {
    this.loadDependency();
    // Refresh the countdown; stops with the component.
    const timer = setInterval(() => { if (this.dependency()?.resetsInSeconds) this.loadDependency(); }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  probe(probe: Probe) {
    // 503 is an HTTP error for HttpClient, but its body is still the JSON report.
    this.http.get<Report>(`/api/health-lab/probes/${probe}`, { observe: 'response' }).subscribe({
      next: (r: HttpResponse<Report>) => this.result.set({ probe, code: r.status, report: r.body! }),
      error: (e: HttpErrorResponse) => this.result.set({ probe, code: e.status, report: e.error as Report }),
    });
  }

  setDependency(state: string) {
    this.http.post<Dependency>(`/api/health-lab/dependency/${state}`, null).subscribe(d => this.dependency.set(d));
  }

  loadDependency() { this.http.get<Dependency>('/api/health-lab/dependency').subscribe(d => this.dependency.set(d)); }

  loadPublished() { this.http.get<Report | null>('/api/health-lab/last-published').subscribe(p => this.published.set(p)); }
}
