import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Snippet, SnippetTable } from './snippet-table';

interface CopyScenario { kind: 'struct' | 'class'; scenario: string; originalBefore: number; originalAfter: number; copyAfter: number; }
interface ExceptionDemo { amount: number; balanceAfter: number; outcome: string; trace: string[]; }
interface StringsDemo { n: number; concatMs: number; builderMs: number; concatLength: number; builderLength: number; snippets: Snippet[]; }
interface FlagsDemo { value: number; binary: string; name: string; canWrite: boolean; canDelete: boolean; isAdmin: boolean; }

type SnippetDemo = 'basics' | 'records' | 'oop' | 'patterns';

@Component({
  selector: 'lesson-csharp-fundamentals',
  imports: [LessonShell, SnippetTable],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le même langage… presque</h3>
        <p>C# et TypeScript ont le même père (Anders Hejlsberg) : <code>?.</code>, <code>??</code>, lambdas <code>=&gt;</code>, génériques, <code>async/await</code> se lisent pareil.
        La vraie différence : <strong>les types existent à l'exécution</strong>. Pas d'effacement, pas de <code>any</code> implicite, et <code>var</code> n'est qu'une inférence <em>figée</em> à la compilation.</p>
        <table>
          <tr><th>TypeScript</th><th>C#</th><th>à retenir</th></tr>
          <tr><td><code>let x = 0</code></td><td><code>var x = 0;</code></td><td><code>int</code> pour toujours ; <code>decimal</code> (<code>0m</code>) pour l'argent, jamais <code>double</code></td></tr>
          <tr><td><code>switch</code> + <code>return</code></td><td><code>x switch {{ '{' }} … {{ '}' }}</code></td><td>une expression, exhaustive, avec patterns (propriétés, <code>&gt;=</code>, listes <code>[0, ..]</code>)</td></tr>
          <tr><td><code>{{ '{' }} ...a, city {{ '}' }}</code></td><td><code>a with {{ '{' }} City = … {{ '}' }}</code></td><td>les <code>record</code> : égalité par valeur, copie non destructive</td></tr>
          <tr><td><code>enum</code> / union de littéraux</td><td><code>enum</code> + <code>[Flags]</code></td><td>un entier ; <code>[Flags]</code> = combinaison de bits</td></tr>
          <tr><td><code>catch (e) {{ '{' }} if … {{ '}' }}</code></td><td><code>catch (X ex) when (…)</code></td><td>le filtre est évalué <em>avant</em> de dérouler la pile ; catch typés multiples</td></tr>
          <tr><td><code>&lt;T extends I&gt;</code></td><td><code>where T : I, new()</code></td><td>génériques réifiés : <code>List&lt;int&gt;</code> ≠ <code>List&lt;string&gt;</code> au runtime</td></tr>
          <tr><td><code>strictNullChecks</code></td><td><code>string?</code> (NRT)</td><td>analyse du compilateur, <em>pas</em> une vérification runtime</td></tr>
        </table>
        <h3>struct vs class : valeur vs référence</h3>
        <p>En TS, un objet est toujours partagé par référence. En C#, une <code>class</code> aussi ; une <code>struct</code> est <strong>copiée</strong> à chaque affectation et à chaque passage en paramètre.
        Réserve les structs aux petites valeurs immuables (<code>readonly struct</code>, <code>record struct</code>) : <code>DateTime</code>, <code>Guid</code>, une coordonnée.</p>
        <h3>Héritage vs composition</h3>
        <p>L'héritage fige une relation « est-un » à la compilation : <code>Penguin : Bird</code> hérite de <code>Fly()</code> et doit le casser (violation de Liskov).
        La composition injecte des comportements (« a-un ») : petits, testables seuls, recombinables sans nouvelle sous-classe. C'est exactement ce que fait la DI d'ASP.NET Core. Les <strong>default interface members</strong> ajoutent un comportement à une interface sans casser ses implémentations.</p>
        <div class="callout">Chaque bouton appelle un endpoint qui <strong>exécute</strong> le C# montré et renvoie ce qui s'est passé. Le code est en bas de page.</div>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>1. struct vs class — la copie, prouvée</h3>
          <div class="row"><button class="primary" (click)="loadCopy()">GET /api/csharp/struct-vs-class</button></div>
          @if (copies().length) {
            <table>
              <tr><th>type</th><th>scénario</th><th>original avant</th><th>copie après modif</th><th>original après</th><th></th></tr>
              @for (c of copies(); track c.kind + c.scenario) {
                <tr class="fade-in">
                  <td><span class="badge" [class.info]="c.kind === 'struct'" [class.warn]="c.kind === 'class'">{{ c.kind }}</span></td>
                  <td>{{ c.scenario }}</td><td>{{ c.originalBefore }}</td><td>{{ c.copyAfter }}</td><td><strong>{{ c.originalAfter }}</strong></td>
                  <td class="small">{{ c.originalAfter === c.originalBefore ? 'original intact : la copie est indépendante' : 'original modifié : même objet' }}</td>
                </tr>
              }
            </table>
          }
        </div>

        <div class="card">
          <h3>2. Pattern matching</h3>
          <div class="row">
            <label class="small">nombres <input [value]="numbers()" (input)="numbers.set($any($event.target).value)" placeholder="1,2,3"></label>
            <label class="small">pays <select [value]="country()" (change)="country.set($any($event.target).value)">
              @for (c of countries; track c) { <option [value]="c">{{ c }}</option> }
            </select></label>
            <label class="small">total <input type="number" style="width:90px" [value]="total()" (input)="total.set(+$any($event.target).value)"></label>
            <label class="small"><input type="checkbox" [checked]="express()" (change)="express.set($any($event.target).checked)"> express</label>
            <button class="primary" (click)="loadPatterns()">GET /api/csharp/patterns</button>
          </div>
          <p class="small muted">Essaie <code>[]</code>, <code>7</code>, <code>0,4,5</code>, <code>3,8,3</code> pour les list patterns ; FR à 99 € puis 100 € pour les property patterns.</p>
          @if (snippets()['patterns']; as s) { <snippet-table [snippets]="s" /> }
        </div>

        <div class="card">
          <h3>3. Exceptions : filtres <code>when</code>, exception métier, <code>finally</code></h3>
          <p class="small muted">Solde de 100. Découvert toléré jusqu'à 20 via un filtre <code>when (ex.Shortfall &lt;= 20)</code>.</p>
          <div class="row">
            @for (a of amounts; track a) { <button (click)="loadException(a)">retirer {{ a }}</button> }
          </div>
          @if (exception(); as e) {
            <div class="row"><span class="badge" [class.ok]="e.outcome === 'withdrawn' || e.outcome === 'overdraft accepted'" [class.err]="e.outcome === 'refused' || e.outcome === 'invalid amount'">{{ e.outcome }}</span>
              <span class="small muted">solde final : {{ e.balanceAfter }}</span></div>
            <div class="json">
              @for (t of e.trace; track $index) { <div class="fade-in" [class.ok-line]="t.startsWith('finally')">{{ t }}</div> }
            </div>
          }
        </div>

        <div class="card">
          <h3>4. Strings immuables : <code>+=</code> vs <code>StringBuilder</code></h3>
          <div class="row">
            <label class="small">n <input type="number" style="width:100px" [value]="n()" (input)="n.set(+$any($event.target).value)"></label>
            <button class="primary" (click)="loadStrings()">GET /api/csharp/strings</button>
          </div>
          @if (strings(); as s) {
            <div class="row">
              <span class="badge warn">+= : {{ s.concatMs }} ms</span>
              <span class="badge ok">StringBuilder : {{ s.builderMs }} ms</span>
              <span class="small muted">n = {{ s.n }} · {{ ratio(s) }}× plus lent · double n et le += quadruple (O(n²))</span>
            </div>
            <snippet-table [snippets]="s.snippets" />
          }
        </div>

        <div class="card">
          <h3>5. <code>[Flags]</code> enum</h3>
          <div class="row">
            @for (f of flagNames; track f) {
              <label class="small"><input type="checkbox" [checked]="flags().includes(f)" (change)="toggleFlag(f)"> {{ f }}</label>
            }
            <button class="primary" (click)="loadFlags()">GET /api/csharp/flags?permissions={{ flagsQuery() }}</button>
          </div>
          @if (flagsResult(); as f) {
            <div class="row">
              <code>{{ f.name }}</code><span class="badge">valeur {{ f.value }}</span><span class="badge info">bits {{ f.binary }}</span>
              <span class="badge" [class.ok]="f.canWrite">HasFlag(Write) {{ f.canWrite }}</span>
              <span class="badge" [class.ok]="f.canDelete">&amp; Delete {{ f.canDelete }}</span>
              <span class="badge" [class.ok]="f.isAdmin">== Admin {{ f.isAdmin }}</span>
            </div>
          }
        </div>

        <div class="card">
          <h3>6. Syntaxe, records, génériques, interfaces, composition</h3>
          <div class="row">
            <button (click)="loadSnippets('basics')">/basics</button>
            <button (click)="loadSnippets('records')">/records</button>
            <button (click)="loadSnippets('oop')">/oop</button>
          </div>
          @for (d of snippetDemos; track d) {
            @if (snippets()[d]; as s) { <h4 class="small muted">/api/csharp/{{ d }}</h4><snippet-table [snippets]="s" /> }
          }
        </div>
        @if (error()) { <div class="callout err">{{ error() }}</div> }
      </div>
    </lesson-shell>
  `,
  styles: [`.ok-line { color: var(--ok); } label { display: inline-flex; align-items: center; gap: .3rem; }`],
})
export class CSharpFundamentalsLesson {
  readonly lesson = lessonById('csharp-fundamentals')!;
  private readonly http = inject(HttpClient);

  readonly countries = ['FR', 'BE', 'LU', 'US'];
  readonly amounts = [50, 110, 500, -5];
  readonly flagNames = ['Read', 'Write', 'Delete'];
  readonly snippetDemos: SnippetDemo[] = ['basics', 'records', 'oop'];

  readonly copies = signal<CopyScenario[]>([]);
  readonly snippets = signal<Partial<Record<SnippetDemo, Snippet[]>>>({});
  readonly exception = signal<ExceptionDemo | null>(null);
  readonly strings = signal<StringsDemo | null>(null);
  readonly flagsResult = signal<FlagsDemo | null>(null);
  readonly error = signal<string | null>(null);

  readonly numbers = signal('3,8,3');
  readonly country = signal('FR');
  readonly total = signal(99);
  readonly express = signal(false);
  readonly n = signal(5000);
  readonly flags = signal<string[]>(['Read', 'Write']);
  readonly flagsQuery = computed(() => this.flags().join(',') || 'None');

  loadCopy() { this.get<CopyScenario[]>('struct-vs-class', {}, r => this.copies.set(r)); }

  loadSnippets(demo: SnippetDemo, params: Record<string, string> = {}) {
    this.get<Snippet[]>(demo, params, r => this.snippets.update(s => ({ ...s, [demo]: r })));
  }

  loadPatterns() {
    this.loadSnippets('patterns', { numbers: this.numbers(), country: this.country(), total: String(this.total()), express: String(this.express()) });
  }

  loadException(amount: number) { this.get<ExceptionDemo>('exceptions', { amount: String(amount) }, r => this.exception.set(r)); }
  loadStrings() { this.get<StringsDemo>('strings', { n: String(this.n()) }, r => this.strings.set(r)); }
  loadFlags() { this.get<FlagsDemo>('flags', { permissions: this.flagsQuery() }, r => this.flagsResult.set(r)); }

  toggleFlag(flag: string) {
    this.flags.update(f => f.includes(flag) ? f.filter(x => x !== flag) : [...f, flag]);
  }

  ratio(s: StringsDemo) { return Math.round(s.concatMs / Math.max(s.builderMs, 0.001)); }

  private get<T>(path: string, params: Record<string, string>, next: (r: T) => void) {
    this.error.set(null);
    this.http.get<T>(`/api/csharp/${path}`, { params }).subscribe({
      next,
      error: e => this.error.set(`${e.status} — ${e.error?.detail ?? e.message}`),
    });
  }
}
