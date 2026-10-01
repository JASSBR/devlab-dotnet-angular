import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Diagram } from '../shared/diagrams';
import { InterviewStore } from './interview.store';
import { KeyPoint, LEVELS, Level, OpenQuestion, QUESTIONS, Question, TOPICS, Topic } from './questions';

type Phase = 'setup' | 'answer' | 'review' | 'summary';
interface SessionResult { q: Question; score: number; }

/** Accent- and case-insensitive containment check used to auto-detect key points. */
export const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
export const detects = (answer: string, kp: KeyPoint) => { const a = normalize(answer); return kp.keywords.some(k => a.includes(normalize(k))); };

@Component({
  selector: 'app-interview',
  imports: [RouterLink, Diagram],
  template: `
    <div class="wrap">
      <header class="fade-in">
        <span class="badge brand">🎤 Mode entretien</span>
        <h1>Simulation d'entretien technique</h1>
        <p class="muted">Je pose la question, tu réponds (à l'oral ou dans la zone de texte), puis on débriefe : correction, explication, schéma, et la leçon à relire.
        Pour les questions ouvertes, les points-clés sont <strong>détectés dans ta réponse</strong>, et c'est toi qui valides — comme un vrai debrief.</p>
        <div class="row stats">
          <span class="badge">{{ store.answered() }}/{{ all.length }} questions vues</span>
          <span class="badge" [class.ok]="store.average() >= 70" [class.warn]="store.average() < 70 && store.answered() > 0">moyenne {{ store.average() }}%</span>
          <span class="badge" [class.err]="store.toReview().length > 0">{{ store.toReview().length }} à revoir</span>
          <button class="sm" (click)="store.reset()">réinitialiser</button>
        </div>
      </header>

      @switch (phase()) {
        @case ('setup') {
          <section class="card fade-in">
            <h2>Choisis ton entretien</h2>
            <div class="filters">
              <div>
                <label>Thèmes</label>
                <div class="row">
                  @for (t of topics; track t[0]) {
                    <button class="sm" [class.primary]="topicFilter().has(t[0])" (click)="toggle(topicFilter, t[0])">{{ t[1].label }}</button>
                  }
                </div>
              </div>
              <div>
                <label>Niveau</label>
                <div class="row">
                  @for (l of levels; track l[0]) {
                    <button class="sm" [class.primary]="levelFilter().has(asLevel(l[0]))" (click)="toggle(levelFilter, asLevel(l[0]))">{{ l[1] }}</button>
                  }
                </div>
              </div>
              <div>
                <label>Sélection</label>
                <div class="row">
                  <button class="sm" [class.primary]="pool() === 'all'" (click)="pool.set('all')">toutes ({{ filtered().length }})</button>
                  <button class="sm" [class.primary]="pool() === 'unseen'" (click)="pool.set('unseen')">jamais vues ({{ countUnseen() }})</button>
                  <button class="sm" [class.primary]="pool() === 'review'" (click)="pool.set('review')">à revoir ({{ countReview() }})</button>
                </div>
              </div>
            </div>
            <div class="row" style="margin-top:1rem">
              <button class="primary" (click)="start(10)" [disabled]="candidates().length === 0">Session de {{ min(10, candidates().length) }} questions</button>
              <button (click)="start(1)" [disabled]="candidates().length === 0">Une question au hasard</button>
              <button (click)="start(candidates().length)" [disabled]="candidates().length === 0">Tout enchaîner ({{ candidates().length }})</button>
            </div>
          </section>

          <section class="card fade-in">
            <h2>Toutes les questions</h2>
            <table>
              <tr><th>#</th><th>thème</th><th>niv.</th><th>question</th><th>type</th><th>meilleur</th></tr>
              @for (q of filtered(); track q.id; let i = $index) {
                <tr class="clickable" (click)="startWith(q)">
                  <td class="muted">{{ i + 1 }}</td>
                  <td><span class="dot" [style.background]="topicColor(q.topic)"></span> {{ topicLabel(q.topic) }}</td>
                  <td>{{ levels[q.level - 1][1] }}</td>
                  <td>{{ q.question }}</td>
                  <td><span class="badge">{{ q.type === 'mcq' ? 'QCM' : 'ouverte' }}</span></td>
                  <td>@if (store.of(q.id); as a) { <span class="badge" [class.ok]="a.best >= 70" [class.warn]="a.best >= 40 && a.best < 70" [class.err]="a.best < 40">{{ a.best }}%</span> } @else { <span class="muted">—</span> }</td>
                </tr>
              }
            </table>
          </section>
        }

        @case ('answer') {
          @if (current(); as q) {
            <section class="card question fade-in">
              <div class="row">
                <span class="badge" [style.borderColor]="topicColor(q.topic)" [style.color]="topicColor(q.topic)">{{ topicLabel(q.topic) }}</span>
                <span class="badge">{{ levels[q.level - 1][1] }}</span>
                <span class="badge">{{ q.type === 'mcq' ? 'QCM' : 'question ouverte' }}</span>
                <span class="muted small">question {{ index() + 1 }}/{{ session().length }}</span>
              </div>
              <h2 class="q">{{ q.question }}</h2>

              @if (q.type === 'mcq') {
                <div class="choices">
                  @for (c of q.choices; track $index) {
                    <label class="choice" [class.selected]="choice() === $index">
                      <input type="radio" name="mcq" [checked]="choice() === $index" (change)="choice.set($index)"> <span>{{ c }}</span>
                    </label>
                  }
                </div>
                <div class="row">
                  <button class="primary" (click)="submitMcq()" [disabled]="choice() === null">Valider</button>
                  <button (click)="giveUp()">Je ne sais pas</button>
                </div>
              } @else {
                <p class="muted small">Réponds comme à l'oral : 4 à 8 phrases, les mots-clés comptent. Tu peux aussi répondre à voix haute et juste cliquer « Débrief ».</p>
                <textarea rows="8" [value]="text()" (input)="text.set($any($event.target).value)" placeholder="Ta réponse…"></textarea>
                <div class="row">
                  <button class="primary" (click)="submitOpen()">Débrief</button>
                  <button (click)="giveUp()">Je ne sais pas → montre-moi la réponse</button>
                </div>
              }
            </section>
          }
        }

        @case ('review') {
          @if (current(); as q) {
            <section class="card fade-in">
              <div class="row">
                <span class="badge" [style.borderColor]="topicColor(q.topic)" [style.color]="topicColor(q.topic)">{{ topicLabel(q.topic) }}</span>
                <span class="muted small">question {{ index() + 1 }}/{{ session().length }}</span>
              </div>
              <h2 class="q">{{ q.question }}</h2>

              @if (q.type === 'mcq') {
                <div class="verdict" [class.ok]="score() === 100" [class.err]="score() !== 100">
                  {{ score() === 100 ? '✓ Bonne réponse' : choice() === null ? '— Réponse révélée' : '✗ Mauvaise réponse' }}
                </div>
                <div class="choices">
                  @for (c of q.choices; track $index) {
                    <div class="choice" [class.correct]="$index === q.answer" [class.wrong]="choice() === $index && $index !== q.answer">
                      {{ $index === q.answer ? '✓' : choice() === $index ? '✗' : '·' }} {{ c }}
                    </div>
                  }
                </div>
              } @else {
                <h3>Points-clés attendus — coche ce que tu as vraiment dit</h3>
                <p class="muted small">« détecté » = trouvé dans ton texte par mots-clés. Sois honnête avec toi-même : c'est toi que tu entraînes.</p>
                <div class="keypoints">
                  @for (kp of openQuestion().keyPoints; track $index) {
                    <label class="kp" [class.on]="checked()[$index]">
                      <input type="checkbox" [checked]="checked()[$index]" (change)="toggleKp($index)">
                      <span class="kp-text">{{ kp.text }}</span>
                      @if (detected()[$index]) { <span class="badge ok">détecté</span> } @else { <span class="badge">pas trouvé</span> }
                    </label>
                  }
                </div>
                <div class="verdict" [class.ok]="score() >= 70" [class.warn]="score() >= 40 && score() < 70" [class.err]="score() < 40">
                  Score : {{ score() }}% ({{ checkedCount() }}/{{ openQuestion().keyPoints.length }} points)
                </div>
                @if (text().trim()) {
                  <details><summary class="muted small">Ta réponse</summary><pre class="json">{{ text() }}</pre></details>
                }
                <h3>Réponse attendue à l'oral</h3>
                <div class="explain" [innerHTML]="openQuestion().model"></div>
              }

              @if (q.explanation) {
                <h3>Explication</h3>
                <div class="explain" [innerHTML]="q.explanation"></div>
              }
              @if (q.diagram) { <diagram [key]="q.diagram" /> }
              @if (q.lesson) { <p><a [routerLink]="['/lessons', q.lesson]" class="btn sm">📖 Revoir la leçon associée</a></p> }

              <div class="row" style="margin-top:1rem">
                <button class="primary" (click)="next()">{{ index() + 1 < session().length ? 'Question suivante →' : 'Voir le bilan' }}</button>
                <button (click)="phase.set('setup')">Arrêter</button>
              </div>
            </section>
          }
        }

        @case ('summary') {
          <section class="card fade-in">
            <h2>Bilan de la session</h2>
            <div class="verdict" [class.ok]="sessionAverage() >= 70" [class.warn]="sessionAverage() >= 40 && sessionAverage() < 70" [class.err]="sessionAverage() < 40">
              Moyenne : {{ sessionAverage() }}% sur {{ results().length }} question(s)
            </div>
            <table>
              <tr><th>question</th><th>score</th><th></th></tr>
              @for (r of results(); track r.q.id) {
                <tr><td>{{ r.q.question }}</td>
                  <td><span class="badge" [class.ok]="r.score >= 70" [class.warn]="r.score >= 40 && r.score < 70" [class.err]="r.score < 40">{{ r.score }}%</span></td>
                  <td>@if (r.q.lesson) { <a [routerLink]="['/lessons', r.q.lesson]" class="small">leçon</a> }</td></tr>
              }
            </table>
            <div class="row" style="margin-top:1rem">
              <button class="primary" (click)="retryFailed()" [disabled]="failed().length === 0">Rejouer les ratées ({{ failed().length }})</button>
              <button (click)="phase.set('setup')">Nouvelle session</button>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .wrap { max-width: 980px; margin: 0 auto; padding: 1.5rem 2rem 4rem; display: flex; flex-direction: column; gap: 1rem; }
    header h1 { margin-top: .5rem; }
    .stats { margin-top: .5rem; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .q { font-size: 1.3rem; margin: .75rem 0 1rem; line-height: 1.35; }
    .choices { display: flex; flex-direction: column; gap: .5rem; margin-bottom: 1rem; }
    .choice { display: flex; gap: .6rem; align-items: flex-start; padding: .7rem .9rem; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; background: var(--bg-3); }
    .choice:hover { border-color: var(--brand); }
    .choice.selected { border-color: var(--brand); background: #1e1b3a; }
    .choice.correct { border-color: var(--ok); background: #052e16; }
    .choice.wrong { border-color: var(--err); background: #2a0808; }
    .choice input { margin-top: .25rem; }
    textarea { width: 100%; margin-bottom: .75rem; font-family: inherit; line-height: 1.5; }
    .verdict { padding: .7rem 1rem; border-radius: 10px; font-weight: 700; margin: .75rem 0; background: var(--bg-3); border: 1px solid var(--border); }
    .verdict.ok { border-color: var(--ok); color: #86efac; } .verdict.warn { border-color: var(--warn); color: #fde68a; } .verdict.err { border-color: var(--err); color: #fca5a5; }
    .keypoints { display: flex; flex-direction: column; gap: .4rem; }
    .kp { display: flex; align-items: center; gap: .6rem; padding: .5rem .8rem; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
    .kp.on { border-color: var(--ok); background: #052e1633; }
    .kp-text { flex: 1; }
    .explain { color: #c9d2e3; } .explain ::ng-deep p { margin: .4rem 0; }
    .clickable { cursor: pointer; } .clickable:hover td { background: var(--bg-3); }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 99px; margin-right: .2rem; }
    details { margin: .5rem 0; }
  `],
})
export class Interview {
  readonly store = inject(InterviewStore);
  readonly all = QUESTIONS;
  readonly topics = Object.entries(TOPICS) as [Topic, { label: string; color: string }][];
  readonly levels = Object.entries(LEVELS) as [string, string][];
  readonly min = Math.min;

  // ── setup ──
  readonly topicFilter = signal(new Set<Topic>(['angular', 'dotnet', 'auth', 'architecture']));
  readonly levelFilter = signal(new Set<Level>([1, 2, 3]));
  readonly pool = signal<'all' | 'unseen' | 'review'>('all');
  readonly filtered = computed(() => this.all.filter(q => this.topicFilter().has(q.topic) && this.levelFilter().has(q.level)));
  readonly countUnseen = computed(() => this.filtered().filter(q => !this.store.of(q.id)).length);
  readonly countReview = computed(() => this.filtered().filter(q => this.store.toReview().includes(q.id)).length);
  readonly candidates = computed(() => {
    const p = this.pool();
    return this.filtered().filter(q => p === 'all' || (p === 'unseen' ? !this.store.of(q.id) : this.store.toReview().includes(q.id)));
  });

  // ── session ──
  readonly phase = signal<Phase>('setup');
  readonly session = signal<Question[]>([]);
  readonly index = signal(0);
  readonly current = computed(() => this.session()[this.index()]);
  readonly openQuestion = computed(() => this.current() as OpenQuestion);
  readonly results = signal<SessionResult[]>([]);
  readonly sessionAverage = computed(() => { const r = this.results(); return r.length ? Math.round(r.reduce((a, b) => a + b.score, 0) / r.length) : 0; });
  readonly failed = computed(() => this.results().filter(r => r.score < 70).map(r => r.q));

  // ── answer state ──
  readonly choice = signal<number | null>(null);
  readonly text = signal('');
  readonly detected = signal<boolean[]>([]);
  readonly checked = signal<boolean[]>([]);
  readonly checkedCount = computed(() => this.checked().filter(Boolean).length);
  readonly score = signal(0);

  toggle<T>(set: ReturnType<typeof signal<Set<T>>>, value: T) {
    set.update(s => { const n = new Set(s); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }
  asLevel = (l: string) => +l as Level;
  topicLabel = (t: Topic) => TOPICS[t].label;
  topicColor = (t: Topic) => TOPICS[t].color;

  start(count: number) {
    // Shuffle, but put "à revoir" and unseen first so a short session is useful.
    const weight = (q: Question) => (this.store.toReview().includes(q.id) ? 0 : !this.store.of(q.id) ? 1 : 2) + Math.random();
    const picked = [...this.candidates()].sort((a, b) => weight(a) - weight(b)).slice(0, count);
    this.launch(picked);
  }
  startWith(q: Question) { this.launch([q]); }
  private launch(list: Question[]) {
    this.session.set(list); this.index.set(0); this.results.set([]); this.resetAnswer(); this.phase.set('answer');
  }

  submitMcq() {
    const q = this.current(); if (q.type !== 'mcq') return;
    this.finish(this.choice() === q.answer ? 100 : 0);
  }
  submitOpen() {
    const q = this.openQuestion();
    const det = q.keyPoints.map(kp => detects(this.text(), kp));
    this.detected.set(det); this.checked.set([...det]);
    this.score.set(this.percent(det));
    this.phase.set('review');
  }
  giveUp() {
    const q = this.current();
    if (q.type === 'open') { this.detected.set(q.keyPoints.map(() => false)); this.checked.set(q.keyPoints.map(() => false)); }
    this.choice.set(null);
    this.finish(0);
  }
  toggleKp(i: number) {
    this.checked.update(c => c.map((v, j) => j === i ? !v : v));
    this.score.set(this.percent(this.checked()));
  }
  private percent(flags: boolean[]) { return flags.length ? Math.round((flags.filter(Boolean).length / flags.length) * 100) : 0; }
  private finish(score: number) { this.score.set(score); this.phase.set('review'); }

  next() {
    const q = this.current();
    this.store.record(q.id, this.score());                       // persist best/last
    this.results.update(r => [...r, { q, score: this.score() }]);
    if (this.index() + 1 < this.session().length) { this.index.update(i => i + 1); this.resetAnswer(); this.phase.set('answer'); }
    else this.phase.set('summary');
  }
  retryFailed() { this.launch(this.failed()); }

  private resetAnswer() { this.choice.set(null); this.text.set(''); this.detected.set([]); this.checked.set([]); this.score.set(0); }
}
