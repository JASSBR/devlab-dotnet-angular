import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import { ApiStatus } from './api-status';

export interface SourceFile { path: string; language: string; content: string; }
export interface SourceResult extends SourceFile { live: boolean; }

/**
 * Reads a source file, live from the API when it is up (edit a file → reload → see it),
 * otherwise from the build-time snapshot shipped with the static site.
 */
@Injectable({ providedIn: 'root' })
export class SourceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiStatus);

  // One request for the whole snapshot, shared by every code viewer.
  private readonly snapshot$ = this.http.get<Record<string, SourceFile>>('/source-snapshot.json').pipe(
    catchError(() => of({} as Record<string, SourceFile>)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  get(path: string): Observable<SourceResult> {
    // Known offline → don't waste a doomed round-trip per file.
    if (this.api.isOffline()) return this.fromSnapshot(path);

    return this.http.get<SourceFile>('/api/source', { params: { path } }).pipe(
      map(file => ({ ...file, live: true })),
      catchError(() => this.fromSnapshot(path)),
    );
  }

  private fromSnapshot(path: string): Observable<SourceResult> {
    return this.snapshot$.pipe(switchMap(snapshot => {
      const file = snapshot[path];
      return file ? of({ ...file, live: false }) : throwError(() => new Error(`Fichier absent du snapshot : ${path}`));
    }));
  }
}
