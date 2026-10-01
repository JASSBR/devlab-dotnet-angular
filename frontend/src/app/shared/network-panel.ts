import { KeyValuePipe } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { RequestLog } from '../core/http/request-log.interceptor';

/** Bottom drawer listing every HTTP call captured by requestLogInterceptor. */
@Component({
  selector: 'network-panel',
  template: `
    <div class="head">
      <strong>Journal réseau</strong>
      <span class="muted small">— chaque appel HttpClient passe par l'interceptor <code>requestLogInterceptor</code></span>
      <span class="spacer"></span>
      <button class="sm" (click)="log.clear()">Vider</button>
      <button class="sm" (click)="close.emit()">✕</button>
    </div>
    <div class="list">
      @for (e of log.entries(); track e.id) {
        <div class="entry" [class.err]="e.ok === false">
          <span class="method">{{ e.method }}</span>
          <span class="url mono">{{ e.url }}</span>
          <span class="status" [class.ok]="e.ok" [class.ko]="e.ok === false">{{ e.status ?? '…' }}</span>
          <span class="ms muted">{{ e.durationMs ?? '' }}{{ e.durationMs !== undefined ? ' ms' : '' }}</span>
          <span class="headers mono muted">
            @for (h of e.headers | keyvalue; track h.key) { <span>{{ h.key }}: {{ h.value }}</span> }
            @if (e.error) { <span class="error">{{ e.error }}</span> }
          </span>
        </div>
      } @empty {
        <div class="empty muted">Aucune requête pour l'instant. Joue avec une démo !</div>
      }
    </div>
  `,
  styles: [`
    :host { position: fixed; left: 0; right: 0; bottom: 0; height: 280px; background: #0a0e17; border-top: 1px solid var(--border); z-index: 25; display: flex; flex-direction: column; box-shadow: 0 -10px 40px #000a; }
    .head { display: flex; align-items: center; gap: .6rem; padding: .5rem 1rem; border-bottom: 1px solid var(--border); }
    .spacer { flex: 1; }
    .list { overflow: auto; flex: 1; font-size: .8rem; }
    .entry { display: grid; grid-template-columns: 60px 1fr 50px 70px; gap: .5rem; padding: .35rem 1rem; border-bottom: 1px solid #151b2b; align-items: baseline; }
    .entry.err { background: #2a080810; }
    .method { font-weight: 700; color: var(--brand-2); }
    .status { font-weight: 700; } .status.ok { color: var(--ok); } .status.ko { color: var(--err); }
    .headers { grid-column: 2 / -1; display: flex; gap: 1rem; flex-wrap: wrap; font-size: .72rem; }
    .error { color: #fca5a5; }
    .empty { padding: 2rem; text-align: center; }
  `],
  imports: [KeyValuePipe],
})
export class NetworkPanel {
  readonly log = inject(RequestLog);
  readonly close = output<void>();
}
