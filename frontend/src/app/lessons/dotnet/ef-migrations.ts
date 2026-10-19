import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface HistoryRow { migrationId: string; productVersion: string; }
interface ContextMigrations {
  context: string; database: string;
  all: string[]; applied: string[]; pending: string[];
  history: HistoryRow[]; lastMigration: string | null; lastMigrationSql: string | null;
}

@Component({
  selector: 'lesson-ef-migrations',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Pourquoi pas EnsureCreated</h3>
        <p><code>EnsureCreated()</code> crée le schéma <em>une fois</em>, à partir du modèle, et ne sait rien faire ensuite : ajouter une colonne = supprimer la base.
        Une <strong>migration</strong> est un pas versionné du schéma, en C#, dans Git, revu en PR. Ici chaque module a les siennes, dans son dossier
        (<code>Features/Products/Migrations</code>, <code>Features/Orders/Migrations</code>) : le module possède son schéma comme il possède ses données.</p>

        <h3>Anatomie d'un <code>dotnet ef migrations add</code></h3>
        <pre class="json">dotnet tool restore     # dotnet-ef épinglé en 10.0.12 dans dotnet-tools.json (= version du runtime EF)
dotnet ef migrations add AddIdempotencyAndOutbox --project backend/DevLab.Api \\
    --context OrdersDbContext --output-dir Features/Orders/Migrations</pre>
        <ul>
          <li><strong><code>…_AddIdempotencyAndOutbox.cs</code></strong> : <code>Up()</code> (appliquer) et <code>Down()</code> (défaire). C'est le seul fichier qu'on lit en revue.</li>
          <li><strong><code>OrdersDbContextModelSnapshot.cs</code></strong> : l'état du modèle <em>après</em> la dernière migration. La prochaine migration = diff entre le code et ce snapshot. Deux branches qui migrent le même contexte = conflit sur ce fichier → on régénère, on ne fusionne pas à la main.</li>
          <li><strong><code>.Designer.cs</code></strong> : le modèle cible de cette migration (métadonnées). Généré, jamais édité — d'où <code>generated_code = true</code> dans <code>.editorconfig</code> : les analyzers ignorent ces fichiers au lieu de les « corriger ».</li>
        </ul>

        <h3><code>__EFMigrationsHistory</code></h3>
        <p>Une table, une ligne par migration appliquée (<code>MigrationId</code>, <code>ProductVersion</code>). <code>GetPendingMigrationsAsync()</code> = migrations compilées dans l'assembly − lignes de la table.
        EF ne vérifie aucun checksum : c'est l'<em>identifiant</em> qui compte.</p>
        <div class="callout warn"><strong>Ne jamais modifier une migration déjà appliquée</strong> (ni pushée). La base dit « déjà fait » : ta modification ne tournera jamais là-bas, et les environnements divergent en silence.
        On corrige par une <em>nouvelle</em> migration. <code>migrations remove</code> seulement pour une migration encore locale. En prod, <code>Down()</code> sert peu : on <em>roll forward</em>.</div>

        <h3>Appliquer : démo vs production</h3>
        <p>Ici <code>MigrateAsync()</code> tourne au démarrage (<code>DbSeeder</code>) : une instance, un fichier SQLite, des données jetables — acceptable.
        En production, non : N réplicas qui démarrent ensemble font la course pour <code>ALTER</code> les mêmes tables, un démarrage lent fait échouer les health checks, et l'app aurait besoin de droits DDL qu'elle ne devrait pas avoir.
        Le pipeline applique le schéma <em>avant</em> de déployer :</p>
        <ul>
          <li><code>dotnet ef migrations bundle</code> → un exécutable autonome <code>efbundle --connection "…"</code>, lancé par une étape de CI/CD ou un job Kubernetes.</li>
          <li><code>dotnet ef migrations script --idempotent</code> → un SQL où chaque migration est gardée par <code>IF NOT EXISTS (SELECT … FROM __EFMigrationsHistory WHERE MigrationId = …)</code>, rejouable sur n'importe quelle base, relu par un DBA.
          SQLite ne sait pas générer la version idempotente : le fichier <code>orders.migrations.sql</code> du lab est le script complet, non gardé.</li>
          <li>Depuis EF 9, <code>Migrate()</code> prend un verrou (<code>__EFMigrationsLock</code> en SQLite) et refuse de tourner si le modèle a changé sans migration — c'est aussi ce que vérifie <code>MigrationsTests</code> avec <code>HasPendingModelChanges()</code>.</li>
        </ul>

        <h3>Schéma vs données, et zéro downtime</h3>
        <p>Une migration peut aussi déplacer des <strong>données</strong> (<code>migrationBuilder.Sql("UPDATE …")</code>, <code>InsertData</code> pour des données de référence). Les données de démo, elles, restent dans un seeder.
        Pendant un déploiement progressif, <strong>l'ancienne et la nouvelle version tournent ensemble</strong> sur le même schéma. Renommer une colonne d'un coup casse l'ancienne. D'où <strong>expand / contract</strong> :</p>
        <ol class="steps">
          <li><strong>Expand</strong> : ajouter la nouvelle colonne (nullable), écrire dans les deux, backfill par lots.</li>
          <li><strong>Migrate</strong> : la nouvelle version lit la nouvelle colonne.</li>
          <li><strong>Contract</strong> : une release plus tard, quand plus rien ne lit l'ancienne, la supprimer.</li>
        </ol>
        <p class="small muted">Base existante créée par <code>EnsureCreated</code> (pas de table d'historique) : le lab la recrée ; une vraie base serait « baselinée » en insérant à la main la ligne <code>InitialCreate</code>.
        SQLite a un <code>ALTER TABLE</code> très limité : pour certaines modifications EF reconstruit la table (copie + rename) — à surveiller sur de gros volumes.</p>
      </div>

      <div demo class="col">
        <div class="row">
          <button class="primary" (click)="load()">GET /api/migrations</button>
          <span class="muted small">deux modules, deux bases, deux historiques indépendants</span>
        </div>
        @if (error()) { <div class="callout warn">{{ error() }}</div> }
        @for (c of contexts(); track c.context) {
          <div class="card fade-in">
            <h3>{{ c.context }} <span class="badge">{{ c.database }}</span>
              <span class="badge" [class.ok]="c.pending.length === 0" [class.warn]="c.pending.length > 0">{{ c.pending.length === 0 ? 'à jour' : c.pending.length + ' en attente' }}</span></h3>
            <table>
              <tr><th>migration (assembly)</th><th>état</th></tr>
              @for (m of c.all; track m) {
                <tr><td class="mono small">{{ m }}</td>
                  <td><span class="badge" [class.ok]="c.applied.includes(m)" [class.warn]="!c.applied.includes(m)">{{ c.applied.includes(m) ? 'appliquée' : 'pending' }}</span></td></tr>
              }
            </table>
            <p class="small muted">SELECT * FROM "__EFMigrationsHistory"</p>
            <table>
              <tr><th>MigrationId</th><th>ProductVersion</th></tr>
              @for (h of c.history; track h.migrationId) { <tr><td class="mono small">{{ h.migrationId }}</td><td class="mono small">{{ h.productVersion }}</td></tr> }
            </table>
            @if (c.lastMigrationSql) {
              <p class="small muted">IMigrator.GenerateScript(avant-dernière → {{ c.lastMigration }}) — ce que la migration exécute vraiment :</p>
              <pre class="json">{{ c.lastMigrationSql }}</pre>
            }
          </div>
        }
      </div>
    </lesson-shell>
  `,
})
export class EfMigrationsLesson {
  readonly lesson = lessonById('ef-migrations')!;
  private readonly http = inject(HttpClient);
  readonly contexts = signal<ContextMigrations[]>([]);
  readonly error = signal<string | null>(null);

  constructor() { this.load(); }

  load() {
    this.http.get<ContextMigrations[]>('/api/migrations').subscribe({
      next: c => { this.contexts.set(c); this.error.set(null); },
      error: e => this.error.set(`${e.status} ${e.statusText ?? ''}`),
    });
  }
}
