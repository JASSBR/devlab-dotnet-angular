import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { LESSONS, TRACKS } from '../lessons/catalog';
import { Progress } from './progress';

interface Item {
  kind: 'lesson' | 'question' | 'skill' | 'page';
  label: string;
  hint: string;
  icon: string;
  route: string[];
  /** Extra words that should match but are not displayed. */
  keywords: string;
  done?: boolean;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * ⌘K / Ctrl+K anywhere. Searches lessons, interview questions and roadmap skills
 * in one list — the fastest way around a site with 26 lessons and 51 skills.
 */
@Component({
  selector: 'command-palette',
  template: `
    @if (open()) {
      <div class="scrim" (click)="close()"></div>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Recherche">
        <div class="field">
          <span class="glyph">⌘</span>
          <input #box type="text" placeholder="Chercher une leçon, une question, une compétence…"
                 [value]="query()" (input)="onInput($any($event.target).value)"
                 (keydown)="onKey($event)" autocomplete="off" spellcheck="false">
          <kbd>esc</kbd>
        </div>
        <div class="results" #list>
          @for (item of results(); track item.route.join('/') + item.label; let i = $index) {
            <button class="row" [class.active]="i === cursor()" (click)="go(item)" (mouseenter)="cursor.set(i)">
              <span class="icon">{{ item.icon }}</span>
              <span class="text">
                <span class="label">{{ item.label }}</span>
                <span class="hint">{{ item.hint }}</span>
              </span>
              @if (item.done) { <span class="badge ok">vu</span> }
              <span class="enter">↵</span>
            </button>
          } @empty {
            <div class="empty">Rien pour « {{ query() }} »</div>
          }
        </div>
        <div class="foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
          <span><kbd>↵</kbd> ouvrir</span>
          <span>{{ results().length }} résultat(s)</span>
        </div>
      </div>
    }
  `,
  styles: [`
    .scrim { position: fixed; inset: 0; background: #04060cc0; backdrop-filter: blur(3px); z-index: 60; animation: fade .12s ease-out; }
    .palette {
      position: fixed; z-index: 61; top: 12vh; left: 50%; transform: translateX(-50%);
      width: min(680px, calc(100vw - 2rem)); background: var(--surface); border: 1px solid var(--border-strong);
      border-radius: 16px; box-shadow: var(--shadow-lg); overflow: hidden;
      animation: pop .14s cubic-bezier(.2,.9,.3,1.2);
    }
    .field { display: flex; align-items: center; gap: .7rem; padding: .9rem 1rem; border-bottom: 1px solid var(--border); }
    .glyph { color: var(--brand-2); font-weight: 700; }
    .field input { flex: 1; background: none; border: 0; padding: 0; font-size: 1rem; color: var(--text); }
    .field input:focus { outline: none; box-shadow: none; }
    .results { max-height: 52vh; overflow-y: auto; padding: .35rem; }
    .row { display: flex; align-items: center; gap: .75rem; width: 100%; text-align: left; background: none; border: 0;
      padding: .55rem .7rem; border-radius: 10px; color: var(--text); }
    .row.active { background: var(--brand-soft); }
    .row .icon { width: 1.4rem; text-align: center; flex: none; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .label { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hint { font-size: .75rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .enter { opacity: 0; color: var(--muted); font-size: .8rem; }
    .row.active .enter { opacity: 1; }
    .empty { padding: 2rem; text-align: center; color: var(--muted); }
    .foot { display: flex; gap: 1rem; padding: .5rem .9rem; border-top: 1px solid var(--border); font-size: .72rem; color: var(--muted); }
    .foot span:last-child { margin-left: auto; }
    kbd { font-family: var(--mono); font-size: .68rem; background: var(--bg-3); border: 1px solid var(--border); padding: .05rem .3rem; border-radius: 4px; margin-right: .15rem; }
    @keyframes pop { from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(.985) } to { opacity: 1; transform: translateX(-50%) none } }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    @media (prefers-reduced-motion: reduce) { .palette, .scrim { animation: none } }
  `],
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly progress = inject(Progress);
  private readonly doc = inject(DOCUMENT);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  readonly open = signal(false);
  readonly query = signal('');
  readonly cursor = signal(0);

  /**
   * Lessons and pages are already in the main bundle. Interview questions (85 kB) and
   * the roadmap data are pulled in only the first time the palette opens, so the
   * initial page load stays small.
   */
  private readonly items = signal<Item[]>([
    ...LESSONS.map<Item>(l => ({
      kind: 'lesson', label: l.title, icon: l.icon, route: ['/lessons', l.id],
      hint: `${TRACKS[l.track].label} · ${l.summary}`, keywords: l.concepts.join(' ') + ' ' + l.id,
    })),
    { kind: 'page', label: 'Mode carrière', icon: '🧭', route: ['/roadmap'], hint: 'Le référentiel .NET et ce que le lab couvre', keywords: 'roadmap junior middle senior architect' },
    { kind: 'page', label: 'Mode entretien', icon: '🎤', route: ['/interview'], hint: '53 questions, QCM et ouvertes', keywords: 'interview quiz questions' },
    { kind: 'page', label: 'Accueil', icon: '🏠', route: ['/'], hint: 'Vue d’ensemble du lab', keywords: 'home accueil' },
  ]);
  private enriched = false;

  private async enrich() {
    if (this.enriched) return;
    this.enriched = true;
    const [{ QUESTIONS, TOPICS }, { LEVELS }] = await Promise.all([
      import('../interview/questions'),
      import('../roadmap/roadmap.data'),
    ]);
    this.items.update(current => [
      ...current,
      ...QUESTIONS.map<Item>(q => ({
        kind: 'question', label: q.question, icon: '🎤', route: ['/interview'],
        hint: `Entretien · ${TOPICS[q.topic].label} · niveau ${q.level}`, keywords: q.id,
      })),
      ...LEVELS.flatMap(level => level.skills.map<Item>(s => ({
        kind: 'skill', label: s.label, icon: s.status === 'covered' ? '●' : s.status === 'partial' ? '◐' : '○',
        route: ['/roadmap'], hint: `Carrière · ${level.label} · ${s.note.slice(0, 70)}…`, keywords: level.label,
      }))),
    ]);
  }

  readonly results = computed(() => {
    const q = fold(this.query().trim());
    const pool = this.items().map(i => ({ ...i, done: i.kind === 'lesson' && this.progress.isDone(i.route[1]) }));
    if (!q) return pool.filter(i => i.kind === 'page' || i.kind === 'lesson').slice(0, 12);

    return pool
      .flatMap(item => {
        const label = fold(item.label);
        const hay = `${label} ${fold(item.hint)} ${fold(item.keywords)}`;
        if (!hay.includes(q)) return [];
        // Rank: title match first, then earlier position, lessons before questions.
        const score = (label.startsWith(q) ? 0 : label.includes(q) ? 100 : 400)
          + hay.indexOf(q)
          + ({ page: 0, lesson: 5, skill: 30, question: 40 })[item.kind];
        return [{ item, score }];
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 30)
      .map(x => x.item);
  });

  constructor() {
    this.doc.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'Escape' && this.open()) this.close();
    });
    // Focus the input once the dialog exists in the DOM.
    effect(() => { if (this.open()) queueMicrotask(() => this.box()?.nativeElement.focus()); });
  }

  toggle() {
    if (this.open()) return this.close();
    this.query.set(''); this.cursor.set(0); this.open.set(true);
    void this.enrich();
  }
  close() { this.open.set(false); }
  onInput(value: string) { this.query.set(value); this.cursor.set(0); }

  onKey(event: KeyboardEvent) {
    const max = this.results().length - 1;
    if (event.key === 'ArrowDown') { event.preventDefault(); this.cursor.update(c => (c >= max ? 0 : c + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this.cursor.update(c => (c <= 0 ? max : c - 1)); }
    else if (event.key === 'Enter') { const item = this.results()[this.cursor()]; if (item) this.go(item); }
  }

  go(item: Item) { this.close(); this.router.navigate(item.route); }
}
