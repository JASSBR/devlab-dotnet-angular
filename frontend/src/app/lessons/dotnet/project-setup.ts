import { Component } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Triage { rule: string; count: number; decision: 'fixed' | 'off' | 'suggestion' | 'tuned'; why: string; }

@Component({
  selector: 'lesson-project-setup',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Trois fichiers à la racine, zéro copier-coller</h3>
        <ul>
          <li><code>Directory.Build.props</code> : importé par <em>tous</em> les csproj en dessous. Framework, <code>Nullable</code>, <code>TreatWarningsAsErrors</code>, <code>AnalysisLevel</code>, analyzers. Un nouveau projet hérite de tout.</li>
          <li><code>Directory.Packages.props</code> : <strong>Central Package Management</strong>. Les csproj référencent un package <em>sans</em> version ; la version est déclarée une fois. Deux projets ne peuvent plus diverger.</li>
          <li><code>.editorconfig</code> : le style (IDExxxx) <em>et</em> le triage des analyzers, avec la raison de chaque exception.</li>
        </ul>
        <h3>Ce qui s'est passé quand on a allumé tout ça sur ce lab</h3>
        <p><strong>~230 erreurs</strong> d'un coup (Meziantou + Sonar + CA + IDE). C'est normal, et c'est là que se joue la maturité : on ne désactive pas tout, on ne corrige pas tout non plus. On <em>trie</em> :</p>
        <table>
          <tr><th>Règle</th><th>#</th><th>Décision</th><th>Pourquoi</th></tr>
          @for (t of triage; track t.rule) {
            <tr><td><code>{{ t.rule }}</code></td><td>{{ t.count }}</td>
              <td><span class="badge" [class.ok]="t.decision === 'fixed'" [class.warn]="t.decision === 'tuned'" [class.info]="t.decision === 'suggestion'">{{ label[t.decision] }}</span></td>
              <td class="small muted">{{ t.why }}</td></tr>
          }
        </table>
        <div class="callout ok" style="margin-top:.75rem">Bonus inattendu : quand j'ai voulu injecter une violation volontaire dans le test d'architecture (leçon Modular Monolith), l'analyzer <code>CA1828</code> a refusé mon <code>CountAsync() > 0</code> avant même que le test tourne. Les outils se protègent entre eux.</div>
        <h3>Et le reste de la check-list « nouveau projet 2026 »</h3>
        <ul>
          <li><strong>.NET Aspire</strong> : orchestration locale (API + DB + Redis en un <code>dotnet run</code>), dashboard de traces. Pertinent dès qu'il y a plus d'un service.</li>
          <li><strong>OpenTelemetry</strong> : traces + métriques + logs corrélés par <code>traceId</code> — tu l'as déjà vu dans les <code>ProblemDetails</code> du lab.</li>
          <li><strong>CI</strong> : <code>dotnet build</code> (les warnings cassent la build), <code>dotnet test</code>, image Docker. Un workflow GitHub Actions de 30 lignes suffit.</li>
        </ul>
      </div>
      <div demo class="col">
        <p>Pas de démo cliquable ici : la démo, c'est la build. Lance-la et casse-la :</p>
        <pre class="json">cd backend && dotnet build
# → 0 Avertissement(s), 0 Erreur(s)

# Ajoute  var unused = 1;  dans n'importe quel handler, puis :
dotnet build
# → error CS0219 : la variable 'unused' est assignée mais jamais utilisée  ← warning promu en erreur

# Réactive une règle pour voir la vague : dans .editorconfig, passe MA0004 à warning
dotnet build 2>&1 | grep -c MA0004     # ≈ 38 occurrences</pre>
      </div>
    </lesson-shell>
  `,
})
export class ProjectSetupLesson {
  readonly lesson = lessonById('project-setup')!;
  readonly label = { fixed: 'corrigé', off: 'désactivé', suggestion: 'suggestion', tuned: 'seuil ajusté' };
  readonly triage: Triage[] = [
    { rule: 'MA0004 ConfigureAwait', count: 38, decision: 'off', why: 'ASP.NET Core n’a pas de SynchronizationContext : la règle est vide de sens ici.' },
    { rule: 'MA0048 un type par fichier', count: 15, decision: 'off', why: 'Style vertical slice : les petits records vivent avec le code qui les utilise.' },
    { rule: 'CA1725 / S927 noms de paramètres', count: 8, decision: 'off', why: 'Cosmétique ; « ctx » est idiomatique dans les middlewares.' },
    { rule: 'CA1716 / CA1711 / CA1000 interop VB', count: 7, decision: 'off', why: 'Règles pour bibliothèques consommées depuis d’autres langages. On est une application.' },
    { rule: 'MA0006 / MA0074 / CA1305 culture', count: 20, decision: 'suggestion', why: 'Valides (StringComparison, IFormatProvider) mais pas de quoi casser la build d’un lab.' },
    { rule: 'CA1848 LoggerMessage', count: 2, decision: 'suggestion', why: 'Optimisation des logs, à faire dans les chemins chauds seulement.' },
    { rule: 'MA0051 méthode trop longue', count: 3, decision: 'tuned', why: 'Seuil 60 → 120 : une méthode de mapping d’endpoints est longue par nature.' },
    { rule: 'S3330 / S2092 cookie flags', count: 2, decision: 'fixed', why: 'Vrai sujet. XSRF-TOKEN doit rester lisible par JS (pragma + commentaire) ; Secure = IsHttps.' },
    { rule: 'CA2211 / S1104 champ statique public', count: 4, decision: 'fixed', why: 'LiveHub.ConnectedClients → champ privé + Interlocked + propriété Volatile.Read.' },
    { rule: 'S6966 app.Run()', count: 1, decision: 'fixed', why: '→ await app.RunAsync().' },
    { rule: 'CA1707 underscores (tests)', count: 10, decision: 'off', why: 'Uniquement dans le projet de tests : Given_When_Then est la norme xUnit.' },
  ];
}
