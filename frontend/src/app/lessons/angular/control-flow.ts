import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

type Status = 'idle' | 'loading' | 'ok' | 'error';
interface Task { id: number; title: string; done: boolean; }

/** Deliberately heavy: rendered only when @defer decides to. */
@Component({
  selector: 'heavy-widget',
  template: `<div class="callout ok">🏋️ <strong>heavy-widget</strong> rendu à {{ at }} — ce composant vit dans un chunk séparé, chargé par <code>&#64;defer</code>.</div>`,
})
export class HeavyWidget { readonly at = new Date().toLocaleTimeString(); }

@Component({
  selector: 'lesson-control-flow',
  imports: [LessonShell, HeavyWidget],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le control flow natif (v17+)</h3>
        <p><code>&#64;if / &#64;for / &#64;switch</code> remplacent <code>*ngIf / *ngFor / ngSwitch</code> : plus rapides, typés, sans import.
        <code>&#64;for</code> exige un <code>track</code> — c'est ce qui permet de ne pas re-créer le DOM quand la liste change.
        <code>&#64;let</code> déclare une variable de template.</p>
        <h3>&#64;defer</h3>
        <p>Découpe le bundle : le bloc n'est compilé dans un chunk séparé et chargé que sur un <em>trigger</em> :
        <code>on viewport</code>, <code>on interaction</code>, <code>on idle</code>, <code>on timer</code>, <code>when condition</code>. Avec <code>prefetch</code> pour anticiper.</p>
        <h3>Zoneless</h3>
        <p>Sans zone.js, Angular ne « devine » plus quand re-rendre : il se déclenche sur les <strong>signals</strong>, les événements du template,
        <code>async</code> pipe, et <code>markForCheck</code>. Modifier une propriété classique dans un <code>setTimeout</code> ne rafraîchit plus la vue. La démo ci-dessous le prouve.</p>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>&#64;for avec track + &#64;if / &#64;else + &#64;let</h3>
          @let remaining = tasks().length - doneCount();
          <div class="row">
            <input #t placeholder="Nouvelle tâche" (keydown.enter)="add(t.value); t.value = ''">
            <button class="sm" (click)="add(t.value); t.value = ''">Ajouter</button>
            <span class="badge">{{ remaining }} restante(s)</span>
          </div>
          <ul>
            @for (task of tasks(); track task.id; let i = $index, last = $last) {
              <li [class.done]="task.done">
                <input type="checkbox" [checked]="task.done" (change)="toggle(task.id)"> {{ i + 1 }}. {{ task.title }}
                @if (last) { <span class="badge">dernière</span> }
              </li>
            } @empty {
              <li class="muted">Aucune tâche — le bloc &#64;empty s'affiche.</li>
            }
          </ul>
        </div>

        <div class="card">
          <h3>&#64;switch sur un état</h3>
          <div class="row">
            @for (s of statuses; track s) { <button class="sm" [class.primary]="status() === s" (click)="status.set(s)">{{ s }}</button> }
          </div>
          @switch (status()) {
            @case ('loading') { <p class="pulse">⏳ Chargement…</p> }
            @case ('ok') { <p class="badge ok">✓ Données prêtes</p> }
            @case ('error') { <p class="badge err">✗ Erreur</p> }
            @default { <p class="muted">Idle.</p> }
          }
        </div>

        <div class="card">
          <h3>&#64;defer</h3>
          <div class="grid-2">
            <div>
              <p class="small muted">on interaction (clique le placeholder) + prefetch on idle :</p>
              @defer (on interaction; prefetch on idle) {
                <heavy-widget />
              } @placeholder { <button>Charger le widget</button> }
              @loading (minimum 400ms) { <span class="pulse">chargement du chunk…</span> }
            </div>
            <div>
              <p class="small muted">when condition (signal) :</p>
              <button class="sm" (click)="ready.set(true)">ready = true</button>
              @defer (when ready()) { <heavy-widget /> } @placeholder { <p class="muted">en attente de ready()</p> }
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Zoneless : signal vs propriété</h3>
          <div class="row">
            <button (click)="startTimers()">Lancer 2 timers (1 s)</button>
            <span class="badge brand">signal : {{ viaSignal() }}</span>
            <span class="badge warn">propriété : {{ viaProperty }}</span>
          </div>
          <p class="small muted">Les deux compteurs s'incrémentent en mémoire, mais seul le signal notifie Angular. La propriété ne se met à jour à l'écran que lorsqu'autre chose déclenche un rendu (clique un bouton).</p>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`li.done { text-decoration: line-through; color: var(--muted); } ul { list-style: none; padding: 0; }`],
})
export class ControlFlowLesson {
  readonly lesson = lessonById('control-flow')!;
  readonly statuses: Status[] = ['idle', 'loading', 'ok', 'error'];
  readonly status = signal<Status>('idle');
  readonly ready = signal(false);

  private seq = 3;
  readonly tasks = signal<Task[]>([
    { id: 1, title: 'Lire la leçon', done: true },
    { id: 2, title: 'Ouvrir le panneau Réseau', done: false },
    { id: 3, title: 'Modifier un fichier et recharger', done: false },
  ]);
  readonly doneCount = computed(() => this.tasks().filter(t => t.done).length);

  add(title: string) { if (title.trim()) this.tasks.update(t => [...t, { id: ++this.seq, title: title.trim(), done: false }]); }
  toggle(id: number) { this.tasks.update(t => t.map(x => x.id === id ? { ...x, done: !x.done } : x)); }

  readonly viaSignal = signal(0);
  viaProperty = 0;
  startTimers() {
    setInterval(() => this.viaSignal.update(n => n + 1), 1000);
    setInterval(() => this.viaProperty++, 1000);     // nobody tells Angular → no render
  }
}
