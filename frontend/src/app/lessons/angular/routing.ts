import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ResolveFn, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from './cart.store';

/** Resolver = data fetched BEFORE the component is created. Returns a value, promise or observable. */
export const productResolver: ResolveFn<Product> = route => {
  const id = route.paramMap.get('id');
  // A resolver that errors CANCELS the navigation — degrade instead, so the lesson still renders.
  return inject(HttpClient).get<Product>(`/api/products/${id}`).pipe(
    catchError(() => of({ id: Number(id), name: `Produit ${id} (API injoignable)`, category: '—', price: 0, stock: 0 })));
};

@Component({
  selector: 'lesson-routing',
  imports: [LessonShell, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Ce qu'il faut retenir</h3>
        <ul>
          <li><code>loadComponent</code> : chaque leçon est un chunk JS séparé, chargé à la première navigation.</li>
          <li><code>withComponentInputBinding()</code> : les paramètres de route, query params, <code>data</code> et résultats de <code>resolve</code> deviennent des <code>input()</code> du composant. Plus besoin d'<code>ActivatedRoute</code> dans 90 % des cas.</li>
          <li><strong>Guards fonctionnels</strong> : <code>canActivate</code> bloque/redirige après le match ; <code>canMatch</code> laisse le routeur essayer la route <em>suivante</em> avec le même chemin → deux composants pour <code>/secret</code> selon le rôle.</li>
          <li><strong>Resolver</strong> : la page attend les données (pas de spinner dans le composant, mais navigation plus lente). À doser.</li>
        </ul>
      </div>

      <div demo>
        <nav class="row tabs">
          <a routerLink="./" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Index</a>
          <a routerLink="product/1" routerLinkActive="active">product/1 (resolver)</a>
          <a routerLink="product/5" routerLinkActive="active">product/5</a>
          <a routerLink="product/999" routerLinkActive="active">product/999 (404 → erreur)</a>
          <a routerLink="secret" routerLinkActive="active">secret (canMatch / canActivate)</a>
        </nav>
        <div class="outlet"><router-outlet /></div>
        <p class="small muted">URL courante : <code>{{ router.url }}</code> · Connecté : {{ auth.userName() ?? 'non' }} · rôles : {{ auth.roles().join(', ') || '—' }}</p>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .tabs a { padding: .35rem .7rem; border-radius: 8px; background: var(--bg-3); color: var(--muted); font-size: .85rem; }
    .tabs a.active { background: var(--brand); color: #fff; }
    .outlet { margin-top: 1rem; padding: 1rem; border: 1px dashed var(--border); border-radius: 10px; min-height: 90px; }
  `],
})
export class RoutingLesson {
  readonly lesson = lessonById('routing')!;
  readonly router = inject(Router);
  readonly auth = inject(AuthStore);
}

@Component({
  selector: 'routing-index',
  imports: [RouterLink],
  template: `
    <p>Route enfant <code>''</code>. Clique un produit : <code>product/:id</code> passe par le <strong>resolver</strong>.</p>
    <div class="row">
      @for (id of [1, 2, 3, 4]; track id) { <a class="btn sm" [routerLink]="['product', id]">Produit #{{ id }}</a> }
    </div>
  `,
})
export class RoutingIndex {}

@Component({
  selector: 'routing-product',
  imports: [CurrencyPipe],
  template: `
    <div class="fade-in">
      <span class="badge brand">id (route param → input) = {{ id() }}</span>
      <span class="badge">source (route data → input) = {{ source() }}</span>
      <h3 style="margin-top:.5rem">{{ product().name }}</h3>
      <p>{{ product().category }} · {{ product().price | currency:'EUR' }} · stock {{ product().stock }}</p>
      <p class="small muted">Le composant a reçu <code>product</code> déjà chargé : aucun appel HTTP ici, c'est le resolver qui a attendu.</p>
    </div>
  `,
})
export class RoutingProduct {
  // Names must match: route param ":id", resolve key "product", data key "source".
  readonly id = input.required<string>();
  readonly product = input.required<Product>();
  readonly source = input<string>();
}

@Component({
  selector: 'routing-admin-secret',
  template: `<div class="callout ok"><strong>🕶️ Zone Admin.</strong> Tu vois ce composant parce que <code>canMatch: [hasRoleMatch('Admin')]</code> a matché en premier.</div>`,
})
export class RoutingAdminSecret {}

@Component({
  selector: 'routing-user-secret',
  template: `<div class="callout"><strong>🙂 Zone utilisateur.</strong> Même URL <code>/secret</code>, autre composant : le <code>canMatch</code> Admin a échoué, le routeur a pris la route suivante (protégée par <code>canActivate: [authGuard]</code>). Non connecté → redirection vers la leçon JWT avec <code>?returnUrl=</code>.</div>`,
})
export class RoutingUserSecret {}
