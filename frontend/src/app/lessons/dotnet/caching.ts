import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Timed { mode: string; ms: number; source: string; computedAt: string; }

@Component({
  selector: 'lesson-caching',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Deux caches, deux niveaux</h3>
        <ul>
          <li><strong>IMemoryCache</strong> : dans le handler, tu caches <em>ce que tu veux</em> (résultat d'une requête DB, appel externe). Pattern cache-aside avec <code>GetOrCreateAsync</code>, expiration absolue + glissante. Local au process → en multi-instances, préférer <code>IDistributedCache</code>/<code>HybridCache</code> + Redis.</li>
          <li><strong>OutputCache</strong> : le framework cache <em>la réponse HTTP entière</em> ; le handler n'est même pas exécuté. Policies nommées, <code>VaryByQuery</code>, invalidation par tags.</li>
        </ul>
        <h3>Rate limiting</h3>
        <p>Middleware intégré : fenêtre fixe / glissante / token bucket / concurrence, partitionné par IP, utilisateur, API key… Réponse <code>429</code> + <code>Retry-After</code>. Indispensable sur tout endpoint public (login !).</p>
      </div>
      <div demo class="col">
        <div class="row">
          <input [value]="name()" (input)="name.set($any($event.target).value)" placeholder="name (clé de cache)">
          <button class="primary" (click)="call('none')">/cache/none</button>
          <button class="primary" (click)="call('memory')">/cache/memory</button>
          <button class="primary" (click)="call('output')">/cache/output</button>
          <button (click)="results.set([])">effacer</button>
        </div>
        <p class="small muted">Le calcul simulé dure 1,2 s. Appelle deux fois le même mode : le 2ᵉ appel memory/output revient en quelques ms (10 s de TTL) et <code>computedAt</code> ne bouge pas.</p>
        <table>
          <tr><th>mode</th><th>durée</th><th>source</th><th>computedAt</th></tr>
          @for (r of results(); track $index) {
            <tr class="fade-in"><td><code>{{ r.mode }}</code></td><td><span class="badge" [class.ok]="r.ms < 200" [class.warn]="r.ms >= 200">{{ r.ms }} ms</span></td><td>{{ r.source }}</td><td class="mono small">{{ r.computedAt.slice(11, 23) }}</td></tr>
          }
        </table>
        <div class="card">
          <h3>Rate limiter : 5 requêtes / 10 s</h3>
          <div class="row"><button class="primary" (click)="hammer()">Envoyer 8 requêtes d'un coup</button>
            @for (s of statuses(); track $index) { <span class="badge" [class.ok]="s === 200" [class.err]="s === 429">{{ s }}</span> }
          </div>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class CachingLesson {
  readonly lesson = lessonById('caching')!;
  private readonly http = inject(HttpClient);
  readonly name = signal('yassir');
  readonly results = signal<Timed[]>([]);
  readonly statuses = signal<number[]>([]);

  call(mode: 'none' | 'memory' | 'output') {
    const t0 = performance.now();
    this.http.get<{ source: string; computedAt: string }>(`/api/cache/${mode}`, { params: { name: this.name() } })
      .subscribe(r => this.results.update(l => [{ mode, ms: Math.round(performance.now() - t0), ...r }, ...l].slice(0, 8)));
  }

  hammer() {
    this.statuses.set([]);
    for (let i = 0; i < 8; i++)
      this.http.get('/api/ratelimit/ping').subscribe({
        next: () => this.statuses.update(s => [...s, 200]),
        error: e => this.statuses.update(s => [...s, e.status]),
      });
  }
}
