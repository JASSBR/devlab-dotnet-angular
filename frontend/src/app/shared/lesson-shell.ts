import { Component, computed, inject, input } from '@angular/core';
import { ApiStatus } from '../core/http/api-status';
import { Lesson, TRACKS } from '../lessons/catalog';
import { RouterLink } from '@angular/router';
import { CodeViewer } from './code-viewer';
import { Progress } from './progress';

/**
 * Layout shared by every lesson: header + concepts, an "explain" slot, a
 * "demo" slot, and the real source files. Content projection with selectors.
 */
@Component({
  selector: 'lesson-shell',
  imports: [CodeViewer, RouterLink],
  template: `
    <header class="head fade-in">
      <div class="row">
        <span class="badge" [class]="'badge ' + lesson().track">{{ trackLabel() }}</span>
        @if (progress.isDone(lesson().id)) { <span class="badge ok">✓ vu</span> }
      </div>
      <h1>{{ lesson().icon }} {{ lesson().title }}</h1>
      <p class="muted">{{ lesson().summary }}</p>
      <div class="row concepts">
        @for (c of lesson().concepts; track c) { <code>{{ c }}</code> }
      </div>
    </header>

    <section class="explain fade-in"><ng-content select="[explain]" /></section>

    <section class="demo fade-in">
      <div class="demo-head"><span class="dot" [class.off]="api.isOffline()"></span> Démo live — ça tape sur la vraie API</div>
      @if (api.isOffline()) {
        <div class="callout warn">
          <strong>L'API .NET n'est pas joignable.</strong> Les explications, le code source ci-dessous et le
          <a routerLink="/interview">mode entretien</a> fonctionnent sans elle ; les boutons de cette démo, non.
          Pour tout faire tourner en local : <code>./dev.sh</code> à la racine du repo.
          <button class="sm" (click)="api.probe()">Réessayer</button>
        </div>
      }
      <ng-content select="[demo]" />
    </section>

    <section class="code fade-in">
      <h2>Le code qui tourne</h2>
      <p class="muted small">Ces fichiers sont lus depuis le disque par <code>GET /api/source</code>. Modifie-les, sauvegarde, recharge : c'est vivant.</p>
      <code-viewer [files]="lesson().files" />
    </section>

    <footer class="row">
      <button class="primary" (click)="progress.markDone(lesson().id)" [disabled]="progress.isDone(lesson().id)">
        {{ progress.isDone(lesson().id) ? 'Leçon validée ✓' : 'Marquer comme vue' }}
      </button>
      <ng-content select="[next]" />
    </footer>
  `,
  styles: [`
    :host { display: block; max-width: 1100px; margin: 0 auto; padding: 1.5rem 2rem 4rem; }
    .head { margin-bottom: 1.5rem; }
    .concepts { margin-top: .5rem; }
    .explain { margin-bottom: 1.5rem; }
    .explain ::ng-deep h3 { margin-top: 1.1rem; }
    .explain ::ng-deep ul { padding-left: 1.2rem; }
    .demo { border: 1px solid #2f3b58; border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.5rem; background: linear-gradient(180deg, #121a2c, var(--bg-2)); }
    .demo-head { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--brand-2); font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: .5rem; }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--ok); box-shadow: 0 0 0 4px #22c55e33; }
    .dot.off { background: var(--warn); box-shadow: 0 0 0 4px #f59e0b33; }
    .code { margin-bottom: 1.5rem; }
    footer { margin-top: 1rem; }
  `],
})
export class LessonShell {
  readonly lesson = input.required<Lesson>();
  readonly progress = inject(Progress);
  readonly api = inject(ApiStatus);
  readonly trackLabel = computed(() => TRACKS[this.lesson().track].label);
}
