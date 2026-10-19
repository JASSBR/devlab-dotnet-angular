import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { forkJoin, switchMap } from 'rxjs';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Timed { mode: string; ms: number; source: string; computedAt: string; }
interface Stampede { mode: string; requests: number; factoryRuns: number; elapsedMs: number; }

@Component({
  selector: 'lesson-caching',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Cacher une valeur ou cacher une réponse</h3>
        <ul>
          <li><strong>IMemoryCache</strong> : dans le handler, tu caches <em>ce que tu veux</em> (résultat d'une requête DB, appel externe). Pattern cache-aside avec <code>GetOrCreateAsync</code>, expiration absolue + glissante. Local au process → en multi-instances, préférer <code>IDistributedCache</code>/<code>HybridCache</code> + Redis.</li>
          <li><strong>OutputCache</strong> : le framework cache <em>la réponse HTTP entière</em> ; le handler n'est même pas exécuté. Policies nommées, <code>VaryByQuery</code>, invalidation par tags.</li>
        </ul>
        <h3>HybridCache : le cache-aside qu'on aurait dû avoir</h3>
        <ul>
          <li><strong>Deux niveaux, une API</strong> : L1 en mémoire du process (ns) + L2 = n'importe quel <code>IDistributedCache</code> enregistré (Redis, SQL Server…), partagé entre instances. <code>GetOrCreateAsync</code> lit L1, puis L2, puis exécute la factory et remplit les deux. Ici pas de L2 : L1 seul, code identique.</li>
          <li><strong>Protection anti-stampede</strong> : 10 requêtes concurrentes sur une clé absente → <em>une seule</em> exécution de la factory, les 9 autres attendent son résultat. <code>IMemoryCache.GetOrCreateAsync</code> n'a pas de verrou : 10 misses = 10 appels à la base, au pire moment (expiration d'une clé chaude).</li>
          <li><strong>Sérialisation</strong> : L2 stocke des octets → <code>System.Text.Json</code> par défaut, remplaçable (<code>AddSerializer</code>, protobuf…). Même en L1, l'objet est désérialisé à chaque lecture, sauf type <code>sealed</code> + <code>[ImmutableObject(true)]</code> : pas de mutation partagée par accident.</li>
          <li><strong>Tags</strong> : <code>GetOrCreateAsync(key, factory, tags: ["greetings"])</code> puis <code>RemoveByTagAsync("greetings")</code> invalide toutes les entrées du tag, quelle que soit leur clé.</li>
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
          <button class="primary" (click)="call('hybrid')">/cache/hybrid</button>
          <button (click)="invalidate()">RemoveByTagAsync("greetings")</button>
          <button (click)="results.set([])">effacer</button>
        </div>
        <p class="small muted">Le calcul simulé dure 1,2 s. Appelle deux fois le même mode : le 2ᵉ appel memory/output revient en quelques ms (10 s de TTL) et <code>computedAt</code> ne bouge pas.</p>
        <table>
          <tr><th>mode</th><th>durée</th><th>source</th><th>computedAt</th></tr>
          @for (r of results(); track $index) {
            <tr class="fade-in"><td><code>{{ r.mode }}</code></td><td><span class="badge" [class.ok]="r.ms < 200" [class.warn]="r.ms >= 200">{{ r.ms }} ms</span></td><td>{{ r.source }}</td><td class="mono small">{{ r.computedAt.slice(11, 23) }}</td></tr>
          }
        </table>
        <div class="card col">
          <h3>Stampede : 10 requêtes concurrentes sur une clé jamais vue</h3>
          <div class="row">
            <button class="primary" (click)="stampede('hybrid')">HybridCache</button>
            <button class="primary" (click)="stampede('memory')">IMemoryCache</button>
            <button (click)="browserStampede()">10 requêtes HTTP depuis le navigateur → /cache/hybrid</button>
          </div>
          @for (s of stampedes(); track $index) {
            <div class="row fade-in small">
              <code>{{ s.mode }}</code> {{ s.requests }} requêtes →
              <span class="badge" [class.ok]="s.factoryRuns === 1" [class.err]="s.factoryRuns > 1">factory exécutée {{ s.factoryRuns }}×</span>
              <span class="muted">{{ s.elapsedMs }} ms</span>
            </div>
          }
          <p class="small muted">Les deux premiers boutons lancent les 10 lectures côté serveur (<code>Task.WhenAll</code>) ; le troisième envoie 10 vraies requêtes HTTP (en HTTP/1.1 le navigateur en garde 6 en vol par hôte : les suivantes trouvent l'entrée déjà calculée).</p>
        </div>
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
  readonly stampedes = signal<Stampede[]>([]);

  call(mode: 'none' | 'memory' | 'output' | 'hybrid') {
    const t0 = performance.now();
    this.http.get<{ source: string; computedAt: string }>(`/api/cache/${mode}`, { params: { name: this.name() } })
      .subscribe(r => this.results.update(l => [{ mode, ms: Math.round(performance.now() - t0), ...r }, ...l].slice(0, 8)));
  }

  invalidate() {
    this.http.delete('/api/cache/hybrid/tags/greetings').subscribe(() =>
      this.results.update(l => [{ mode: 'hybrid', ms: 0, source: 'tag "greetings" invalidé', computedAt: new Date().toISOString() }, ...l].slice(0, 8)));
  }

  stampede(mode: 'hybrid' | 'memory') {
    this.http.post<Stampede>('/api/cache/stampede', null, { params: { mode } })
      .subscribe(s => this.stampedes.update(l => [s, ...l].slice(0, 6)));
  }

  browserStampede() {
    const name = `browser-${Date.now().toString(36)}`;
    const t0 = performance.now();
    forkJoin(Array.from({ length: 10 }, () => this.http.get('/api/cache/hybrid', { params: { name } }))).pipe(
      switchMap(() => this.http.get<{ factoryRuns: number }>('/api/cache/hybrid/stats', { params: { name } })),
    ).subscribe(s => this.stampedes.update(l => [{ mode: 'hybrid (HTTP)', requests: 10, factoryRuns: s.factoryRuns, elapsedMs: Math.round(performance.now() - t0) }, ...l].slice(0, 6)));
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
