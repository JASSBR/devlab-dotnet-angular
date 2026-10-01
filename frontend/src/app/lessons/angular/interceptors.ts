import { HttpClient, HttpContext } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { SKIP_AUTH } from '../../core/auth/auth.interceptor';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-interceptors',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Un interceptor = un middleware côté client</h3>
        <p>Chaque requête <code>HttpClient</code> traverse la chaîne déclarée dans <code>withInterceptors([...])</code>. Un interceptor
        fonctionnel reçoit <code>(req, next)</code>, peut cloner la requête (elle est immuable), appeler <code>next()</code>, et transformer
        la réponse ou l'erreur avec RxJS. C'est <strong>exactement</strong> le pipeline de middlewares ASP.NET, en miroir.</p>
        <ul>
          <li><code>authInterceptor</code> ajoute <code>Authorization: Bearer</code>, et sur <strong>401</strong> appelle <code>/refresh</code> puis <strong>rejoue</strong> la requête.</li>
          <li><code>SKIP_AUTH</code> est un <code>HttpContextToken</code> : un « drapeau » attaché à une requête précise (login, refresh) pour que l'interceptor la laisse passer.</li>
          <li><code>requestLogInterceptor</code> ne modifie rien : il observe et alimente le panneau Réseau.</li>
        </ul>
        <div class="callout warn">Ordre : la requête traverse <code>[auth, log]</code> dans l'ordre, la réponse dans l'ordre inverse. Log est placé après auth pour voir le header ajouté.</div>
      </div>

      <div demo class="col">
        @if (!auth.isLoggedIn()) {
          <div class="callout">Connecte-toi d'abord (leçon <strong>JWT</strong>) pour voir le refresh en action. Tu peux quand même observer la 401.</div>
        }
        <div class="row">
          <button class="primary" (click)="callMe()">GET /api/auth/jwt/me</button>
          <button (click)="callMe(true)">… avec SKIP_AUTH (pas de header)</button>
          <button class="danger" (click)="auth.corruptAccessToken()" [disabled]="!auth.isLoggedIn()">Corrompre le token puis appeler</button>
          <button (click)="auth.login('bob', 'bob123').subscribe()">Login bob (rapide)</button>
        </div>
        <p class="small muted">Scénario magique : corromps le token, clique GET → tu verras dans le panneau Réseau : <code>401 /me</code> → <code>200 /refresh</code> → <code>200 /me</code>. Le composant, lui, n'a rien vu.</p>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class InterceptorsLesson {
  readonly lesson = lessonById('interceptors')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  readonly result = signal<unknown>('— clique un bouton —');

  callMe(skip = false) {
    this.result.set('…');
    this.http.get('/api/auth/jwt/me', { context: new HttpContext().set(SKIP_AUTH, skip) }).subscribe({
      next: r => this.result.set(r),
      error: e => this.result.set({ status: e.status, error: e.error ?? e.message }),
    });
  }
}
