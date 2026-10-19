import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Snippet, SnippetTable } from './snippet-table';

interface Phase { step: string; code: string; trace: string[]; }
interface Benchmark { n: number; lookups: number; listMs: number; hashSetMs: number; listHits: number; hashSetHits: number; ratio: number; }

@Component({
  selector: 'lesson-collections-linq',
  imports: [LessonShell, SnippetTable, RouterLink],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Choisir la bonne collection</h3>
        <ul>
          <li><code>List&lt;T&gt;</code> : le <code>Array</code> de TS. Accès par index O(1), <code>Contains</code> O(n).</li>
          <li><code>Dictionary&lt;TKey, TValue&gt;</code> : la <code>Map</code>. <code>TryGetValue</code> / <code>GetValueOrDefault</code> plutôt que l'indexeur, qui lève <code>KeyNotFoundException</code>. Passe un <code>StringComparer</code> pour des clés insensibles à la casse.</li>
          <li><code>HashSet&lt;T&gt;</code> : le <code>Set</code>. <code>Contains</code> en O(1) — la démo le mesure.</li>
          <li>Exposer : <code>IReadOnlyList&lt;T&gt;</code> / <code>IReadOnlyCollection&lt;T&gt;</code> dans les signatures. Mais renvoyer la <code>List</code> elle-même sous ce type ne protège rien : un cast la rend modifiable. <code>AsReadOnly()</code> renvoie un vrai wrapper.</li>
        </ul>
        <h3>LINQ est paresseux (deferred execution)</h3>
        <p>À l'inverse de <code>array.filter().map()</code> (chaque étape produit un tableau complet), <code>Where</code>/<code>Select</code> construisent un <strong>pipeline d'itérateurs</strong>. Rien ne s'exécute avant qu'on <em>tire</em> les éléments (<code>foreach</code>, <code>ToList</code>, <code>Count</code>, <code>First</code>…), et chaque élément traverse tout le pipeline avant le suivant.</p>
        <div class="callout warn"><strong>Piège de l'énumération multiple</strong> : énumérer deux fois un <code>IEnumerable</code> ré-exécute toute la chaîne — la source comprise (fichier relu, appel HTTP refait, requête SQL rejouée). Matérialise une fois avec <code>ToList()</code>/<code>ToArray()</code> quand tu dois relire.</div>
        <ul>
          <li><code>First</code> lève une exception si rien ne correspond, <code>FirstOrDefault</code> renvoie <code>null</code>/<code>default</code>. <code>Single</code> exige <em>exactement</em> un élément.</li>
          <li><code>Any()</code> plutôt que <code>Count() &gt; 0</code> : il s'arrête au premier élément.</li>
          <li><code>ToDictionary</code> lève sur une clé dupliquée ; <code>GroupBy</code> ou <code>ToLookup</code> si plusieurs valeurs par clé.</li>
        </ul>
        <h3>IEnumerable vs IQueryable</h3>
        <p>Mêmes opérateurs, deux moteurs : <code>IEnumerable&lt;T&gt;</code> exécute des délégués en mémoire (ici) ; <code>IQueryable&lt;T&gt;</code> garde un arbre d'expression que le provider (EF Core) traduit en SQL.
        Un <code>AsEnumerable()</code>/<code>ToList()</code> trop tôt ramène toute la table en mémoire. La traduction SQL est démontrée dans la leçon <a routerLink="/lessons/ef-core">EF Core</a>.</p>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>1. Deferred execution : la trace d'exécution</h3>
          <p class="small muted">La source est un itérateur <code>yield return</code> qui journalise chaque élément tiré ; <code>Where</code> et <code>Select</code> journalisent aussi.</p>
          <div class="row"><button class="primary" (click)="loadDeferred()">GET /api/linq/deferred</button></div>
          <div class="phases">
            @for (p of phases(); track p.step) {
              <div class="fade-in">
                <div class="row"><span class="badge info">{{ p.step }}</span><code>{{ p.code }}</code>
                  <span class="badge" [class.ok]="p.trace.length === 0" [class.warn]="p.trace.length > 0">{{ p.trace.length }} ligne(s) exécutée(s)</span></div>
                <div class="json">
                  @for (t of p.trace; track $index) { <div>{{ t }}</div> } @empty { <div class="muted">(rien : la requête n'est qu'une recette)</div> }
                </div>
              </div>
            }
          </div>
        </div>

        <div class="card">
          <h3>2. List.Contains vs HashSet.Contains</h3>
          <div class="row">
            <label class="small">N éléments <input type="number" style="width:110px" [value]="n()" (input)="n.set(+$any($event.target).value)"></label>
            @for (p of presets; track p) { <button class="sm" (click)="n.set(p); bench()">{{ p.toLocaleString('fr-FR') }}</button> }
            <button class="primary" (click)="bench()">Mesurer</button>
          </div>
          <p class="small muted">{{ benchmarks()[0]?.lookups ?? 1000 }} recherches (la moitié ratées : le pire cas pour une liste), même résultat, complexité différente.</p>
          @if (benchmarks().length) {
            <table>
              <tr><th>N</th><th>List.Contains</th><th>HashSet.Contains</th><th>trouvés</th><th>ratio</th></tr>
              @for (b of benchmarks(); track $index) {
                <tr class="fade-in"><td>{{ b.n.toLocaleString('fr-FR') }}</td>
                  <td><span class="badge warn">{{ b.listMs }} ms</span></td><td><span class="badge ok">{{ b.hashSetMs }} ms</span></td>
                  <td>{{ b.listHits }} / {{ b.hashSetHits }}</td><td><strong>×{{ b.ratio }}</strong></td></tr>
              }
            </table>
          }
        </div>

        <div class="card">
          <h3>3. Exposer et interroger des collections</h3>
          <div class="row">
            <label class="small">clé <input [value]="key()" (input)="key.set($any($event.target).value)" placeholder="fr, be, ma, xx…"></label>
            <button class="primary" (click)="load('collections', { key: key() })">GET /api/linq/collections</button>
          </div>
          @if (snippets()['collections']; as s) { <snippet-table [snippets]="s" /> }
        </div>

        <div class="card">
          <h3>4. Les opérateurs sur un jeu de commandes</h3>
          <div class="row"><button class="primary" (click)="load('operators')">GET /api/linq/operators</button></div>
          @if (snippets()['operators']; as s) { <snippet-table [snippets]="s" /> }
        </div>
        @if (error()) { <div class="callout err">{{ error() }}</div> }
      </div>
    </lesson-shell>
  `,
  styles: [`
    .phases { display: grid; gap: .75rem; margin-top: .75rem; }
    label { display: inline-flex; align-items: center; gap: .3rem; }
  `],
})
export class CollectionsLinqLesson {
  readonly lesson = lessonById('collections-linq')!;
  private readonly http = inject(HttpClient);

  readonly presets = [1_000, 50_000, 200_000];
  readonly phases = signal<Phase[]>([]);
  readonly benchmarks = signal<Benchmark[]>([]);
  readonly snippets = signal<Partial<Record<'collections' | 'operators', Snippet[]>>>({});
  readonly error = signal<string | null>(null);
  readonly n = signal(50_000);
  readonly key = signal('fr');

  loadDeferred() {
    this.http.get<{ phases: Phase[] }>('/api/linq/deferred').subscribe({ next: r => this.phases.set(r.phases), error: e => this.fail(e) });
  }

  bench() {
    this.http.get<Benchmark>('/api/linq/hashset-vs-list', { params: { n: String(this.n()) } })
      .subscribe({ next: b => this.benchmarks.update(l => [b, ...l].slice(0, 6)), error: e => this.fail(e) });
  }

  load(demo: 'collections' | 'operators', params: Record<string, string> = {}) {
    this.http.get<Snippet[]>(`/api/linq/${demo}`, { params })
      .subscribe({ next: r => this.snippets.update(s => ({ ...s, [demo]: r })), error: e => this.fail(e) });
  }

  private fail(e: { status: number; message: string }) { this.error.set(`${e.status} — ${e.message}`); }
}
