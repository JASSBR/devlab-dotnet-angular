import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-jwt',
  imports: [LessonShell, FormsModule, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le contrat</h3>
        <ol class="steps">
          <li><strong>Login</strong> : identifiants → <code>access token</code> (JWT signé, 60 s ici, 5–15 min en prod) + <code>refresh token</code> (opaque, stocké côté serveur).</li>
          <li><strong>Appels API</strong> : <code>Authorization: Bearer &lt;access&gt;</code>. Le serveur vérifie la <em>signature</em>, l'<em>issuer</em>, l'<em>audience</em> et l'<em>expiration</em> — sans toucher à la base : c'est <strong>stateless</strong>.</li>
          <li><strong>Expiration</strong> → 401 → l'interceptor appelle <code>/refresh</code> → nouveau couple, l'ancien refresh est <strong>révoqué</strong> (rotation) → la requête est rejouée.</li>
          <li><strong>Logout</strong> : on révoque les refresh tokens. L'access token reste valide jusqu'à expiration : c'est POURQUOI il doit être court.</li>
        </ol>
        <div class="callout warn"><strong>Où stocker le token ?</strong> En mémoire (signal) + <code>sessionStorage</code> ici. Le <code>localStorage</code> est lisible par n'importe quel script XSS. L'alternative robuste : refresh token en cookie HttpOnly + access token en mémoire (le « BFF light »).</div>
        <p class="small muted">HS256 (clé symétrique) suffit quand émetteur = consommateur. Avec plusieurs APIs, passe à RS256/ES256 : l'API vérifie avec la clé publique (JWKS), sans connaître le secret.</p>
      </div>

      <div demo class="grid-2">
        <div class="card col">
          <h3>Login</h3>
          @if (returnUrl()) { <div class="callout">Le guard t'a redirigé ici depuis <code>{{ returnUrl() }}</code>.</div> }
          <div class="row">
            @for (u of users; track u.name) { <button class="sm" (click)="userName = u.name; password = u.pwd">{{ u.name }}</button> }
          </div>
          <input [(ngModel)]="userName" placeholder="utilisateur" autocomplete="username">
          <input [(ngModel)]="password" type="password" placeholder="mot de passe" autocomplete="current-password">
          <div class="row">
            <button class="primary" (click)="login()">POST /api/auth/jwt/login</button>
            <button (click)="auth.logout()" [disabled]="!auth.isLoggedIn()">Logout</button>
          </div>
          @if (error()) { <div class="callout err">{{ error() }}</div> }

          <h3 style="margin-top:1rem">Jouer avec le token</h3>
          <div class="row">
            <button (click)="callMe()" [disabled]="!auth.isLoggedIn()">GET /me</button>
            <button (click)="refresh()" [disabled]="!auth.refreshToken()">POST /refresh (manuel)</button>
            <button class="danger" (click)="auth.corruptAccessToken()" [disabled]="!auth.isLoggedIn()">Corrompre la signature</button>
          </div>
          <p class="small muted">Attends 60 s puis clique GET /me : le panneau Réseau montre 401 → refresh → 200. Ou corromps le token pour ne pas attendre.</p>
          <pre class="json">{{ meResult() | json2 }}</pre>
        </div>

        <div class="card col">
          <h3>État (AuthStore, signals)</h3>
          <div class="row">
            <span class="badge" [class.ok]="auth.isLoggedIn() && !auth.isExpired()" [class.err]="auth.isExpired()">{{ auth.isLoggedIn() ? (auth.isExpired() ? 'expiré' : 'connecté') : 'anonyme' }}</span>
            @if (auth.isLoggedIn()) {
              <span class="badge brand">{{ auth.userName() }}</span>
              <span class="badge">{{ auth.roles().join(', ') }}</span>
              <span class="badge" [class.warn]="auth.expiresInSeconds() < 15">expire dans {{ auth.expiresInSeconds() }} s</span>
            }
          </div>
          <div class="ttl"><div class="fill" [style.width.%]="ttlPercent()"></div></div>
          <h3>Access token décodé</h3>
          <p class="small muted">Un JWT n'est pas chiffré, juste <em>signé</em> : n'importe qui peut le lire. N'y mets rien de secret.</p>
          <div class="jwt mono">
            @if (auth.accessToken(); as t) {
              <span class="h">{{ t.split('.')[0] }}</span>.<span class="p">{{ t.split('.')[1] }}</span>.<span class="s">{{ t.split('.')[2] }}</span>
            } @else { <span class="muted">—</span> }
          </div>
          <pre class="json">{{ auth.payload() | json2 }}</pre>
          <p class="small muted">refresh token (opaque, jamais un JWT) : <code>{{ (auth.refreshToken() ?? '—').slice(0, 24) }}…</code></p>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .ttl { height: 6px; background: var(--bg-3); border-radius: 99px; overflow: hidden; margin: .5rem 0; }
    .fill { height: 100%; background: linear-gradient(90deg, var(--ok), var(--warn)); transition: width 1s linear; }
    .jwt { word-break: break-all; font-size: .72rem; background: #0a0e17; padding: .6rem; border-radius: 8px; border: 1px solid var(--border); }
    .h { color: #fb7185; } .p { color: #c4b5fd; } .s { color: #67e8f9; }
  `],
})
export class JwtLesson {
  readonly lesson = lessonById('auth-jwt')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly returnUrl = input<string>();   // ?returnUrl= bound thanks to withComponentInputBinding

  readonly users = [{ name: 'alice', pwd: 'alice123' }, { name: 'bob', pwd: 'bob123' }, { name: 'carol', pwd: 'carol123' }];
  userName = 'alice'; password = 'alice123';
  readonly error = signal<string | null>(null);
  readonly meResult = signal<unknown>(null);
  readonly ttlPercent = computed(() => Math.min(100, (this.auth.expiresInSeconds() / 60) * 100));

  login() {
    this.error.set(null);
    this.auth.login(this.userName, this.password).subscribe({
      next: () => { const back = this.returnUrl(); if (back) this.router.navigateByUrl(back); },
      error: e => this.error.set(`${e.status} — ${e.error?.title ?? 'échec'}`),
    });
  }
  callMe() { this.http.get('/api/auth/jwt/me').subscribe({ next: r => this.meResult.set(r), error: e => this.meResult.set({ status: e.status, error: e.error }) }); }
  refresh() { this.auth.refresh().subscribe({ error: e => this.error.set(`refresh: ${e.status}`) }); }
}
