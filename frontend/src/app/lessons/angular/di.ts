import { Component, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

// ── 1. InjectionToken: inject a VALUE (config, function) not a class ─────────
export const LOG_PREFIX = new InjectionToken<string>('LOG_PREFIX', { providedIn: 'root', factory: () => '[root]' });

// ── 2. Multi-provider: many providers for one token → injected as an array ────
export const PRICE_RULES = new InjectionToken<((price: number) => number)[]>('PRICE_RULES');

// ── 3. A service with providedIn: 'root' = app-wide singleton, tree-shakable ──
@Injectable({ providedIn: 'root' })
export class Logger {
  private static seq = 0;
  readonly id = ++Logger.seq;
  readonly prefix = inject(LOG_PREFIX);
  readonly lines = signal<string[]>([]);
  log(msg: string) { this.lines.update(l => [`${this.prefix} #${this.id}: ${msg}`, ...l].slice(0, 6)); }
}

// ── 4. A NON-root service: whoever provides it decides its lifetime ───────────
@Injectable()
export class Counter {
  private static seq = 0;
  readonly id = ++Counter.seq;
  readonly value = signal(0);
}

@Component({
  selector: 'di-child',
  template: `
    <div class="box">
      <div class="small muted">{{ label }}</div>
      <div>Counter instance <span class="badge brand">#{{ counter.id }}</span> · Logger <span class="badge">#{{ logger.id }} {{ logger.prefix }}</span></div>
      <div class="row"><button class="sm" (click)="counter.value.update(v => v + 1); logger.log(label + ' +1')">+1</button> <strong>{{ counter.value() }}</strong></div>
    </div>
  `,
  styles: [`.box { border: 1px dashed var(--border); border-radius: 10px; padding: .6rem .8rem; }`],
})
export class DiChild {
  readonly counter = inject(Counter);
  readonly logger = inject(Logger);
  label = '';
  constructor() { this.label = inject(LOG_PREFIX) + ' child'; }
}

// Component-level providers: a NEW Counter for this subtree, a different LOG_PREFIX.
@Component({
  selector: 'di-island',
  imports: [DiChild],
  providers: [Counter, { provide: LOG_PREFIX, useValue: '[island]' }],
  template: `<di-child /><di-child />`,
  styles: [`:host { display: grid; gap: .5rem; }`],
})
export class DiIsland {}

@Component({
  selector: 'lesson-di',
  imports: [LessonShell, DiChild, DiIsland],
  providers: [
    Counter,                                                           // one Counter shared by this lesson's subtree
    { provide: PRICE_RULES, useFactory: () => (p: number) => p * 1.2, multi: true },   // TVA
    { provide: PRICE_RULES, useFactory: () => (p: number) => Math.round(p * 100) / 100, multi: true },
  ],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>L'injecteur est un arbre</h3>
        <p>Chaque composant peut déclarer des <code>providers</code> : ils créent un <strong>injecteur enfant</strong>. Quand un composant fait
        <code>inject(X)</code>, Angular remonte l'arbre jusqu'à trouver un provider. <code>providedIn: 'root'</code> = fournit à la racine,
        une seule instance pour l'app, et le service disparaît du bundle s'il n'est jamais injecté.</p>
        <ul>
          <li><code>inject()</code> remplace l'injection par constructeur : utilisable dans les fonctions (guards, interceptors, resolvers).</li>
          <li><code>InjectionToken</code> pour injecter une valeur (config, URL d'API, fonction).</li>
          <li><code>multi: true</code> : plusieurs providers, injectés comme un tableau (pipelines de règles, interceptors HTTP fonctionnent ainsi).</li>
          <li><code>useValue / useClass / useFactory / useExisting</code> : quatre façons de dire « comment fabriquer ».</li>
        </ul>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>Hiérarchie</h3>
          <p class="small muted">La leçon fournit <code>Counter</code> → les deux enfants directs partagent l'instance. <code>di-island</code> refournit <code>Counter</code> et <code>LOG_PREFIX</code> → ses enfants ont leur propre compteur et un autre préfixe. <code>Logger</code> est root : même #id partout.</p>
          <div class="grid-2">
            <div class="col"><di-child /><di-child /></div>
            <di-island />
          </div>
        </div>
        <div class="card">
          <h3>Multi-provider : PRICE_RULES = {{ rules.length }} règles appliquées en chaîne</h3>
          <div class="row"><input type="number" [value]="price()" (input)="price.set(+$any($event.target).value)"> → <strong>{{ apply(price()) }} €</strong></div>
        </div>
        <div class="card">
          <h3>Logger (root singleton)</h3>
          @for (l of logger.lines(); track $index) { <div class="mono small">{{ l }}</div> } @empty { <span class="muted small">clique sur +1</span> }
        </div>
      </div>
    </lesson-shell>
  `,
})
export class DiLesson {
  readonly lesson = lessonById('di')!;
  readonly logger = inject(Logger);
  readonly rules = inject(PRICE_RULES);
  readonly price = signal(100);
  apply = (p: number) => this.rules.reduce((acc, rule) => rule(acc), p);
}
