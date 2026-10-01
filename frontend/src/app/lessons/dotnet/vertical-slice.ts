import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { DiagramSlices } from '../../shared/diagrams';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';
import { Product } from '../angular/cart.store';

export interface OrderDto { id: number; customerName: string; productId: number; productName: string; unitPrice: number; quantity: number; total: number; status: string; placedAt: string; }

@Component({
  selector: 'lesson-vertical-slice',
  imports: [LessonShell, DiagramSlices, Json2Pipe, CurrencyPipe, DatePipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Découper par feature, pas par couche</h3>
        <diagram-slices />
        <p>Une <strong>slice</strong> = un cas d'usage (« passer une commande ») avec tout ce qu'il lui faut, côte à côte :
        <code>PlaceOrder.Endpoint.cs</code> (HTTP, mince), <code>PlaceOrder.Handler.cs</code> (la logique métier, lisible de haut en bas),
        <code>PlaceOrder.Validator.cs</code> (la forme de la requête). Pas de MediatR : le handler est une classe injectée et appelée. Pas de repository : le handler parle au <code>DbContext</code>.</p>
        <h3>Result&lt;T&gt; plutôt que des exceptions</h3>
        <p>« Produit introuvable » ou « stock insuffisant » ne sont pas des <em>bugs</em>, ce sont des <em>résultats normaux</em>. Le handler retourne <code>Result&lt;OrderDto&gt;</code> ;
        l'endpoint fait <code>result.Match(created, error.ToProblem())</code>. Chaque <code>Error</code> a un <strong>code stable</strong> (<code>orders.insufficient_stock</code>) : les tests
        et le front s'appuient dessus, pas sur le texte.</p>
        <h3>Découverte automatique</h3>
        <p>Chaque endpoint implémente <code>IApiEndpoint</code> ; <code>MapApiEndpoints(assembly)</code> les trouve par réflexion. Ajouter un cas d'usage = ajouter un dossier. <code>Program.cs</code> ne change pas.</p>
        <div class="callout warn">Le piège des slices : la duplication. Deux slices qui ont besoin de la même règle → elle monte dans <code>Shared/</code> du module. Pas avant.</div>
      </div>

      <div demo class="col">
        @if (!auth.isLoggedIn()) { <div class="callout">Connecte-toi (bob ou alice) : les commandes sont liées à l'utilisateur du token.</div> }
        <div class="card row">
          <strong>POST /api/orders</strong>
          <select [value]="productId()" (change)="productId.set(+$any($event.target).value)">
            @for (p of products(); track p.id) { <option [value]="p.id">#{{ p.id }} {{ p.name }} — stock {{ p.stock }}</option> }
            <option value="9999">#9999 (n'existe pas → 404)</option>
          </select>
          <input type="number" [value]="qty()" (input)="qty.set(+$any($event.target).value)" style="width:90px">
          <button class="primary" (click)="place()" [disabled]="!auth.isLoggedIn()">Commander</button>
          <button class="sm" (click)="qty.set(0)">qty = 0 (→ 400 validator)</button>
          <button class="sm" (click)="productId.set(4); qty.set(1)">produit #4, stock 0 (→ 409)</button>
        </div>
        <pre class="json">{{ result() | json2 }}</pre>
        <div class="card">
          <h3>GET /api/orders — {{ auth.hasRole('Admin') ? 'toutes (Admin)' : 'mes commandes' }}</h3>
          <table>
            <tr><th>#</th><th>client</th><th>produit</th><th>qté</th><th>total</th><th>statut</th><th>quand</th><th></th></tr>
            @for (o of orders(); track o.id) {
              <tr><td>{{ o.id }}</td><td>{{ o.customerName }}</td><td>{{ o.productName }}</td><td>{{ o.quantity }}</td><td>{{ o.total | currency:'EUR' }}</td>
                <td><span class="badge" [class.ok]="o.status === 'Placed'" [class.err]="o.status === 'Cancelled'">{{ o.status }}</span></td>
                <td class="muted small">{{ o.placedAt | date:'HH:mm:ss' }}</td>
                <td><button class="sm" (click)="cancel(o.id)" [disabled]="o.status === 'Cancelled'">annuler</button></td></tr>
            } @empty { <tr><td colspan="8" class="muted">aucune commande</td></tr> }
          </table>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class VerticalSliceLesson {
  readonly lesson = lessonById('vertical-slice')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  readonly products = signal<Product[]>([]);
  readonly orders = signal<OrderDto[]>([]);
  readonly productId = signal(1);
  readonly qty = signal(2);
  readonly result = signal<unknown>(null);

  constructor() { this.refresh(); }

  refresh() {
    this.http.get<{ items: Product[] }>('/api/products', { params: { pageSize: 50 } })
        .subscribe({ next: r => this.products.set(r.items), error: () => this.products.set([]) });
    if (this.auth.isLoggedIn()) this.http.get<OrderDto[]>('/api/orders').subscribe({ next: o => this.orders.set(o), error: () => this.orders.set([]) });
  }
  place() {
    this.http.post<OrderDto>('/api/orders', { productId: this.productId(), quantity: this.qty() }).subscribe({
      next: o => { this.result.set({ status: 201, body: o }); this.refresh(); },
      error: e => this.result.set({ status: e.status, body: e.error }),
    });
  }
  cancel(id: number) {
    this.http.post<OrderDto>(`/api/orders/${id}/cancel`, null).subscribe({
      next: o => { this.result.set({ status: 200, body: o }); this.refresh(); },
      error: e => this.result.set({ status: e.status, body: e.error }),
    });
  }
}
