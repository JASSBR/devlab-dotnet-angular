import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { DiagramModules } from '../../shared/diagrams';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from '../angular/cart.store';
import { OrderDto } from './vertical-slice';

interface Step { label: string; detail: string; ok: boolean; }

@Component({
  selector: 'lesson-modular-monolith',
  imports: [LessonShell, DiagramModules],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Un déploiement, des frontières</h3>
        <diagram-modules />
        <p>Un <strong>module</strong> possède ses données (ici : son propre <code>DbContext</code> et son propre fichier SQLite), ses endpoints, ses services.
        Il expose un <strong>PublicApi</strong> minuscule : une interface (<code>IProductCatalog</code>) et des événements (<code>OrderPlaced</code>). Tout le reste est <code>internal</code>.</p>
        <ol class="steps">
          <li><strong>Appel synchrone via interface</strong> : Orders a besoin du prix et du stock → <code>IProductCatalog.FindAsync</code>. Il ne voit jamais l'entité <code>Product</code> ni <code>AppDbContext</code>.</li>
          <li><strong>Réaction asynchrone via événement</strong> : Orders publie <code>OrderPlaced</code> <em>après</em> avoir persisté. Products écoute et décrémente le stock. Orders ignore que Products écoute. Demain, un module Shipping s'abonne sans toucher Orders.</li>
          <li><strong>Frontière testée</strong> : <code>ModuleBoundariesTests</code> (NetArchTest) échoue si un type de Orders référence un type interne de Products. Dans une solution multi-projets, c'est le compilateur qui le fait ; ici c'est un test.</li>
        </ol>
        <div class="callout">Pourquoi pas des microservices tout de suite ? Parce que 90 % des projets n'en ont pas besoin, et que le coût (réseau, cohérence, observabilité, déploiement) est énorme. Le monolithe modulaire donne les <em>frontières</em> sans le <em>réseau</em>. Le jour où un module doit scaler seul, on le sort : ses seules dépendances sont déjà des interfaces et des événements.</div>
        <p class="small muted">Limite honnête : l'<code>InProcessEventBus</code> appelle les handlers dans la même requête, sans transaction commune ni retry. En production : <strong>outbox pattern</strong> (l'événement est écrit en base avec la commande, puis dispatché par un job) — c'est la question d'entretien classique qui suit.</p>
      </div>

      <div demo class="col">
        @if (!auth.isLoggedIn()) { <div class="callout">Connecte-toi pour commander.</div> }
        <div class="row">
          <button class="primary" (click)="run()" [disabled]="!auth.isLoggedIn() || running()">Scénario : commander 1 × produit #2 et observer les deux modules</button>
          <span class="badge">stock #2 : {{ stock() ?? '…' }}</span>
        </div>
        <ol class="steps">
          @for (s of steps(); track $index) {
            <li class="fade-in"><strong>{{ s.label }}</strong> <span class="badge" [class.ok]="s.ok" [class.err]="!s.ok">{{ s.ok ? '✓' : '✗' }}</span><br><span class="muted small mono">{{ s.detail }}</span></li>
          }
        </ol>
        <p class="small muted">Regarde aussi les logs du backend : <code>Event OrderPlaced → 1 handler(s)</code> puis <code>stock of product 2 decremented</code>.</p>
      </div>
    </lesson-shell>
  `,
})
export class ModularMonolithLesson {
  readonly lesson = lessonById('modular-monolith')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  readonly steps = signal<Step[]>([]);
  readonly stock = signal<number | null>(null);
  readonly running = signal(false);

  constructor() { this.readStock(); }

  private readStock() { this.http.get<Product>('/api/products/2').subscribe({ next: p => this.stock.set(p.stock), error: () => this.stock.set(null) }); }

  async run() {
    this.running.set(true); this.steps.set([]);
    const push = (s: Step) => this.steps.update(l => [...l, s]);
    try {
      const before = await this.get<Product>('/api/products/2');
      push({ label: 'Products.PublicApi → IProductCatalog.FindAsync(2)', detail: `${before.name}, prix ${before.price}, stock ${before.stock}`, ok: true });

      const order = await new Promise<OrderDto>((res, rej) => this.http.post<OrderDto>('/api/orders', { productId: 2, quantity: 1 }).subscribe({ next: res, error: rej }));
      push({ label: 'Orders : PlaceOrderHandler → SaveChanges (orders.db)', detail: `commande #${order.id}, total ${order.total} €, statut ${order.status}`, ok: true });
      push({ label: 'Orders publie OrderPlaced(orderId, productId, qty)', detail: 'InProcessEventBus → handlers résolus dans le scope courant', ok: true });

      const after = await this.get<Product>('/api/products/2');
      const decremented = after.stock === before.stock - 1;
      push({ label: 'Products.OrderPlacedHandler → ExecuteUpdate stock − 1 (devlab.db)', detail: `stock ${before.stock} → ${after.stock}`, ok: decremented });
      this.stock.set(after.stock);

      const cancelled = await new Promise<OrderDto>((res, rej) => this.http.post<OrderDto>(`/api/orders/${order.id}/cancel`, null).subscribe({ next: res, error: rej }));
      const restored = await this.get<Product>('/api/products/2');
      push({ label: 'Annulation → OrderCancelled → Products restocke', detail: `commande #${cancelled.id} ${cancelled.status}, stock ${after.stock} → ${restored.stock}`, ok: restored.stock === before.stock });
      this.stock.set(restored.stock);
    } catch (e: unknown) {
      const err = e as { status?: number; error?: { title?: string } };
      push({ label: 'Échec', detail: `${err.status} ${err.error?.title ?? ''}`, ok: false });
    } finally { this.running.set(false); }
  }

  private get<T>(url: string) { return new Promise<T>((res, rej) => this.http.get<T>(url).subscribe({ next: res, error: rej })); }
}
