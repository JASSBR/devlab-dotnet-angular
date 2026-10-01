import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-validation',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Valider à la frontière</h3>
        <p>Le client valide pour l'UX ; le serveur valide pour la <strong>sécurité</strong>. Jamais l'un sans l'autre.
        FluentValidation exprime les règles dans une classe dédiée (<code>AbstractValidator&lt;T&gt;</code>), testable unitairement,
        et le <code>ValidationFilter&lt;T&gt;</code> générique les exécute avant le handler de n'importe quel endpoint.</p>
        <p>La réponse 400 suit <strong>RFC 9457 ProblemDetails</strong> : <code>type</code>, <code>title</code>, <code>status</code>, <code>errors&#123; champ: [messages] &#125;</code>. Angular peut mapper <code>errors</code> directement sur les contrôles (cf. leçon Forms).</p>
        <p class="muted small">Alternative intégrée : DataAnnotations (<code>[Required]</code>, <code>[Range]</code>) validées automatiquement par <code>[ApiController]</code>, ou, en .NET 10, par <code>AddValidation()</code> pour les Minimal APIs.</p>
      </div>
      <div demo class="col">
        <label>Corps JSON envoyé à <code>POST /api/validation/register</code> (édite-le librement)</label>
        <textarea rows="7" class="mono" [value]="body()" (input)="body.set($any($event.target).value)"></textarea>
        <div class="row">
          <button class="primary" (click)="send()">Envoyer</button>
          <button (click)="body.set(valid)">exemple valide</button>
          <button (click)="body.set(invalid)">exemple invalide</button>
          @if (status()) { <span class="badge" [class.ok]="status() === 200" [class.err]="status() !== 200">HTTP {{ status() }}</span> }
        </div>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
  styles: [`textarea { width: 100%; }`],
})
export class ValidationLesson {
  readonly lesson = lessonById('validation')!;
  private readonly http = inject(HttpClient);
  readonly valid = JSON.stringify({ email: 'yassir@devlab.local', password: 'Secret123', confirmPassword: 'Secret123', age: 30 }, null, 2);
  readonly invalid = JSON.stringify({ email: 'not-an-email', password: 'abc', confirmPassword: 'abd', age: 5 }, null, 2);
  readonly body = signal(this.invalid);
  readonly result = signal<unknown>(null);
  readonly status = signal<number | null>(null);

  send() {
    let parsed: unknown;
    try { parsed = JSON.parse(this.body()); } catch { this.result.set('JSON invalide côté client'); return; }
    this.http.post('/api/validation/register', parsed).subscribe({
      next: r => { this.status.set(200); this.result.set(r); },
      error: e => { this.status.set(e.status); this.result.set(e.error); },
    });
  }
}
