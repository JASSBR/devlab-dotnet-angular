import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { lessonById } from '../lessons/catalog';
import { Progress } from '../shared/progress';
import { MATURITY, MaturityLevel, MaturityTopic, lessonsOfLevel } from './maturity.data';

@Component({
  selector: 'app-maturity',
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <header class="fade-in">
        <span class="badge brand">🪜 Parcours .NET</span>
        <h1>The .NET Maturity Stack</h1>
        <p class="muted">
          Sept niveaux, du C# de base aux systèmes qui tiennent en production. Chaque notion renvoie à la leçon qui
          l'enseigne avec une démo live et le code réel. Suis-les dans l'ordre : chaque niveau suppose le précédent.
        </p>
        <div class="row">
          <span class="badge ok">{{ totals().done }}/{{ totals().lessons }} leçons vues</span>
          <span class="badge">{{ totals().topics }} notions</span>
        </div>
        <div class="bar big"><div class="fill" [style.width.%]="totals().percent"></div></div>
      </header>

      <nav class="axis fade-in" aria-label="Niveaux">
        @for (level of levels; track level.index) {
          <a class="stop" [href]="'#level-' + level.index" [style.--accent]="level.color"
             [class.complete]="stats(level).percent === 100">
            <span class="dot">{{ stats(level).percent === 100 ? '✓' : level.index }}</span>
            <span class="small">{{ level.title }}</span>
          </a>
        }
      </nav>

      @if (next(); as n) {
        <section class="card next fade-in">
          <div>
            <div class="small muted">Prochaine étape · niveau {{ n.level.index }} · {{ n.level.title }}</div>
            <strong>{{ title(n.lesson) }}</strong>
            <p class="small muted" style="margin:.25rem 0 0">Couvre : {{ n.topics }}</p>
          </div>
          <a class="btn primary" [routerLink]="['/lessons', n.lesson]">Ouvrir la leçon →</a>
        </section>
      } @else {
        <section class="card next fade-in"><strong>🎉 Tout le parcours est vu.</strong>
          <a class="btn" routerLink="/interview">Passe-toi au mode entretien →</a></section>
      }

      @for (level of levels; track level.index) {
        <section class="level fade-in" [id]="'level-' + level.index" [style.--accent]="level.color">
          <div class="level-head">
            <div class="node">{{ level.index }}</div>
            <div class="grow">
              <h2>{{ level.title }}</h2>
              <span class="small muted">🎯 {{ level.outcome }}</span>
            </div>
            <span class="badge" [class.ok]="stats(level).percent === 100">{{ stats(level).done }}/{{ stats(level).total }} leçons</span>
          </div>
          <div class="topics">
            @for (topic of level.topics; track topic.label) {
              <a class="topic" [routerLink]="['/lessons', topic.lessons[0]]" [class.seen]="isSeen(topic)"
                 [title]="'Leçon : ' + title(topic.lessons[0])">
                {{ isSeen(topic) ? '✓ ' : '' }}{{ topic.label }}
              </a>
            }
          </div>
          <div class="row lessons">
            @for (id of lessonsOf(level); track id) {
              <a class="btn sm" [routerLink]="['/lessons', id]" [class.seen]="progress.isDone(id)">
                {{ progress.isDone(id) ? '✓ ' : '' }}{{ icon(id) }} {{ title(id) }}
              </a>
            }
          </div>
        </section>
      }

      <p class="small muted">Structure inspirée de « The .NET Maturity Stack » (dipjyotisikder.com). La progression vient des leçons marquées « vue ».</p>
    </div>
  `,
  styles: [`
    .wrap { max-width: 1000px; margin: 0 auto; padding: 1.5rem 2rem 4rem; display: flex; flex-direction: column; gap: 1.25rem; }
    header h1 { margin: .5rem 0; }
    .bar { height: 10px; background: var(--bg-3); border-radius: 99px; overflow: hidden; margin-top: .75rem; }
    .fill { height: 100%; background: linear-gradient(90deg, #4ade80, #60a5fa, #fb7185, #fbbf24, #2dd4bf, #c084fc); transition: width .4s; }
    /* The horizontal axis mirrors the infographic: one stop per level, in order. */
    .axis { display: grid; grid-template-columns: repeat(7, 1fr); gap: .4rem; position: relative; }
    .axis::before { content: ''; position: absolute; left: 7%; right: 7%; top: 1.1rem; height: 2px; background: var(--border); }
    .stop { position: relative; display: flex; flex-direction: column; align-items: center; gap: .35rem; text-align: center;
      text-decoration: none; color: var(--text); }
    .stop .dot { width: 2.2rem; height: 2.2rem; border-radius: 99px; display: grid; place-items: center; font-weight: 800;
      background: var(--bg-2); border: 2px solid var(--accent); color: var(--accent); z-index: 1; }
    .stop.complete .dot { background: var(--accent); color: #080b14; }
    .next { display: flex; gap: 1rem; align-items: center; justify-content: space-between; border-color: var(--brand); }
    .level { border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: var(--radius);
      background: var(--bg-2); padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .8rem; scroll-margin-top: 1rem; }
    .level-head { display: flex; align-items: center; gap: 1rem; }
    .level-head h2 { margin: 0; font-size: 1.1rem; color: var(--accent); }
    .node { width: 2.2rem; height: 2.2rem; border-radius: 99px; display: grid; place-items: center; font-weight: 800;
      background: var(--accent); color: #080b14; flex: none; }
    .grow { flex: 1; }
    .topics { display: flex; flex-wrap: wrap; gap: .4rem; }
    .topic { font-size: .82rem; padding: .25rem .6rem; border-radius: 99px; text-decoration: none; color: var(--text);
      border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
      background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .topic:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
    .topic.seen { border-color: #14532d; color: #86efac; }
    .btn.seen { border-color: #14532d; color: #86efac; }
    @media (max-width: 760px) {
      .wrap { padding: 1rem; }
      .axis { grid-template-columns: repeat(4, 1fr); row-gap: .8rem; }
      .axis::before { display: none; }
      .next, .level-head { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class Maturity {
  readonly progress = inject(Progress);
  readonly levels = MATURITY;
  readonly lessonsOf = lessonsOfLevel;

  title = (id: string) => lessonById(id)?.title ?? id;
  icon = (id: string) => lessonById(id)?.icon ?? '';
  isSeen = (topic: MaturityTopic) => topic.lessons.some(id => this.progress.isDone(id));

  stats(level: MaturityLevel) {
    const ids = lessonsOfLevel(level);
    const done = ids.filter(id => this.progress.isDone(id)).length;
    return { total: ids.length, done, percent: ids.length ? Math.round((done / ids.length) * 100) : 0 };
  }

  readonly totals = computed(() => {
    const ids = [...new Set(this.levels.flatMap(lessonsOfLevel))];
    const done = ids.filter(id => this.progress.isDone(id)).length;
    return {
      lessons: ids.length, done, percent: ids.length ? Math.round((done / ids.length) * 100) : 0,
      topics: this.levels.reduce((n, l) => n + l.topics.length, 0),
    };
  });

  /** The first unseen lesson walking levels in order, with the topics it unlocks there. */
  readonly next = computed(() => {
    for (const level of this.levels) {
      const lesson = lessonsOfLevel(level).find(id => !this.progress.isDone(id));
      if (lesson) {
        const topics = level.topics.filter(t => t.lessons.includes(lesson)).map(t => t.label).join(', ');
        return { level, lesson, topics };
      }
    }
    return null;
  });
}
