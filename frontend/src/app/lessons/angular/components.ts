import { CurrencyPipe } from '@angular/common';
import { Component, Directive, computed, input, model, output, signal, viewChild } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from './cart.store';

/** Reusable behaviour attached via hostDirectives (composition instead of inheritance). */
@Directive({
  selector: '[glow]',
  host: { '[style.boxShadow]': 'active() ? "0 0 0 3px #7c5cff66" : "none"', '(mouseenter)': 'active.set(true)', '(mouseleave)': 'active.set(false)' },
})
export class Glow { readonly active = signal(false); }

@Component({
  selector: 'product-card',
  imports: [CurrencyPipe],
  hostDirectives: [Glow],
  host: { class: 'card', '[class.selected]': 'selected()' },
  template: `
    <div class="row" style="justify-content: space-between">
      <strong>{{ product().name }}</strong>
      <span class="badge">{{ product().category }}</span>
    </div>
    <p class="muted small">{{ product().price | currency:'EUR' }} · <ng-content select="[stock]">stock inconnu</ng-content></p>
    <div class="row">
      <button class="sm" (click)="qty.set(qty() - 1)" [disabled]="qty() <= 0">−</button>
      <span class="mono">{{ qty() }}</span>
      <button class="sm" (click)="qty.set(qty() + 1)">+</button>
      <button class="sm primary" (click)="added.emit({ product: product(), qty: qty() })" [disabled]="qty() === 0">Ajouter</button>
      <button class="sm" (click)="selected.set(!selected())">{{ selected() ? 'Désélectionner' : 'Sélectionner' }}</button>
    </div>
    <ng-content />
  `,
  styles: [`:host { display: block; transition: box-shadow .15s; } :host.selected { border-color: var(--brand); }`],
})
export class ProductCard {
  readonly product = input.required<Product>();          // required input → compile error if missing
  readonly qty = model(1);                                // two-way: [(qty)]
  readonly selected = model(false);
  readonly added = output<{ product: Product; qty: number }>();
  readonly subtotal = computed(() => this.qty() * this.product().price);
  reset() { this.qty.set(1); this.selected.set(false); }  // callable from the parent through viewChild()
}

@Component({
  selector: 'lesson-components',
  imports: [LessonShell, ProductCard, CurrencyPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>L'API signal des composants</h3>
        <ul>
          <li><code>input()</code> / <code>input.required()</code> : les entrées sont des signals, donc utilisables dans <code>computed</code>.</li>
          <li><code>model()</code> : entrée + sortie combinées → <code>[(qty)]</code> two-way binding sans écrire <code>qtyChange</code>.</li>
          <li><code>output()</code> : émet un événement typé, sans <code>EventEmitter</code>.</li>
          <li><code>viewChild()</code> : référence signal vers un enfant — le parent appelle <code>card.reset()</code>.</li>
          <li><code>ng-content select="[stock]"</code> : projection nommée avec contenu par défaut.</li>
          <li><code>hostDirectives</code> : la carte « hérite » du comportement <code>Glow</code> par composition.</li>
          <li><code>host: &#123;&#125;</code> : bindings sur l'élément hôte, sans décorateurs <code>&#64;HostBinding</code>.</li>
        </ul>
      </div>

      <div demo class="col">
        <div class="row">
          <span class="badge brand">qty (parent) = {{ qty() }}</span>
          <span class="badge">selected (parent) = {{ selected() }}</span>
          <button class="sm" (click)="card().reset()">card().reset() via viewChild</button>
          <button class="sm" (click)="qty.set(5)">parent → qty = 5</button>
        </div>
        <div class="grid-2">
          <product-card [product]="product" [(qty)]="qty" [(selected)]="selected" (added)="onAdded($event)">
            <span stock>{{ product.stock }} en stock (projeté par le parent)</span>
            <p class="small muted">Contenu par défaut projeté ici.</p>
          </product-card>
          <div class="card">
            <h3>Événements reçus (output)</h3>
            @for (e of events(); track $index) { <div class="mono small">+ {{ e.qty }} × {{ e.product.name }} = {{ e.qty * e.product.price | currency:'EUR' }}</div> }
            @empty { <span class="muted small">clique « Ajouter »</span> }
          </div>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class ComponentsLesson {
  readonly lesson = lessonById('components')!;
  readonly product: Product = { id: 1, name: 'Clavier mécanique', category: 'Hardware', price: 129.9, stock: 12 };
  readonly qty = signal(1);
  readonly selected = signal(false);
  readonly card = viewChild.required(ProductCard);
  readonly events = signal<{ product: Product; qty: number }[]>([]);
  onAdded(e: { product: Product; qty: number }) { this.events.update(list => [e, ...list]); }
}
