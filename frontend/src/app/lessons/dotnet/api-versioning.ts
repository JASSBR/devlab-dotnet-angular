import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

interface Probe { label: string; url: string; headers?: Record<string, string>; }
interface ProbeResult { probe: Probe; status: number; body: unknown; headers: [string, string][]; }

const VERSION_HEADERS = ['api-supported-versions', 'api-deprecated-versions', 'deprecation', 'sunset', 'link'];

@Component({
  selector: 'lesson-api-versioning',
  imports: [LessonShell, Json2Pipe, RouterLink],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Un contrat publié ne t'appartient plus</h3>
        <p>Dès qu'un client (app mobile, partenaire, autre équipe) consomme ton API, chaque changement de contrat est un risque. Versionner, c'est faire coexister l'ancien et le nouveau contrat le temps que les clients migrent.</p>
        <div class="grid-2">
          <div class="card">
            <h4>Breaking → nouvelle version</h4>
            <ul class="small">
              <li>supprimer ou renommer un champ (ici <code>name</code> → <code>firstName</code> + <code>lastName</code>)</li>
              <li>changer un type, rendre un champ d'entrée obligatoire</li>
              <li>changer un code de statut, une route, la sémantique d'une valeur</li>
            </ul>
          </div>
          <div class="card">
            <h4>Non breaking → même version</h4>
            <ul class="small">
              <li>ajouter un champ de réponse <strong>optionnel</strong> (<code>memberSince</code> a été ajouté à v1 après coup)</li>
              <li>ajouter un endpoint, un paramètre optionnel</li>
              <li>à condition que les clients ignorent les champs inconnus (tolerant reader)</li>
            </ul>
          </div>
        </div>

        <h3>Où mettre la version ?</h3>
        <table>
          <tr><th>stratégie</th><th>exemple</th><th>pour</th><th>contre</th></tr>
          <tr><td>segment d'URL</td><td><code>/api/v2/people</code></td><td>visible, testable dans un navigateur, cache HTTP simple</td><td>l'URL d'une ressource change avec la version</td></tr>
          <tr><td>header</td><td><code>api-version: 2.0</code></td><td>URLs stables</td><td>invisible, à documenter, proxies/cache à configurer (<code>Vary</code>)</td></tr>
          <tr><td>query string</td><td><code>?api-version=2.0</code></td><td>simple, convention Azure</td><td>mélange version et filtres</td></tr>
        </table>
        <p class="small muted"><code>Asp.Versioning.Http</code> : <code>ApiVersionReader.Combine(...)</code> accepte les trois ; <code>NewVersionedApi()</code> + <code>HasApiVersion</code> / <code>MapToApiVersion</code> sur les Minimal APIs. Sans version, <code>AssumeDefaultVersionWhenUnspecified</code> sert v1 : les clients d'avant le versioning ne cassent pas. Version inconnue → 400 <code>UnsupportedApiVersion</code> (ProblemDetails).</p>

        <h3>Annoncer la fin d'une version</h3>
        <ul>
          <li><code>ReportApiVersions</code> : chaque réponse liste <code>api-supported-versions</code> et <code>api-deprecated-versions</code>.</li>
          <li><code>Deprecation</code> (RFC 9745) : « marche encore, ne construis plus dessus », avec la date d'effet.</li>
          <li><code>Sunset</code> (RFC 8594) : la date où la version <em>s'arrête</em>, et un <code>Link rel="sunset"</code> vers la doc de migration.</li>
        </ul>
        <p>Côté OpenAPI : un document par version (<code>/openapi/v1.json</code>, <code>/openapi/v2.json</code>), alimenté par l'ApiExplorer versionné (<code>GroupNameFormat = "'v'V"</code>). Le document v1 garde le reste du lab, v2 ne contient que le contrat v2.</p>
        <p class="small muted">Même niveau « API de production » : le rate limiting protège ces endpoints publics (<a routerLink="/lessons/caching">Cache &amp; rate limiting</a>), la résilience protège tes appels sortants (<a routerLink="/lessons/resilience">Résilience</a>).</p>
      </div>

      <div demo class="col">
        <div class="row">
          @for (p of probes; track p.label) {
            <button [class.primary]="!p.label.includes('v3')" (click)="call(p)">{{ p.label }}</button>
          }
        </div>
        <p class="small muted">Même ressource, mêmes handlers : seul le transport de la version change. Les headers de versioning sont aussi visibles dans le journal réseau.</p>
        <div class="col">
          @for (r of results(); track $index) {
            <div class="card fade-in col">
              <div class="row">
                <span class="badge" [class.ok]="r.status < 300" [class.err]="r.status >= 400">HTTP {{ r.status }}</span>
                <code>GET {{ r.probe.url }}</code>
                @for (h of headerList(r.probe); track h) { <code class="muted">{{ h }}</code> }
              </div>
              @if (r.headers.length) {
                <table class="small">
                  @for (h of r.headers; track h[0]) {
                    <tr><td class="mono">{{ h[0] }}</td><td class="mono">{{ h[1] }}</td><td class="muted">{{ hint(h) }}</td></tr>
                  }
                </table>
              }
              <pre class="json">{{ r.body | json2 }}</pre>
            </div>
          }
        </div>
        <div class="row small">
          <a href="/openapi/v1.json" target="_blank" rel="noopener">/openapi/v1.json</a>
          <a href="/openapi/v2.json" target="_blank" rel="noopener">/openapi/v2.json</a>
          <span class="muted">(en local, via le proxy du dev server)</span>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`h4 { margin: 0 0 .4rem; } ul.small { margin: 0; padding-left: 1.1rem; }`],
})
export class ApiVersioningLesson {
  readonly lesson = lessonById('api-versioning')!;
  private readonly http = inject(HttpClient);

  readonly probes: Probe[] = [
    { label: 'URL v1', url: '/api/v1/people' },
    { label: 'URL v2', url: '/api/v2/people' },
    { label: 'header v1', url: '/api/people', headers: { 'api-version': '1.0' } },
    { label: 'header v2', url: '/api/people', headers: { 'api-version': '2.0' } },
    { label: 'query v2', url: '/api/people?api-version=2.0' },
    { label: 'sans version', url: '/api/people' },
    { label: 'v3 (inconnue)', url: '/api/people?api-version=3.0' },
  ];
  readonly results = signal<ProbeResult[]>([]);

  call(probe: Probe) {
    const record = (status: number, body: unknown, headers: HttpHeaders) =>
      this.results.update(l => [{ probe, status, body, headers: pick(headers) }, ...l].slice(0, 4));
    this.http.get(probe.url, { headers: probe.headers ?? {}, observe: 'response' }).subscribe({
      next: (r: HttpResponse<unknown>) => record(r.status, r.body, r.headers),
      error: e => record(e.status, e.error, e.headers),
    });
  }

  headerList = (p: Probe) => Object.entries(p.headers ?? {}).map(([k, v]) => `${k}: ${v}`);

  hint([name, value]: [string, string]): string {
    if (name === 'deprecation' && value.startsWith('@'))
      return `déprécié depuis le ${new Date(Number(value.slice(1)) * 1000).toLocaleDateString('fr-FR')}`;
    if (name === 'sunset') return `arrêt prévu le ${new Date(value).toLocaleDateString('fr-FR')}`;
    return '';
  }
}

const pick = (headers: HttpHeaders): [string, string][] =>
  VERSION_HEADERS.filter(h => headers.has(h)).map(h => [h, headers.getAll(h)!.join(', ')]);
