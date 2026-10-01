import { CurrencyPipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, of, startWith, switchMap, tap } from 'rxjs';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from './cart.store';

interface Paged { items: Product[]; total: number; }

@Component({
  selector: 'lesson-rxjs-http',
  imports: [LessonShell, ReactiveFormsModule, CurrencyPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Quand RxJS, quand signals ?</h3>
        <p><strong>Signals</strong> = état synchrone et dérivations. <strong>RxJS</strong> = flux d'événements dans le temps
        (frappe clavier, WebSocket, retry, annulation). Le typeahead est LE cas d'école RxJS : on veut
        <em>attendre</em> (<code>debounceTime</code>), <em>ignorer les doublons</em> (<code>distinctUntilChanged</code>) et
        <em>annuler la requête précédente</em> (<code>switchMap</code>). Puis on convertit en signal avec <code>toSignal</code> pour le template.</p>
        <h3>httpResource (Angular 19.2+)</h3>
        <p>Pour un simple « GET qui dépend d'un signal », <code>httpResource</code> fait tout : refetch quand la dépendance change,
        annulation de l'ancienne requête, <code>value()</code>, <code>isLoading()</code>, <code>error()</code>, <code>reload()</code>.
        Il expose un signal, pas un observable.</p>
        <div class="callout warn">Ouvre le panneau <strong>Réseau</strong> et tape vite : tu verras beaucoup moins de requêtes que de frappes. C'est le debounce + switchMap.</div>
      </div>

      <div demo class="grid-2">
        <div class="card">
          <h3>A · RxJS pipeline + toSignal</h3>
          <input [formControl]="query" placeholder="Cherche un produit (form, écran, …)" autocomplete="off">
          <p class="small muted">frappes : {{ keystrokes() }} · requêtes : {{ requests() }} @if (searching()) { · <span class="pulse">recherche…</span> }</p>
          <ul>
            @for (p of results(); track p.id) {
              <li>{{ p.name }} <span class="muted">— {{ p.price | currency:'EUR' }}</span></li>
            } @empty { <li class="muted">aucun résultat</li> }
          </ul>
        </div>

        <div class="card">
          <h3>B · httpResource</h3>
          <div class="row">
            <select [value]="category()" (change)="category.set($any($event.target).value)">
              <option value="">Toutes catégories</option>
              @for (c of categories.value() ?? []; track c) { <option [value]="c">{{ c }}</option> }
            </select>
            <button class="sm" (click)="products.reload()">reload()</button>
            <span class="badge" [class.ok]="products.status() === 'resolved'" [class.warn]="products.isLoading()">status = {{ products.status() }}</span>
          </div>
          @if (products.error(); as err) { <p class="badge err">{{ err }}</p> }
          <ul>
            @for (p of products.value()?.items ?? []; track p.id) {
              <li>{{ p.name }} <span class="badge">{{ p.category }}</span></li>
            }
          </ul>
          <p class="small muted">total côté serveur : {{ products.value()?.total ?? '…' }}</p>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class RxjsHttpLesson {
  readonly lesson = lessonById('rxjs-http')!;
  private readonly http = inject(HttpClient);

  // ── A. RxJS ─────────────────────────────────────────────────────────────
  readonly query = new FormControl('', { nonNullable: true });
  readonly keystrokes = signal(0);
  readonly requests = signal(0);
  readonly searching = signal(false);

  readonly results = toSignal(
    this.query.valueChanges.pipe(
      tap(() => this.keystrokes.update(n => n + 1)),
      debounceTime(300),                 // wait for the user to pause
      map(q => q.trim()),
      distinctUntilChanged(),            // same text as before → nothing to do
      startWith(''),
      switchMap(q => {                   // new value → cancel the in-flight request
        this.searching.set(true); this.requests.update(n => n + 1);
        return this.http.get<Paged>('/api/products', { params: { q, pageSize: 8 } }).pipe(
          map(r => r.items),
          catchError(() => of([] as Product[])),
          finalize(() => this.searching.set(false)),
        );
      }),
    ),
    { initialValue: [] as Product[] },
  );

  // ── B. httpResource ─────────────────────────────────────────────────────
  readonly category = signal('');
  readonly categories = httpResource<string[]>(() => '/api/products/categories');
  readonly products = httpResource<Paged>(() => ({
    url: '/api/products',
    params: { category: this.category(), pageSize: 6 },   // reading category() makes the resource depend on it
  }));

  readonly count = computed(() => this.products.value()?.items.length ?? 0);
}
