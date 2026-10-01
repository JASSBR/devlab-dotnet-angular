import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-options',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Configuration en couches</h3>
        <p>Les sources s'empilent, la dernière gagne : <code>appsettings.json</code> → <code>appsettings.&#123;Environment&#125;.json</code> → <strong>user-secrets</strong> (dev) →
        <strong>variables d'environnement</strong> (<code>Lab__MaxPageSize=20</code>, le <code>__</code> remplace <code>:</code>) → arguments CLI.</p>
        <h3>Options pattern</h3>
        <ul>
          <li><code>IOptions&lt;T&gt;</code> : singleton, lu une fois. 95 % des cas.</li>
          <li><code>IOptionsSnapshot&lt;T&gt;</code> : scoped, recalculé par requête → voit les modifications du fichier.</li>
          <li><code>IOptionsMonitor&lt;T&gt;</code> : singleton + <code>OnChange</code> → pour les services de fond.</li>
          <li><code>ValidateDataAnnotations().ValidateOnStart()</code> : une config invalide fait planter le démarrage, pas la 1ʳᵉ requête à 3 h du matin.</li>
        </ul>
        <div class="callout warn"><strong>Secrets</strong> : jamais dans un JSON commité. En dev : <code>dotnet user-secrets set "Jwt:SigningKey" "..."</code>. En prod : variables d'env de la plateforme (Railway, Azure App Settings) ou Key Vault. Le lab met une clé « DEV-ONLY » dans <code>appsettings.Development.json</code> pour rester zéro-config — c'est l'exception pédagogique.</div>
        <p class="small muted">Expérience : modifie <code>Lab:Name</code> dans <code>appsettings.Development.json</code> pendant que l'API tourne, sauvegarde, re-clique : <code>snapshot</code>/<code>monitor</code> changent, <code>options</code> non.</p>
      </div>
      <div demo class="col">
        <button class="primary" (click)="load()">GET /api/config</button>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class OptionsLesson {
  readonly lesson = lessonById('options')!;
  private readonly http = inject(HttpClient);
  readonly result = signal<unknown>(null);
  constructor() { this.load(); }
  load() { this.http.get('/api/config').subscribe({ next: r => this.result.set(r), error: e => this.result.set({ status: e.status, hint: 'API injoignable — voir la bannière ci-dessus' }) }); }
}
