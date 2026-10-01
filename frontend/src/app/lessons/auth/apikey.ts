import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-apikey',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Machine-to-machine</h3>
        <p>Pas d'utilisateur, pas de navigateur : un service de reporting, un cron, un partenaire. Une <strong>API key</strong> est un secret partagé envoyé dans un header.
        Simple, mais : pas d'expiration native, à faire tourner, à stocker hashée côté serveur en prod, et toujours sous HTTPS.</p>
        <h3>Écrire son propre scheme</h3>
        <p>Hériter de <code>AuthenticationHandler&lt;TOptions&gt;</code> et implémenter <code>HandleAuthenticateAsync</code> :
        lire le header → chercher la clé → construire un <code>ClaimsPrincipal</code> → <code>AuthenticateResult.Success(ticket)</code>.
        À partir de là, <strong>tout le reste d'ASP.NET fonctionne pareil</strong> : <code>[Authorize]</code>, policies, rôles. Les claims sont la monnaie universelle.</p>
        <p>Le scheme <code>Smart</code> (policy scheme) détecte <code>X-Api-Key</code> et route vers ce handler automatiquement — donc <code>/api/auth/whoami</code> marche avec une clé, un JWT ou un cookie.</p>
      </div>
      <div demo class="col">
        <div class="row">
          <input [value]="key()" (input)="key.set($any($event.target).value)" placeholder="X-Api-Key" style="width:220px">
          <button class="sm" (click)="key.set('lab-key-123')">lab-key-123 (Service)</button>
          <button class="sm" (click)="key.set('lab-admin-key')">lab-admin-key (Service+Admin)</button>
          <button class="sm" (click)="key.set('wrong')">wrong</button>
        </div>
        <div class="row">
          <button class="primary" (click)="call('/api/auth/apikey/report')">GET /apikey/report</button>
          <button (click)="call('/api/auth/whoami')">GET /whoami (Smart)</button>
          <button (click)="call('/api/authz/admin')">GET /authz/admin (policy AdminOnly)</button>
        </div>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class ApiKeyLesson {
  readonly lesson = lessonById('auth-apikey')!;
  private readonly http = inject(HttpClient);
  readonly key = signal('lab-key-123');
  readonly result = signal<unknown>(null);
  call(url: string) {
    // Explicit header → authInterceptor steps aside (it checks for X-Api-Key).
    this.http.get(url, { headers: { 'X-Api-Key': this.key() } }).subscribe({
      next: r => this.result.set(r), error: e => this.result.set({ status: e.status, body: e.error }),
    });
  }
}
