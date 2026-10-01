import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Snapshot { owner: string; transient: string; scoped: string; singleton: string; }

@Component({
  selector: 'lesson-di-lifetimes',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Trois durées de vie</h3>
        <ul>
          <li><strong>Transient</strong> : nouvelle instance à chaque résolution. Pour les objets légers sans état.</li>
          <li><strong>Scoped</strong> : une instance par <em>scope</em> — en web, par requête HTTP. C'est la durée de vie du <code>DbContext</code>.</li>
          <li><strong>Singleton</strong> : une instance pour toute la vie de l'app. Doit être thread-safe.</li>
        </ul>
        <div class="callout warn"><strong>Piège classique (captive dependency)</strong> : injecter un Scoped dans un Singleton. Le Scoped est capturé pour toujours → un <code>DbContext</code> partagé entre requêtes. Le conteneur lève une exception en Development (<code>ValidateScopes</code>). Solution : injecter <code>IServiceScopeFactory</code> et créer un scope (cf. <code>TickerBackgroundService</code>).</div>
        <p>Chaque appel ci-dessous fait une requête ; l'endpoint résout les 3 services directement et via deux consommateurs. Même couleur = même instance.</p>
      </div>
      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="call()">Nouvelle requête</button>
          <button (click)="calls.set([])">Effacer</button>
          <span class="badge">{{ calls().length }} requête(s)</span>
        </div>
        @for (c of calls(); track $index) {
          <div class="card fade-in">
            <div class="small muted">Requête #{{ calls().length - $index }}</div>
            <table>
              <tr><th>résolu par</th><th>Transient</th><th>Scoped</th><th>Singleton</th></tr>
              @for (s of c; track s.owner) {
                <tr>
                  <td>{{ s.owner }}</td>
                  <td><span class="guid" [style.background]="color(s.transient)">{{ short(s.transient) }}</span></td>
                  <td><span class="guid" [style.background]="color(s.scoped)">{{ short(s.scoped) }}</span></td>
                  <td><span class="guid" [style.background]="color(s.singleton)">{{ short(s.singleton) }}</span></td>
                </tr>
              }
            </table>
          </div>
        }
        @if (calls().length >= 2) {
          <div class="callout ok">Observe : le <strong>Singleton</strong> garde la même couleur entre requêtes, le <strong>Scoped</strong> change entre requêtes mais pas dans une requête, le <strong>Transient</strong> change partout.</div>
        }
      </div>
    </lesson-shell>
  `,
  styles: [`.guid { font-family: var(--mono); font-size: .78rem; padding: .15rem .45rem; border-radius: 6px; color: #0b0f19; font-weight: 600; }`],
})
export class DiLifetimesLesson {
  readonly lesson = lessonById('di-lifetimes')!;
  private readonly http = inject(HttpClient);
  readonly calls = signal<Snapshot[][]>([]);
  readonly count = computed(() => this.calls().length);

  call() { this.http.get<Snapshot[]>('/api/di/lifetimes').subscribe(r => this.calls.update(c => [r, ...c].slice(0, 4))); }
  short = (g: string) => g.slice(0, 8);
  // Deterministic pastel color from the GUID → same instance, same color.
  color(g: string) { const h = [...g.slice(0, 8)].reduce((a, ch) => a + ch.charCodeAt(0) * 31, 0) % 360; return `hsl(${h} 80% 75%)`; }
}
