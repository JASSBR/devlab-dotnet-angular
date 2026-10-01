import { Injectable, computed, effect, signal } from '@angular/core';
import { QUESTIONS } from './questions';

export interface Attempt { attempts: number; best: number; last: number; lastAt: string; }
type ProgressMap = Record<string, Attempt>;

const KEY = 'devlab.interview.v1';

/** Per-question results, persisted. Score is 0–100. "À revoir" = best score below 60. */
@Injectable({ providedIn: 'root' })
export class InterviewStore {
  private readonly _progress = signal<ProgressMap>(read());
  readonly progress = this._progress.asReadonly();

  readonly answered = computed(() => Object.keys(this._progress()).length);
  readonly average = computed(() => {
    const scores = Object.values(this._progress()).map(a => a.best);
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  });
  readonly toReview = computed(() => QUESTIONS.filter(q => (this._progress()[q.id]?.best ?? -1) < 60 && this._progress()[q.id]).map(q => q.id));
  readonly unseen = computed(() => QUESTIONS.filter(q => !this._progress()[q.id]).map(q => q.id));

  constructor() { effect(() => localStorage.setItem(KEY, JSON.stringify(this._progress()))); }

  record(id: string, score: number) {
    this._progress.update(p => {
      const prev = p[id];
      return { ...p, [id]: { attempts: (prev?.attempts ?? 0) + 1, best: Math.max(prev?.best ?? 0, score), last: score, lastAt: new Date().toISOString() } };
    });
  }
  reset() { this._progress.set({}); }
  of = (id: string) => this._progress()[id];
}

function read(): ProgressMap { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } }
