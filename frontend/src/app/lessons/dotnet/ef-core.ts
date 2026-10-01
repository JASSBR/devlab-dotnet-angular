import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from '../angular/cart.store';

interface Paged { items: Product[]; page: number; pageSize: number; total: number; totalPages: number; }

@Component({
  selector: 'lesson-ef-core',
  imports: [LessonShell, ReactiveFormsModule, CurrencyPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>IQueryable : composer avant d'exécuter</h3>
        <p><code>db.Products.Where(...).OrderBy(...).Skip(...).Take(...)</code> ne touche pas la base : c'est un arbre d'expression.
        <code>ToListAsync()</code> le traduit en <strong>une seule requête SQL</strong> avec <code>WHERE</code>, <code>ORDER BY</code>, <code>LIMIT/OFFSET</code>.
        Change les filtres ci-dessous et regarde les logs du backend : la requête SQL s'adapte.</p>
        <ul>
          <li><code>AsNoTracking()</code> pour la lecture : pas de change tracker, plus rapide.</li>
          <li>Écriture : charger l'entité (trackée), modifier, <code>SaveChangesAsync()</code> → EF calcule l'<code>UPDATE</code>.</li>
          <li><code>ExecuteDeleteAsync()</code> : un <code>DELETE</code> direct, sans charger.</li>
          <li>Les DTOs isolent le contrat API du schéma : on n'expose jamais l'entité.</li>
          <li>Migrations : <code>dotnet ef migrations add Init</code> + <code>dotnet ef database update</code> (ici <code>EnsureCreated</code> pour rester simple).</li>
        </ul>
        <div class="callout">Créer/modifier demande la permission <code>products:write</code> (alice, bob) ; supprimer demande le rôle <code>Admin</code> (alice). Carol peut seulement lire → observe les 401/403.</div>
      </div>

      <div demo class="col">
        <div class="row">
          <input [value]="q()" (input)="q.set($any($event.target).value)" placeholder="recherche (LIKE %q%)">
          <select [value]="category()" (change)="category.set($any($event.target).value)">
            <option value="">toutes catégories</option>
            @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <select [value]="sort()" (change)="sort.set($any($event.target).value)">
            <option value="name">tri : nom</option><option value="price">tri : prix</option>
          </select>
          <button class="sm" (click)="desc.set(!desc())">{{ desc() ? '↓ desc' : '↑ asc' }}</button>
          <span class="badge">{{ data()?.total ?? 0 }} résultats · page {{ page() }}/{{ data()?.totalPages ?? 1 }}</span>
        </div>
        <table>
          <tr><th>#</th><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th></th></tr>
          @for (p of data()?.items ?? []; track p.id) {
            <tr>
              <td class="muted">{{ p.id }}</td><td>{{ p.name }}</td><td><span class="badge">{{ p.category }}</span></td>
              <td>{{ p.price | currency:'EUR' }}</td><td>{{ p.stock }}</td>
              <td class="row"><button class="sm" (click)="edit(p)">✎</button><button class="sm danger" (click)="remove(p.id)">✕</button></td>
            </tr>
          }
        </table>
        <div class="row">
          <button class="sm" (click)="page.set(page() - 1)" [disabled]="page() <= 1">←</button>
          <button class="sm" (click)="page.set(page() + 1)" [disabled]="page() >= (data()?.totalPages ?? 1)">→</button>
          <span class="muted small">Connecté : {{ auth.userName() ?? 'non' }}</span>
          @if (message()) { <span class="badge" [class.ok]="!message()!.startsWith('✗')" [class.err]="message()!.startsWith('✗')">{{ message() }}</span> }
        </div>

        <form class="card row" [formGroup]="form" (ngSubmit)="save()">
          <strong>{{ editingId() ? 'Modifier #' + editingId() : 'Créer' }}</strong>
          <input formControlName="name" placeholder="nom">
          <select formControlName="category"><option>Hardware</option><option>Software</option><option>Training</option><option>Furniture</option></select>
          <input formControlName="price" type="number" step="0.1" placeholder="prix" style="width:100px">
          <input formControlName="stock" type="number" placeholder="stock" style="width:90px">
          <button class="primary sm" type="submit" [disabled]="form.invalid">{{ editingId() ? 'PUT' : 'POST' }}</button>
          @if (editingId()) { <button class="sm" type="button" (click)="cancelEdit()">annuler</button> }
        </form>
      </div>
    </lesson-shell>
  `,
})
export class EfCoreLesson {
  readonly lesson = lessonById('ef-core')!;
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthStore);

  readonly q = signal(''); readonly category = signal(''); readonly sort = signal('name'); readonly desc = signal(false); readonly page = signal(1);
  readonly data = signal<Paged | null>(null);
  readonly categories = signal<string[]>([]);
  readonly message = signal<string | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly params = computed(() => ({ q: this.q(), category: this.category(), sort: this.sort(), desc: String(this.desc()), page: String(this.page()), pageSize: '6' }));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    category: ['Hardware'], price: [10, Validators.min(0.01)], stock: [1, Validators.min(0)],
  });

  constructor() {
    effect(() => this.load(this.params()));   // any filter signal change → reload
    this.http.get<string[]>('/api/products/categories').subscribe({ next: c => this.categories.set(c), error: () => this.categories.set([]) });
  }

  private load(params: Record<string, string>) {
    this.http.get<Paged>('/api/products', { params }).subscribe({ next: d => this.data.set(d), error: () => this.data.set(null) });
  }
  private reload() { this.load(this.params()); }

  edit(p: Product) { this.editingId.set(p.id); this.form.setValue({ name: p.name, category: p.category, price: p.price, stock: p.stock }); }
  cancelEdit() { this.editingId.set(null); this.form.reset(); }

  save() {
    const body = this.form.getRawValue();
    const id = this.editingId();
    const req = id ? this.http.put(`/api/products/${id}`, body) : this.http.post('/api/products', body);
    req.subscribe({
      next: () => { this.message.set(id ? `✓ produit ${id} modifié` : '✓ produit créé (201 + Location)'); this.cancelEdit(); this.reload(); },
      error: e => this.message.set(`✗ ${e.status} — ${e.error?.title ?? Object.values(e.error?.errors ?? {}).flat().join(' ') ?? e.message}`),
    });
  }
  remove(id: number) {
    this.http.delete(`/api/products/${id}`).subscribe({
      next: () => { this.message.set(`✓ produit ${id} supprimé (204)`); this.reload(); },
      error: e => this.message.set(`✗ ${e.status} — ${e.status === 403 ? 'rôle Admin requis' : e.status === 401 ? 'connecte-toi' : e.message}`),
    });
  }
}
