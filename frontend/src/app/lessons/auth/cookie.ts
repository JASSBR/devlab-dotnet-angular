import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-cookie',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le navigateur porte la session</h3>
        <p><code>SignInAsync</code> sérialise le <code>ClaimsPrincipal</code> dans un <strong>ticket chiffré</strong> (Data Protection) et le pose en cookie
        <code>HttpOnly</code> : JavaScript ne peut pas le lire, donc une faille XSS ne peut pas le voler. Le navigateur le renvoie tout seul à chaque requête —
        c'est à la fois la force (rien à gérer côté Angular) et le danger : <strong>CSRF</strong>.</p>
        <h3>CSRF en 2 lignes</h3>
        <p>Un site malveillant fait <code>POST /api/transfer</code> depuis ta session : le cookie part avec. Défenses : <code>SameSite=Lax/Strict</code>, et un
        <strong>token antiforgery</strong> que seul ton front connaît : le serveur pose un cookie lisible <code>XSRF-TOKEN</code>, Angular le recopie dans le header
        <code>X-XSRF-TOKEN</code> (via <code>withXsrfConfiguration</code>), le serveur compare les deux moitiés.</p>
        <div class="callout">Ici Angular et l'API sont servis sur la même origine (proxy dev <code>/api → :5080</code>). En cross-origin, il faudrait <code>withCredentials: true</code> côté Angular et <code>AllowCredentials()</code> + origine explicite côté CORS, et <code>SameSite=None; Secure</code>.</div>
        <p class="small muted">Cookie vs JWT ? Cookie pour une app web « classique » servie par le même domaine (simple, sûr). JWT pour des APIs consommées par plusieurs clients (mobile, autres services), ou une architecture stateless.</p>
      </div>

      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="login('bob', 'bob123')">POST /cookie/login (bob)</button>
          <button (click)="me()">GET /cookie/me</button>
          <button (click)="logout()">POST /cookie/logout</button>
        </div>
        <p class="small muted"><code>document.cookie</code> vu par JS : <code>{{ visibleCookies() || '(rien — devlab.auth est HttpOnly)' }}</code></p>
        <div class="card">
          <h3>Attaque CSRF simulée : POST /cookie/transfer</h3>
          <div class="row">
            <button class="danger" (click)="clearXsrf(); transfer()">1 · sans token XSRF → 400</button>
            <button (click)="getXsrf()">2 · GET /cookie/csrf (pose XSRF-TOKEN)</button>
            <button class="primary" (click)="transfer()">3 · avec token → 200</button>
          </div>
          <p class="small muted">Regarde le panneau Réseau : après l'étape 2, Angular ajoute <code>X-XSRF-TOKEN</code> tout seul sur les POST.</p>
        </div>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class CookieLesson {
  readonly lesson = lessonById('auth-cookie')!;
  private readonly http = inject(HttpClient);
  readonly result = signal<unknown>(null);
  readonly visibleCookies = signal(document.cookie);

  private show = { next: (r: unknown) => { this.result.set(r); this.visibleCookies.set(document.cookie); },
                   error: (e: { status: number; error: unknown }) => { this.result.set({ status: e.status, body: e.error }); this.visibleCookies.set(document.cookie); } };

  login(userName: string, password: string) { this.http.post('/api/auth/cookie/login', { userName, password }).subscribe(this.show); }
  me() { this.http.get('/api/auth/cookie/me').subscribe(this.show); }
  logout() { this.http.post('/api/auth/cookie/logout', {}).subscribe(this.show); }
  getXsrf() { this.http.get('/api/auth/cookie/csrf').subscribe(this.show); }
  transfer() { this.http.post('/api/auth/cookie/transfer', {}).subscribe(this.show); }
  clearXsrf() { document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'; this.visibleCookies.set(document.cookie); }
}
