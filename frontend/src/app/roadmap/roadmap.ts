import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { lessonById } from '../lessons/catalog';
import { Progress } from '../shared/progress';
import { ANGULAR_BONUS, LEVELS, Level, STATUS_LABEL, Skill, SkillStatus } from './roadmap.data';

type Filter = 'all' | 'learnable' | 'gaps';

@Component({
  selector: 'app-roadmap',
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <header class="fade-in">
        <span class="badge brand">🧭 Mode carrière</span>
        <h1>Junior → Middle → Senior → Architect</h1>
        <p class="muted">
          Le référentiel .NET complet (51 compétences), confronté à ce que ce lab enseigne <em>vraiment</em>.
          Une compétence n'est « couverte » que si une leçon l'<strong>explique</strong> — pas si le code se contente de l'utiliser.
          Le reste est marqué comme trou, avec ce que la leçon manquante contiendrait.
        </p>
        <div class="row">
          <span class="badge ok">{{ totals().covered }} leçons dédiées</span>
          <span class="badge warn">{{ totals().partial }} partiels</span>
          <span class="badge err">{{ totals().todo }} à construire</span>
          <span class="badge brand">couverture {{ coverage() }}%</span>
        </div>
        <div class="bar big"><div class="fill" [style.width.%]="coverage()"></div></div>
      </header>

      @if (nextStep(); as next) {
        <section class="card next fade-in">
          <div>
            <div class="small muted">Prochaine étape recommandée · niveau {{ next.level }}</div>
            <strong>{{ next.skill.label }}</strong>
            <p class="small muted" style="margin:.25rem 0 0">{{ next.skill.note }}</p>
          </div>
          <a class="btn primary" [routerLink]="['/lessons', next.lesson]">Ouvrir la leçon →</a>
        </section>
      }

      <div class="row filters fade-in" role="tablist">
        <button class="sm" [class.primary]="filter() === 'all'" (click)="filter.set('all')">Tout ({{ totals().all }})</button>
        <button class="sm" [class.primary]="filter() === 'learnable'" (click)="filter.set('learnable')">Ce que je peux apprendre ici ({{ totals().covered + totals().partial }})</button>
        <button class="sm" [class.primary]="filter() === 'gaps'" (click)="filter.set('gaps')">Les trous ({{ totals().todo }})</button>
      </div>

      <div class="spine">
      @for (level of levels; track level.id) {
        @if (visible(level).length) {
          <section class="level fade-in" [style.--accent]="level.color">
            <div class="level-head">
              <div class="node">{{ level.index }}</div>
              <div class="title">
                <h2 [style.color]="level.color">{{ level.label }}</h2>
                <span class="muted small">{{ level.blurb }}</span>
              </div>
              <div class="ring" [attr.aria-label]="stats(level).percent + '% validé'">
                <svg viewBox="0 0 44 44">
                  <circle class="track" cx="22" cy="22" r="19" />
                  <circle class="value" cx="22" cy="22" r="19"
                          [style.stroke]="level.color"
                          [style.strokeDasharray]="circumference"
                          [style.strokeDashoffset]="offset(stats(level).percent)" />
                </svg>
                <span class="pct">{{ stats(level).percent }}<small>%</small></span>
              </div>
              <div class="counts">
                <span class="badge" [class.ok]="stats(level).done === stats(level).learnable && stats(level).learnable > 0">
                  {{ stats(level).done }}/{{ stats(level).learnable }} leçons
                </span>
                <span class="muted small">{{ level.skills.length }} compétences</span>
              </div>
            </div>

            <div class="skills">
              @for (skill of visible(level); track skill.label) {
                <div class="skill" [class.done]="isDone(skill)" [class.todo]="skill.status === 'todo'">
                  <div class="mark" [class]="'mark ' + skill.status">
                    {{ isDone(skill) ? '✓' : skill.status === 'todo' ? '○' : skill.status === 'partial' ? '◐' : '●' }}
                  </div>
                  <div class="body">
                    <div class="row head">
                      <strong>{{ skill.label }}</strong>
                      <span class="badge" [class.ok]="skill.status === 'covered'" [class.warn]="skill.status === 'partial'">{{ statusLabel[skill.status] }}</span>
                      @if (skill.azure) { <span class="badge info">☁️ Azure</span> }
                    </div>
                    <p class="small muted">{{ skill.note }}</p>
                    @if (skill.azure) { <p class="small azure">☁️ {{ skill.azure }}</p> }
                    @if (skill.lessons?.length) {
                      <div class="row links">
                        @for (id of skill.lessons ?? []; track id) {
                          <a class="btn sm" [routerLink]="['/lessons', id]" [class.seen]="progress.isDone(id)">
                            {{ progress.isDone(id) ? '✓ ' : '' }}{{ title(id) }}
                          </a>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }
      }
      </div>

      <section class="card fade-in">
        <h2>Hors référentiel : le front</h2>
        <p class="muted small">
          Cette carte est 100 % .NET. Le lab enseigne aussi {{ angular.length }} leçons Angular
          ({{ angularDone() }} validées) — signals, RxJS, routing, forms, DI, interceptors, control flow, composants, directives.
          Un développeur full-stack .NET/Angular a besoin des deux, mais aucun référentiel .NET ne les liste.
        </p>
        <div class="row">
          @for (id of angular; track id) {
            <a class="btn sm" [routerLink]="['/lessons', id]" [class.seen]="progress.isDone(id)">{{ progress.isDone(id) ? '✓ ' : '' }}{{ title(id) }}</a>
          }
        </div>
      </section>

      <section class="card fade-in">
        <h2>Comment lire cette page</h2>
        <ul class="small">
          <li><strong>● Leçon dédiée</strong> — une leçon explique le concept, avec démo live et code réel.</li>
          <li><strong>◐ Partiel</strong> — le lab s'en sert ou l'effleure, mais ne l'enseigne pas. C'est là que la note dit exactement ce qui manque.</li>
          <li><strong>○ À construire</strong> — rien pour l'instant. La note décrit la leçon qu'il faudrait écrire.</li>
          <li><strong>☁️ Azure</strong> — ton abonnement Student rendrait la démo réelle plutôt que simulée.</li>
        </ul>
        <p class="small muted">La progression vient des leçons que tu marques « vue ». Le <a routerLink="/interview">mode entretien</a> te teste dessus.</p>
      </section>
    </div>
  `,
  styles: [`
    .wrap { max-width: 1000px; margin: 0 auto; padding: 1.5rem 2rem 4rem; display: flex; flex-direction: column; gap: 1.25rem; }
    header h1 { margin: .5rem 0; }
    .bar { height: 6px; background: var(--bg-3); border-radius: 99px; overflow: hidden; margin-top: .4rem; }
    .bar.big { height: 10px; margin-top: .75rem; }
    .fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand-2)); transition: width .4s; }
    .next { display: flex; gap: 1rem; align-items: center; justify-content: space-between; border-color: var(--brand); }
    .filters { margin-top: .25rem; }
    /* Timeline: the rail lives in the left gutter so it stays visible between cards,
       and each level's node sits on it. */
    .spine { position: relative; display: flex; flex-direction: column; gap: 1.25rem; padding-left: 3.6rem; }
    .spine::before { content: ''; position: absolute; left: 1.2rem; top: 1.4rem; bottom: 1.4rem; width: 2px;
      background: linear-gradient(180deg, #a78bfa, #fb7185, #86efac, #fcd34d); opacity: .45; border-radius: 2px; }
    .level { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
      background: linear-gradient(180deg, #ffffff06, transparent 30%), var(--bg-2);
      box-shadow: var(--shadow-sm);
      /* visible, not hidden: the timeline node is positioned outside the card */
      overflow: visible; }
    .level-head { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
      border-radius: var(--radius) var(--radius) 0 0;
      background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent); }
    .node { width: 2.4rem; height: 2.4rem; border-radius: 99px; display: grid; place-items: center; font-weight: 800;
      background: var(--accent); color: #080b14; flex: none;
      position: absolute; left: -3.6rem; top: 1rem; z-index: 2;
      box-shadow: 0 0 0 6px var(--bg), 0 0 24px -2px color-mix(in srgb, var(--accent) 75%, transparent); }
    .title { flex: 1; } .title h2 { margin: 0; font-size: 1.15rem; }
    .ring { position: relative; width: 44px; height: 44px; flex: none; }
    .ring svg { transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 3.5; }
    .ring .track { stroke: var(--bg-3); }
    .ring .value { stroke-linecap: round; transition: stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1); }
    .pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: .05rem;
      font-size: .68rem; font-weight: 700; }
    .pct small { font-size: .55rem; opacity: .7; }
    .counts { min-width: 130px; text-align: right; display: flex; flex-direction: column; gap: .2rem; align-items: flex-end; }
    .skills { display: flex; flex-direction: column; overflow: hidden; border-radius: 0 0 var(--radius) var(--radius); }
    .skill { display: flex; gap: .85rem; padding: .85rem 1.25rem; border-bottom: 1px solid #161d2c;
      transition: background .12s; }
    .skill:hover { background: #ffffff05; }
    .skill:last-child { border-bottom: 0; }
    .skill.todo { opacity: .78; }
    .skill.done { background: #052e1618; }
    .mark { width: 1.55rem; height: 1.55rem; border-radius: 99px; display: grid; place-items: center; font-size: .8rem; flex: none;
      border: 1px solid var(--border); background: var(--bg-3); margin-top: .1rem; }
    .skill.done .mark { color: var(--ok); border-color: #14532d; background: #052e16; }
    .mark.covered { color: var(--ok); border-color: #14532d; }
    .mark.partial { color: var(--warn); border-color: #713f12; }
    .mark.todo { color: var(--muted); }
    .body { flex: 1; min-width: 0; }
    .head { gap: .5rem; }
    .links { margin-top: .45rem; }
    .btn.seen { border-color: #14532d; color: #86efac; }
    .azure { color: #7dd3fc; margin: .25rem 0 0; }
    ul.small { padding-left: 1.1rem; } ul.small li { margin: .25rem 0; }
    @media (max-width: 760px) {
      .spine { padding-left: 0; }
      .spine::before { display: none; }
      .node { position: static; }
      .level-head { flex-wrap: wrap; }
      .counts { text-align: left; min-width: 0; align-items: flex-start; }
      .next { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class Roadmap {
  readonly progress = inject(Progress);
  readonly levels = LEVELS;
  readonly angular = ANGULAR_BONUS;
  readonly statusLabel = STATUS_LABEL;
  readonly filter = signal<Filter>('all');

  /** 2πr for r=19, used to drive the progress ring with stroke-dashoffset. */
  readonly circumference = 2 * Math.PI * 19;
  offset = (percent: number) => this.circumference * (1 - percent / 100);

  title = (id: string) => lessonById(id)?.title ?? id;

  /** A skill counts as done when every lesson behind it is marked as seen. */
  isDone = (skill: Skill) => !!skill.lessons?.length && skill.lessons.every(id => this.progress.isDone(id));

  visible(level: Level): Skill[] {
    const f = this.filter();
    return level.skills.filter(s =>
      f === 'all' || (f === 'gaps' ? s.status === 'todo' : s.status !== 'todo'));
  }

  stats(level: Level) {
    const learnable = level.skills.filter(s => s.lessons?.length).length;
    const done = level.skills.filter(s => this.isDone(s)).length;
    return { learnable, done, percent: learnable ? Math.round((done / learnable) * 100) : 0 };
  }

  readonly totals = computed(() => {
    const all = this.levels.flatMap(l => l.skills);
    const count = (s: SkillStatus) => all.filter(x => x.status === s).length;
    return { all: all.length, covered: count('covered'), partial: count('partial'), todo: count('todo') };
  });

  /** Reference coverage: a partial skill counts half. */
  readonly coverage = computed(() => {
    const t = this.totals();
    return Math.round(((t.covered + t.partial * 0.5) / t.all) * 100);
  });

  readonly angularDone = computed(() => this.angular.filter(id => this.progress.isDone(id)).length);

  /** First learnable skill, lowest level first, whose lesson is not marked as seen. */
  readonly nextStep = computed(() => {
    for (const level of this.levels)
      for (const skill of level.skills) {
        const lesson = skill.lessons?.find(id => !this.progress.isDone(id));
        if (lesson) return { level: level.label, skill, lesson };
      }
    return null;
  });
}
