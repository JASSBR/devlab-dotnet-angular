import { HttpClient, HttpResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-middleware',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>L'oignon</h3>
        <p>Une requête traverse les middlewares <strong>dans l'ordre de <code>app.Use…</code></strong>, atteint l'endpoint, puis la réponse
        remonte <strong>en sens inverse</strong>. Chaque middleware reçoit <code>next</code> et choisit : appeler la suite, ou <em>court-circuiter</em>.</p>
        <ol class="steps">
          <li><code>UseExceptionHandler</code> tout en haut : il doit englober tout le reste pour attraper les exceptions.</li>
          <li><code>UseAuthentication</code> avant <code>UseAuthorization</code> : on identifie, puis on autorise. Inverser = 401 partout.</li>
          <li><code>UseCors</code> avant tout ce qui écrit une réponse. <code>UseRateLimiter</code> tôt pour rejeter à moindre coût.</li>
        </ol>
        <p><code>IExceptionHandler</code> + <code>ProblemDetails</code> (RFC 9457) : un seul endroit transforme les exceptions en réponses propres, sans <code>try/catch</code> dans les endpoints. En Development le message est exposé ; en Production, jamais.</p>
      </div>
      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="trace()">GET /trace — voir l'aller/retour</button>
          <button (click)="boom('')">/boom → 500</button>
          <button (click)="boom('notfound')">/boom?kind=notfound → 404</button>
          <button (click)="boom('forbidden')">/boom?kind=forbidden → 403</button>
          <button (click)="shortCircuit()">/short-circuit?stop → 418 par un filter</button>
        </div>
        @if (elapsed()) { <span class="badge info">header X-Elapsed-Ms : {{ elapsed() }} (posé par RequestTimingMiddleware)</span> }
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class MiddlewareLesson {
  readonly lesson = lessonById('middleware')!;
  private readonly http = inject(HttpClient);
  readonly result = signal<unknown>(null);
  readonly elapsed = signal<string | null>(null);

  trace() {
    // observe: 'response' → we get headers too.
    this.http.get('/api/middleware/trace', { observe: 'response' }).subscribe((r: HttpResponse<unknown>) => {
      this.elapsed.set(r.headers.get('X-Elapsed-Ms')); this.result.set(r.body);
    });
  }
  boom(kind: string) {
    this.elapsed.set(null);
    this.http.get('/api/middleware/boom', { params: kind ? { kind } : {} }).subscribe({ error: e => this.result.set({ status: e.status, problemDetails: e.error }) });
  }
  shortCircuit() {
    this.elapsed.set(null);
    this.http.get('/api/middleware/short-circuit', { params: { stop: '1' } }).subscribe({ error: e => this.result.set({ status: e.status, body: e.error }) });
  }
}
