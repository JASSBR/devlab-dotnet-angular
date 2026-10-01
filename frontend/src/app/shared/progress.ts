import { Injectable, computed, effect, signal } from '@angular/core';
import { LESSONS } from '../lessons/catalog';

/** Which lessons the learner marked as done — a Set in a signal, persisted in localStorage. */
@Injectable({ providedIn: 'root' })
export class Progress {
  private readonly done = signal<Set<string>>(new Set(JSON.parse(localStorage.getItem('devlab.progress') ?? '[]')));

  readonly count = computed(() => this.done().size);
  readonly percent = computed(() => Math.round((this.count() / LESSONS.length) * 100));

  constructor() {
    effect(() => localStorage.setItem('devlab.progress', JSON.stringify([...this.done()])));
  }

  isDone = (id: string) => this.done().has(id);
  markDone(id: string) { this.done.update(s => new Set(s).add(id)); }   // new Set → new reference → signal fires
  reset() { this.done.set(new Set()); }
}
