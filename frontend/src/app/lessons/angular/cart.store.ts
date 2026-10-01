import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, of, pipe, switchMap, tap } from 'rxjs';

export interface Product { id: number; name: string; category: string; price: number; stock: number; }
export interface CartLine { product: Product; qty: number; }

// ─────────────────────────────────────────────────────────────────────────────
// Option A — a hand-written store: a service with a PRIVATE writable signal and
// PUBLIC computed views. Consumers cannot mutate state except through methods.
// This is 80% of what you need, with zero dependency.
// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class WishlistStore {
  private readonly _items = signal<Product[]>([]);

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);
  readonly total = computed(() => this._items().reduce((sum, p) => sum + p.price, 0));

  toggle(product: Product) {
    this._items.update(items =>
      items.some(p => p.id === product.id) ? items.filter(p => p.id !== product.id) : [...items, product]);
  }
  has = (id: number) => computed(() => this._items().some(p => p.id === id));
  clear() { this._items.set([]); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Option B — NgRx SignalStore: the same idea, declarative. withState / withComputed /
// withMethods compose features; patchState is the only way to write; rxMethod bridges
// RxJS (HTTP) into the store with automatic subscription management.
// ─────────────────────────────────────────────────────────────────────────────
interface CartState {
  products: Product[];
  lines: CartLine[];
  loading: boolean;
  category: string | null;
}

export const CartStore = signalStore(
  { providedIn: 'root' },
  withState<CartState>({ products: [], lines: [], loading: false, category: null }),
  withComputed(({ lines, products, category }) => ({
    itemCount: computed(() => lines().reduce((n, l) => n + l.qty, 0)),
    total: computed(() => lines().reduce((sum, l) => sum + l.qty * l.product.price, 0)),
    visibleProducts: computed(() => category() ? products().filter(p => p.category === category()) : products()),
    categories: computed(() => [...new Set(products().map(p => p.category))]),
  })),
  withMethods((store, http = inject(HttpClient)) => ({
    add(product: Product) {
      const lines = store.lines();
      const existing = lines.find(l => l.product.id === product.id);
      patchState(store, {
        lines: existing
          ? lines.map(l => l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l)
          : [...lines, { product, qty: 1 }],
      });
    },
    remove(productId: number) {
      patchState(store, { lines: store.lines().filter(l => l.product.id !== productId) });
    },
    setCategory(category: string | null) { patchState(store, { category }); },
    clear() { patchState(store, { lines: [] }); },

    // rxMethod: accepts a value, a signal or an observable; re-runs when the input changes.
    load: rxMethod<void>(pipe(
      tap(() => patchState(store, { loading: true })),
      // catchError INSIDE switchMap: an error must not kill the outer rxMethod stream.
      switchMap(() => http.get<{ items: Product[] }>('/api/products', { params: { pageSize: 50 } }).pipe(
        catchError(() => of({ items: [] as Product[] })))),
      tap(res => patchState(store, { products: res.items, loading: false })),
    )),
  })),
);
