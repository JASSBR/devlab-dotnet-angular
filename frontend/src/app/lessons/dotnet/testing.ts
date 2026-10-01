import { Component } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

@Component({
  selector: 'lesson-testing',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Tester l'app, pas des mocks</h3>
        <p><code>WebApplicationFactory&lt;Program&gt;</code> démarre <strong>ta vraie application</strong> (le vrai <code>Program.cs</code>, tous les middlewares, l'auth,
        EF Core) dans le processus de test, sans réseau. Tu obtiens un <code>HttpClient</code> branché dessus. Un test = un scénario HTTP réaliste.</p>
        <ul>
          <li><code>ConfigureAppConfiguration</code> injecte une config de test : base SQLite jetable, clé JWT de test, API key de test.</li>
          <li><code>IClassFixture&lt;T&gt;</code> : une app par classe de test (démarrage coûteux mutualisé).</li>
          <li>Le <code>public partial class Program &#123;&#125;</code> en bas de <code>Program.cs</code> rend la classe visible au projet de test.</li>
          <li>Pyramide : quelques tests E2E (Playwright), beaucoup d'intégration comme ici, et des tests unitaires pour la logique pure (validators, services).</li>
        </ul>
        <div class="callout ok">Ces tests ont révélé deux vrais bugs pendant la construction du lab : la clé JWT et la connection string étaient lues <em>au moment de l'enregistrement</em> des services, donc avant que la config de test s'applique. Correction : lecture paresseuse via <code>IOptions</code> et via <code>IServiceProvider</code>. C'est exactement à ça que servent les tests.</div>
      </div>
      <div demo class="col">
        <p>Lance-les toi-même :</p>
        <pre class="json">cd backend && dotnet test

Réussi! - échec : 0, réussite : 10, ignorée(s) : 0, total : 10</pre>
        <p class="small muted">Côté Angular : <code>npm test</code> (Vitest). Le composant <code>AuthStore</code> et les validateurs de formulaires (fonctions pures) sont les premiers candidats aux tests unitaires.</p>
      </div>
    </lesson-shell>
  `,
})
export class TestingLesson { readonly lesson = lessonById('testing')!; }
