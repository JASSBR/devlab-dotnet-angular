import { Component, Directive, Pipe, PipeTransform, TemplateRef, ViewContainerRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

/**
 * Structural directive: decides whether a template is rendered. Uses the real
 * AuthStore → re-evaluates automatically when roles change (effect + signals).
 * Usage: <div *hasRole="'Admin'">…</div>
 */
@Directive({ selector: '[hasRole]' })
export class HasRole {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthStore);
  readonly hasRole = input.required<string>();

  constructor() {
    effect(() => {
      const allowed = this.auth.hasRole(this.hasRole());
      this.vcr.clear();
      if (allowed) this.vcr.createEmbeddedView(this.tpl);
    });
  }
}

/** Attribute directive with host bindings/listeners — no DOM access by hand. */
@Directive({
  selector: '[tooltip]',
  host: {
    '[attr.title]': 'tooltip()',
    '[style.cursor]': '"help"',
    '[style.borderBottom]': '"1px dotted var(--brand-2)"',
    '(click)': 'clicks.set(clicks() + 1)',
  },
})
export class Tooltip {
  readonly tooltip = input.required<string>();
  readonly clicks = signal(0);
}

/** Pure pipe (default): re-runs only when the INPUT REFERENCE changes. Cheap. */
@Pipe({ name: 'priceFr' })
export class PriceFrPipe implements PipeTransform {
  transform(value: number, currency = '€'): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(value) + ' ' + currency;
  }
}

/** Impure pipe: re-runs on EVERY change detection. Use sparingly (here: relative time). */
@Pipe({ name: 'elapsed', pure: false })
export class ElapsedPipe implements PipeTransform {
  transform(since: number): string { return `${Math.round((Date.now() - since) / 1000)} s`; }
}

@Component({
  selector: 'lesson-directives-pipes',
  imports: [LessonShell, HasRole, Tooltip, PriceFrPipe, ElapsedPipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Directives</h3>
        <p>Une <strong>directive d'attribut</strong> modifie le comportement/apparence d'un élément existant (<code>[tooltip]</code>).
        Une <strong>directive structurelle</strong> reçoit un <code>TemplateRef</code> et décide de l'instancier ou non dans un
        <code>ViewContainerRef</code> (<code>*hasRole</code>). Le <code>*</code> est du sucre pour <code>&lt;ng-template&gt;</code>.</p>
        <h3>Pipes</h3>
        <p>Un pipe pur (défaut) est mémoïsé sur la référence d'entrée : parfait pour formater. Un pipe impur tourne à chaque
        détection de changement — utile pour « il y a X s », dangereux pour du lourd.</p>
        <div class="callout">Le <code>*hasRole</code> ci-dessous lit le <code>AuthStore</code> : connecte-toi en <code>alice</code> (Admin) puis <code>bob</code> pour voir le DOM changer sans recharger.</div>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>*hasRole (structurelle)</h3>
          <div class="row">
            <button class="sm" (click)="auth.login('alice', 'alice123').subscribe()">Login alice (Admin)</button>
            <button class="sm" (click)="auth.login('bob', 'bob123').subscribe()">Login bob (User)</button>
            <button class="sm" (click)="auth.logout()">Logout</button>
            <span class="badge">rôles : {{ auth.roles().join(', ') || '—' }}</span>
          </div>
          <div *hasRole="'Admin'" class="callout ok">🛡️ Bloc Admin — rendu par *hasRole="'Admin'"</div>
          <div *hasRole="'User'" class="callout">🙂 Bloc User — rendu par *hasRole="'User'"</div>
        </div>
        <div class="card">
          <h3>[tooltip] (attribut) + pipes</h3>
          <p>Survole <span tooltip="Je suis un attribut title posé par la directive">ce mot</span> (clics : {{ tip().clicks() }}).</p>
          <p>Prix : {{ 1234.5 | priceFr }} · {{ 99 | priceFr:'$' }} · Page ouverte depuis {{ openedAt | elapsed }} (pipe impur — se met à jour à chaque rendu, ex. au clic).</p>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class DirectivesPipesLesson {
  readonly lesson = lessonById('directives-pipes')!;
  readonly auth = inject(AuthStore);
  readonly openedAt = Date.now();
  readonly tip = viewChild.required(Tooltip);   // query a directive instance, not only components
}
