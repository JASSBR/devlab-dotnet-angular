import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { decodeJwt } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

const CLIENT_ID = 'devlab-spa';
const REDIRECT_URI = `${location.origin}/lessons/auth-oidc/callback`;
const FLOW_KEY = 'devlab.oidc.flow';
const TOKEN_KEY = 'devlab.oidc.tokens';

// ── PKCE helpers (Web Crypto) ────────────────────────────────────────────────
const base64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)).buffer);
const sha256 = async (s: string) => base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

interface Tokens { access_token: string; id_token: string; token_type: string; expires_in: number; scope: string; }

@Component({
  selector: 'lesson-oidc',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Pourquoi ce flow ?</h3>
        <p>Ton app ne veut pas voir le mot de passe de l'utilisateur, et l'utilisateur veut se connecter avec Google / Entra ID / Keycloak.
        <strong>OAuth2</strong> délègue l'<em>autorisation</em>, <strong>OpenID Connect</strong> ajoute l'<em>identité</em> (l'<code>id_token</code>, un JWT décrivant l'utilisateur).
        Pour une SPA, le seul flow correct aujourd'hui est <strong>Authorization Code + PKCE</strong> (l'implicit flow est déprécié).</p>
        <ol class="steps">
          <li>Angular génère un <code>code_verifier</code> aléatoire et son <code>code_challenge = base64url(sha256(verifier))</code>, plus un <code>state</code> (anti-CSRF) et un <code>nonce</code>.</li>
          <li>Redirection vers <code>/idp/authorize?client_id&amp;redirect_uri&amp;code_challenge&amp;state…</code> : l'IdP affiche <em>sa</em> page de login/consentement.</li>
          <li>L'IdP renvoie vers <code>redirect_uri?code=…&amp;state=…</code>. Le code est à usage unique, périmé en 2 min.</li>
          <li>Angular vérifie le <code>state</code>, puis POST <code>/idp/token</code> avec <code>code</code> + <code>code_verifier</code>. L'IdP recalcule le hash : seul celui qui a démarré le flow peut finir l'échange (PKCE).</li>
          <li>Tokens reçus. L'<code>id_token</code> est vérifié (signature, <code>iss</code>, <code>aud</code>, <code>nonce</code>). Notre API accepte l'<code>access_token</code> via un 2ᵉ scheme JwtBearer.</li>
        </ol>
        <div class="callout">L'IdP ici est <strong>embarqué dans le backend</strong> (<code>FakeIdentityProvider</code>) pour que tu voies chaque étape. En vrai : remplace les URLs par celles du discovery document de ton fournisseur, et utilise une lib (<code>angular-oauth2-oidc</code>, <code>oidc-client-ts</code>) qui fait exactement ce code — mais maintenant tu sais ce qu'elle fait.</div>
      </div>

      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="start()">1 · Démarrer le flow (redirection vers l'IdP)</button>
          <button (click)="discover()">GET /idp/.well-known/openid-configuration</button>
          <button (click)="clear()">Oublier les tokens</button>
        </div>
        @if (flow(); as f) {
          <div class="card">
            <h3>Ce que le navigateur a stocké avant la redirection (sessionStorage)</h3>
            <pre class="json">{{ f | json2 }}</pre>
          </div>
        }
        @if (tokens(); as t) {
          <div class="card fade-in">
            <h3>✓ Tokens reçus de l'IdP</h3>
            <div class="row">
              <span class="badge ok">token_type {{ t.token_type }}</span><span class="badge">expires_in {{ t.expires_in }} s</span><span class="badge">scope {{ t.scope }}</span>
              <button class="sm" (click)="callApi('/api/auth/oidc/me')">GET /api/auth/oidc/me</button>
              <button class="sm" (click)="callApi('/idp/userinfo')">GET /idp/userinfo</button>
              <button class="sm" (click)="callApi('/api/auth/whoami')">GET /whoami (Smart → OidcBearer)</button>
            </div>
            <h3 style="margin-top:.75rem">id_token décodé</h3>
            <pre class="json">{{ idClaims() | json2 }}</pre>
            <p class="small muted" [class.ok]="nonceOk()">nonce attendu = {{ flow()?.['nonce'] }} → {{ nonceOk() ? '✓ correspond' : '✗ mismatch (replay ?)' }}</p>
          </div>
        }
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class OidcLesson {
  readonly lesson = lessonById('auth-oidc')!;
  private readonly http = inject(HttpClient);
  readonly result = signal<unknown>(null);
  readonly flow = signal<Record<string, string> | null>(JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null'));
  readonly tokens = signal<Tokens | null>(JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null'));
  readonly idClaims = computed(() => decodeJwt(this.tokens()?.id_token ?? null));
  readonly nonceOk = computed(() => !!this.flow() && this.idClaims()?.['nonce'] === this.flow()!['nonce']);

  async start() {
    const verifier = random(32), state = random(16), nonce = random(16);
    const challenge = await sha256(verifier);
    const flow = { code_verifier: verifier, code_challenge: challenge, state, nonce, started_at: new Date().toISOString() };
    sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow));
    sessionStorage.removeItem(TOKEN_KEY);

    const params = new HttpParams({ fromObject: {
      client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid profile email',
      state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
    } });
    location.href = `/idp/authorize?${params.toString()}`;   // full-page redirect: we leave the SPA
  }

  discover() { this.http.get('/idp/.well-known/openid-configuration').subscribe(r => this.result.set(r)); }

  callApi(url: string) {
    this.http.get(url, { headers: { Authorization: `Bearer ${this.tokens()!.access_token}` } })
      .subscribe({ next: r => this.result.set(r), error: e => this.result.set({ status: e.status, body: e.error }) });
  }

  clear() { sessionStorage.removeItem(FLOW_KEY); sessionStorage.removeItem(TOKEN_KEY); this.flow.set(null); this.tokens.set(null); this.result.set(null); }
}

/** Landing page of the redirect: ?code=&state= (or ?error=). Exchanges the code, then goes back to the lesson. */
@Component({
  selector: 'oidc-callback',
  imports: [RouterLink, Json2Pipe],
  template: `
    <div class="wrap">
      <h2>↩︎ Callback OIDC</h2>
      <pre class="json">{{ log() | json2 }}</pre>
      <a routerLink="/lessons/auth-oidc" class="btn primary">Retour à la leçon</a>
    </div>
  `,
  styles: [`.wrap { max-width: 800px; margin: 3rem auto; padding: 0 2rem; }`],
})
export class OidcCallback {
  private readonly http = inject(HttpClient);
  readonly code = input<string>();
  readonly state = input<string>();
  readonly error = input<string>();
  readonly log = signal<string[]>([]);

  constructor() {
    // Inputs are bound after construction → wait a tick.
    queueMicrotask(() => this.handle());
  }

  private async handle() {
    const add = (s: string) => this.log.update(l => [...l, s]);
    const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null') as Record<string, string> | null;

    if (this.error()) return add(`✗ L'IdP a répondu error=${this.error()} (tu as cliqué Deny)`);
    if (!flow) return add('✗ Aucun flow en cours dans sessionStorage — démarre depuis la leçon');
    add(`1. code reçu : ${this.code()?.slice(0, 12)}…`);

    if (this.state() !== flow['state']) return add(`✗ state mismatch : attendu ${flow['state']}, reçu ${this.state()} → on refuse (CSRF)`);
    add('2. state vérifié ✓');

    // RFC 6749: token requests are application/x-www-form-urlencoded.
    const body = new HttpParams({ fromObject: { grant_type: 'authorization_code', code: this.code()!, code_verifier: flow['code_verifier'], redirect_uri: REDIRECT_URI, client_id: CLIENT_ID } });
    add('3. POST /idp/token avec code + code_verifier…');
    this.http.post<Tokens>('/idp/token', body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).subscribe({
      next: tokens => {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
        add('4. tokens reçus ✓ (id_token + access_token)');
        add('5. Retourne à la leçon pour les inspecter et appeler l’API.');
      },
      error: e => add(`✗ /idp/token → ${e.status}: ${e.error?.error ?? e.message}`),
    });
  }
}
