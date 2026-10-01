import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface RuntimeConfig {
  /** Absolute backend origin for WebSocket traffic. Empty = same origin (dev proxy). */
  hubOrigin: string;
}

/**
 * Read once at startup from /config.json — a RUNTIME file, not a build-time constant:
 * changing the backend URL is a redeploy of a 40-byte file, not a rebuild of the app.
 * Needed because /api and /idp are proxied by Vercel (same-origin, so cookies work),
 * but WebSockets cannot be proxied: SignalR must dial the backend directly.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly config = signal<RuntimeConfig>({ hubOrigin: '' });

  readonly hubOrigin = () => this.config().hubOrigin;
  readonly hubUrl = (path: string) => `${this.config().hubOrigin}${path}`;

  async load(): Promise<void> {
    try { this.config.set(await firstValueFrom(this.http.get<RuntimeConfig>('/config.json'))); }
    catch { /* absent in dev: same-origin defaults are correct */ }
  }
}
