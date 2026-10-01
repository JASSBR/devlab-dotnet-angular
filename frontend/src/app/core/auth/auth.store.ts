import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { SKIP_AUTH } from './auth.interceptor';

export interface TokenPair { accessToken: string; accessTokenExpiresAt: string; refreshToken: string; }
export interface JwtPayload { name?: string; role?: string | string[]; exp: number; iat: number; [k: string]: unknown; }

const STORAGE_KEY = 'devlab.jwt';

/**
 * Signal-based auth state. One writable signal holds the token pair; everything
 * else (user, roles, expiry) is derived with computed(). An effect() persists it.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);

  private readonly tokens = signal<TokenPair | null>(readStorage());
  private readonly now = signal(Date.now());

  readonly accessToken = computed(() => this.tokens()?.accessToken ?? null);
  readonly refreshToken = computed(() => this.tokens()?.refreshToken ?? null);
  readonly payload = computed(() => decodeJwt(this.accessToken()));
  readonly userName = computed(() => this.payload()?.name ?? null);
  readonly roles = computed<string[]>(() => {
    const r = this.payload()?.role;
    return Array.isArray(r) ? r : r ? [r] : [];
  });
  readonly isLoggedIn = computed(() => !!this.accessToken());
  readonly expiresInSeconds = computed(() => {
    const exp = this.payload()?.exp;
    return exp ? Math.max(0, Math.round(exp - this.now() / 1000)) : 0;
  });
  readonly isExpired = computed(() => this.isLoggedIn() && this.expiresInSeconds() === 0);

  constructor() {
    // Side effect kept out of computed(): persistence.
    effect(() => {
      const t = this.tokens();
      t ? sessionStorage.setItem(STORAGE_KEY, JSON.stringify(t)) : sessionStorage.removeItem(STORAGE_KEY);
    });
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  hasRole = (role: string) => this.roles().includes(role);

  login(userName: string, password: string): Observable<TokenPair> {
    return this.http
      .post<TokenPair>('/api/auth/jwt/login', { userName, password }, { context: new HttpContext().set(SKIP_AUTH, true) })
      .pipe(tap(pair => this.tokens.set(pair)));
  }

  /** Called by the interceptor on 401 — must NOT itself be intercepted (SKIP_AUTH). */
  refresh(): Observable<TokenPair> {
    return this.http
      .post<TokenPair>('/api/auth/jwt/refresh', { refreshToken: this.refreshToken() }, { context: new HttpContext().set(SKIP_AUTH, true) })
      .pipe(tap(pair => this.tokens.set(pair)));
  }

  logout(): void {
    if (this.isLoggedIn()) this.http.post('/api/auth/jwt/logout', {}).subscribe({ error: () => {} });
    this.tokens.set(null);
  }

  /** Demo helper: corrupt the access token to force a 401 → refresh → retry cycle. */
  corruptAccessToken(): void {
    const t = this.tokens();
    if (t) this.tokens.set({ ...t, accessToken: t.accessToken.slice(0, -4) + 'xxxx' });
  }
}

function readStorage(): TokenPair | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
}

export function decodeJwt(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const raw = JSON.parse(json) as Record<string, unknown>;
    // Microsoft uses long URIs for standard claims → normalise to short names.
    const short = (k: string) => k.includes('/') ? k.slice(k.lastIndexOf('/') + 1) : k;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [short(k), v])) as JwtPayload;
  } catch { return null; }
}
