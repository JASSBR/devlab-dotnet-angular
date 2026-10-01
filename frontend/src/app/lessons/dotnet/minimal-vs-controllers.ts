import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { Json2Pipe } from '../../shared/json-view';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-minimal-vs-controllers',
  imports: [LessonShell, Json2Pipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Deux styles, un framework</h3>
        <table>
          <tr><th></th><th>Minimal API</th><th>Controller</th></tr>
          <tr><td>Déclaration</td><td><code>app.MapGet("/x", (…) => …)</code></td><td><code>[ApiController] class : ControllerBase</code></td></tr>
          <tr><td>Binding</td><td>par convention (route, query, body, DI)</td><td>idem + <code>[FromQuery]</code>, <code>[FromBody]</code>… + validation auto des DataAnnotations</td></tr>
          <tr><td>Filtres</td><td><code>IEndpointFilter</code></td><td>Action/Result/Exception filters</td></tr>
          <tr><td>Groupement</td><td><code>MapGroup</code> + extension methods par feature</td><td>par classe</td></tr>
          <tr><td>Réponses typées</td><td><code>TypedResults</code> + <code>Results&lt;A, B&gt;</code></td><td><code>ActionResult&lt;T&gt;</code> + <code>[ProducesResponseType]</code></td></tr>
        </table>
        <p class="muted small" style="margin-top:.5rem">Choix pragmatique : Minimal API pour les nouveaux projets (moins de cérémonie, très performant), Controllers si l'équipe/le legacy en est plein. Ce lab utilise Minimal API partout sauf ici.</p>
        <p>La doc OpenAPI est générée par <code>AddOpenApi()</code> et servie joliment par Scalar : <a href="/scalar/v1" target="_blank">/scalar/v1 ↗</a></p>
      </div>
      <div demo class="col">
        <div class="row">
          <input [value]="name()" (input)="name.set($any($event.target).value)" placeholder="name">
          <select [value]="lang()" (change)="lang.set($any($event.target).value)"><option value="">en</option><option value="fr">fr</option></select>
          <button class="primary" (click)="call('minimal')">GET /api/greet/minimal/:name</button>
          <button class="primary" (click)="call('controller')">GET /api/greet/controller/:name</button>
        </div>
        <pre class="json">{{ result() | json2 }}</pre>
      </div>
    </lesson-shell>
  `,
})
export class MinimalVsControllersLesson {
  readonly lesson = lessonById('minimal-vs-controllers')!;
  private readonly http = inject(HttpClient);
  readonly name = signal('Yassir');
  readonly lang = signal('fr');
  readonly result = signal<unknown>(null);
  call(style: 'minimal' | 'controller') {
    this.http.get(`/api/greet/${style}/${encodeURIComponent(this.name())}`, { params: { lang: this.lang() } })
      .subscribe({ next: r => this.result.set(r), error: e => this.result.set(e.error ?? e.message) });
  }
}
