import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { CartStore, WishlistStore } from './cart.store';

@Component({
  selector: 'lesson-signals-state',
  imports: [LessonShell, CurrencyPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le modèle mental</h3>
        <p>Un <code>signal</code> est une boîte qui contient une valeur et qui sait <em>qui la lit</em>. Un <code>computed</code>
        est une valeur dérivée, recalculée paresseusement et mise en cache. Un <code>effect</code> est un effet de bord
        (log, localStorage, DOM) qui se rejoue quand une dépendance change. Aucun d'eux ne demande de <code>subscribe</code> ni d'<code>unsubscribe</code>.</p>
        <h3>Trois niveaux de gestion d'état</h3>
        <ol class="steps">
          <li><strong>Local</strong> : des signals dans le composant (compteur ci-dessous).</li>
          <li><strong>Partagé, maison</strong> : un service <code>providedIn: 'root'</code> avec un signal privé + des <code>computed</code> publics (<code>WishlistStore</code>).</li>
          <li><strong>Partagé, structuré</strong> : <code>@ngrx/signals</code> — <code>signalStore</code>, <code>patchState</code>, <code>rxMethod</code> pour l'async (<code>CartStore</code>, chargé depuis l'API).</li>
        </ol>
        <div class="callout">Règle d'or : <strong>l'état est un signal, la vue est un computed, l'async est un effet ou un rxMethod.</strong> Pas de <code>BehaviorSubject</code> nécessaire pour l'état synchrone.</div>
      </div>

      <div demo class="col">
        <!-- 1. Local signals -->
        <div class="card">
          <h3>1 · signal / computed / effect / linkedSignal</h3>
          <div class="row">
            <button (click)="count.update(c => c - 1)">−</button>
            <strong class="mono">count = {{ count() }}</strong>
            <button (click)="count.update(c => c + 1)">+</button>
            <span class="badge">double = {{ double() }}</span>
            <span class="badge" [class.ok]="isEven()">{{ isEven() ? 'pair' : 'impair' }}</span>
          </div>
          <p class="small muted">Le <code>effect()</code> a écrit {{ effectRuns() }} fois dans le journal (ouvre la console). Le computed <code>double</code> n'est recalculé que si <code>count</code> change et que quelqu'un le lit.</p>
          <div class="row">
            <label>Catégorie (linkedSignal se réinitialise quand la liste change) :</label>
            <select [value]="selected()" (change)="selected.set($any($event.target).value)">
              @for (c of cart.categories(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
            <span class="badge brand">selected = {{ selected() }}</span>
          </div>
        </div>

        <!-- 2. NgRx SignalStore -->
        <div class="card">
          <h3>2 · CartStore (NgRx SignalStore) — produits chargés via <code>rxMethod</code></h3>
          <div class="row">
            <button class="sm" [class.primary]="!cart.category()" (click)="cart.setCategory(null)">Tous</button>
            @for (c of cart.categories(); track c) {
              <button class="sm" [class.primary]="cart.category() === c" (click)="cart.setCategory(c)">{{ c }}</button>
            }
            @if (cart.loading()) { <span class="badge pulse">chargement…</span> }
          </div>
          <div class="products">
            @for (p of cart.visibleProducts(); track p.id) {
              <div class="product">
                <div><strong>{{ p.name }}</strong><br><span class="muted small">{{ p.price | currency:'EUR' }}</span></div>
                <div class="row">
                  <button class="sm" (click)="wishlist.toggle(p)" [class.primary]="wishlist.has(p.id)()">♥</button>
                  <button class="sm" (click)="cart.add(p)">+ panier</button>
                </div>
              </div>
            }
          </div>
          <div class="row totals">
            <span class="badge brand">{{ cart.itemCount() }} article(s)</span>
            <span class="badge ok">total {{ cart.total() | currency:'EUR' }}</span>
            <span class="badge angular">♥ wishlist {{ wishlist.count() }} · {{ wishlist.total() | currency:'EUR' }}</span>
            <button class="sm" (click)="cart.clear(); wishlist.clear()">Vider</button>
          </div>
          @for (l of cart.lines(); track l.product.id) {
            <div class="line"><span>{{ l.qty }} × {{ l.product.name }}</span><button class="sm danger" (click)="cart.remove(l.product.id)">retirer</button></div>
          }
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .products { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .5rem; margin: .75rem 0; }
    .product { display: flex; justify-content: space-between; align-items: center; gap: .5rem; background: var(--bg-3); border-radius: 10px; padding: .6rem .8rem; }
    .line { display: flex; justify-content: space-between; padding: .3rem 0; border-top: 1px solid var(--border); }
    .totals { margin: .5rem 0; }
  `],
})
export class SignalsStateLesson {
  readonly lesson = lessonById('signals-state')!;
  readonly cart = inject(CartStore);
  readonly wishlist = inject(WishlistStore);

  // ── local state ──────────────────────────────────────────────────────────
  readonly count = signal(0);
  readonly double = computed(() => this.count() * 2);
  readonly isEven = computed(() => this.count() % 2 === 0);
  readonly effectRuns = signal(0);

  // linkedSignal: writable, but RESETS to the computation when its source changes.
  readonly selected = linkedSignal(() => this.cart.categories()[0] ?? '');

  constructor() {
    effect(() => {
      console.log('[effect] count is now', this.count());
      // untracked: read another signal without making it a dependency of this effect.
      untracked(() => this.effectRuns.update(n => n + 1));
    });
    this.cart.load();
  }
}
