import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { forkJoin, map, of, catchError } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

interface Check { policy: string; url: string; rule: string; status?: number; }

@Component({
  selector: 'lesson-authorization',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Authentification ≠ Autorisation</h3>
        <p>L'authentification produit un <code>ClaimsPrincipal</code>. L'autorisation répond « peut-il faire ça ? » à partir des <strong>claims</strong>.
        Une <strong>policy</strong> est une liste de <em>requirements</em> ; chaque requirement est évalué par un ou plusieurs <em>handlers</em>. Si un handler
        appelle <code>Succeed</code>, c'est bon ; sinon → 403 (ou 401 si pas authentifié du tout).</p>
        <table>
          <tr><th>Policy</th><th>Règle</th><th>Quand l'utiliser</th></tr>
          <tr><td>AdminOnly</td><td><code>RequireRole("Admin")</code></td><td>rôles simples</td></tr>
          <tr><td>CanWriteProducts</td><td><code>RequireClaim("permission", "products:write")</code></td><td>permissions fines, découplées des rôles</td></tr>
          <tr><td>Adult</td><td><code>MinimumAgeRequirement(18)</code> + handler</td><td>logique custom réutilisable</td></tr>
          <tr><td>ServiceOrAdmin</td><td><code>RequireAssertion(ctx => …)</code></td><td>lambda rapide</td></tr>
          <tr><td>DocumentOwner</td><td><code>IAuthorizationService.AuthorizeAsync(user, doc, policy)</code></td><td>la décision dépend de la <strong>ressource</strong></td></tr>
        </table>
        <div class="callout" style="margin-top:.75rem"><strong>Multi-schemes :</strong> le scheme par défaut <code>Smart</code> regarde la requête (<code>X-Api-Key</code> ? <code>Bearer</code> ? sinon cookie) et délègue. Les policies ne savent même pas d'où viennent les claims. Teste la matrice avec un JWT (alice/bob/carol) <em>ou</em> une API key.</div>
      </div>

      <div demo class="col">
        <div class="row">
          <span class="badge">identité JWT : {{ auth.userName() ?? 'anonyme' }} {{ auth.roles().length ? '(' + auth.roles().join(', ') + ')' : '' }}</span>
          <button class="sm" (click)="auth.login('alice', 'alice123').subscribe(() => run())">alice</button>
          <button class="sm" (click)="auth.login('bob', 'bob123').subscribe(() => run())">bob</button>
          <button class="sm" (click)="auth.login('carol', 'carol123').subscribe(() => run())">carol</button>
          <button class="sm" (click)="auth.logout(); run()">anonyme</button>
          <input [value]="apiKey()" (input)="apiKey.set($any($event.target).value)" placeholder="ou X-Api-Key" style="width:160px">
          <button class="primary sm" (click)="run()">Tester la matrice</button>
        </div>
        <table>
          <tr><th>policy</th><th>règle</th><th>résultat</th></tr>
          @for (c of checks(); track c.policy) {
            <tr><td><code>{{ c.policy }}</code></td><td class="muted small">{{ c.rule }}</td>
              <td><span class="badge" [class.ok]="c.status === 200" [class.err]="c.status === 403" [class.warn]="c.status === 401">{{ c.status ?? '…' }} {{ c.status === 200 ? 'autorisé' : c.status === 403 ? 'interdit' : c.status === 401 ? 'non authentifié' : '' }}</span></td></tr>
          }
        </table>
        <div class="card">
          <h3>Resource-based : GET /api/authz/documents/:id</h3>
          <div class="row">
            @for (d of [1, 2, 3]; track d) { <button class="sm" (click)="doc(d)">document {{ d }}</button> }
            <span class="muted small">1 = alice, 2 = bob, 3 = carol. Admin voit tout.</span>
          </div>
          <pre class="json">{{ docResult() | json2 }}</pre>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class AuthorizationLesson {
  readonly lesson = lessonById('authorization')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  readonly apiKey = signal('');
  readonly docResult = signal<unknown>(null);
  readonly checks = signal<Check[]>([
    { policy: 'AdminOnly', url: '/api/authz/admin', rule: 'rôle Admin' },
    { policy: 'CanWriteProducts', url: '/api/authz/write', rule: 'claim permission=products:write' },
    { policy: 'Adult', url: '/api/authz/adult', rule: 'claim age ≥ 18 (requirement custom)' },
    { policy: 'ServiceOrAdmin', url: '/api/authz/service', rule: 'assertion : rôle Service ou Admin' },
  ]);

  constructor() { this.run(); }

  private headers(): Record<string, string> { return this.apiKey() ? { 'X-Api-Key': this.apiKey() } : {}; }

  run() {
    const calls = this.checks().map(c => this.http.get(c.url, { headers: this.headers() }).pipe(
      map(() => 200), catchError(e => of(e.status as number))));
    forkJoin(calls).subscribe(statuses => this.checks.update(list => list.map((c, i) => ({ ...c, status: statuses[i] }))));
  }

  doc(id: number) {
    this.http.get(`/api/authz/documents/${id}`, { headers: this.headers() })
      .subscribe({ next: r => this.docResult.set(r), error: e => this.docResult.set({ status: e.status, hint: e.status === 403 ? 'pas propriétaire ni Admin' : e.status === 401 ? 'connecte-toi' : e.error }) });
  }
}
