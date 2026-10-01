import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * The lab is deployed as a static site on Vercel; the .NET API may or may not be
 * reachable behind it. One probe at startup tells every lesson whether the live
 * demos can work, so pages degrade with an explanation instead of silent errors.
 */
@Injectable({ providedIn: 'root' })
export class ApiStatus {
  private readonly http = inject(HttpClient);
  private readonly state = signal<'checking' | 'online' | 'offline'>('checking');

  readonly isOnline = computed(() => this.state() === 'online');
  readonly isOffline = computed(() => this.state() === 'offline');
  readonly label = computed(() => ({ checking: 'vérification…', online: 'API connectée', offline: 'API hors ligne' })[this.state()]);

  constructor() { this.probe(); }

  probe() {
    this.state.set('checking');
    this.http.get('/api/config').subscribe({
      next: () => this.state.set('online'),
      error: () => {
        this.state.set('offline');
        // Warm the snapshot right away: every code viewer on the page will need it.
        this.http.get('/source-snapshot.json').subscribe({ error: () => {} });
      },
    });
  }
}
