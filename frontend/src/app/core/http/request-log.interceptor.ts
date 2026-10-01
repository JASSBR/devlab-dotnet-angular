import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize, tap } from 'rxjs';

export interface LogEntry {
  id: number; method: string; url: string; status?: number; ok?: boolean;
  startedAt: number; durationMs?: number; headers: Record<string, string>; error?: string;
}

/** The "network panel" state: a signal holding the last 60 HTTP calls. */
@Injectable({ providedIn: 'root' })
export class RequestLog {
  private seq = 0;
  private readonly _entries = signal<LogEntry[]>([]);
  readonly entries = this._entries.asReadonly();
  readonly pending = computed(() => this._entries().filter(e => e.status === undefined).length);

  start(method: string, url: string, headers: Record<string, string>): LogEntry {
    const entry: LogEntry = { id: ++this.seq, method, url, startedAt: Date.now(), headers };
    this._entries.update(list => [entry, ...list].slice(0, 60));   // immutable update → signal notifies
    return entry;
  }
  finish(entry: LogEntry, patch: Partial<LogEntry>) {
    this._entries.update(list => list.map(e => e.id === entry.id ? { ...e, ...patch, durationMs: Date.now() - entry.startedAt } : e));
  }
  clear() { this._entries.set([]); }
}

/**
 * Observes every request; never modifies it. Registered AFTER authInterceptor in
 * withInterceptors([...]) so it sees the Authorization header that was just added.
 */
export const requestLogInterceptor: HttpInterceptorFn = (req, next) => {
  const log = inject(RequestLog);
  const headers: Record<string, string> = {};
  for (const k of req.headers.keys()) headers[k] = k === 'Authorization' ? mask(req.headers.get(k)!) : req.headers.get(k)!;
  const entry = log.start(req.method, req.urlWithParams, headers);

  return next(req).pipe(
    tap({
      next: ev => { if (ev instanceof HttpResponse) log.finish(entry, { status: ev.status, ok: true }); },
      error: (err: HttpErrorResponse) => log.finish(entry, { status: err.status, ok: false, error: err.error?.title ?? err.error?.error ?? err.message }),
    }),
    finalize(() => { if (entry.status === undefined) log.finish(entry, {}); }),
  );
};

const mask = (v: string) => v.length > 28 ? `${v.slice(0, 18)}…${v.slice(-6)}` : v;
