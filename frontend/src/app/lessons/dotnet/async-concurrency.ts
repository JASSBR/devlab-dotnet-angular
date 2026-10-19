import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface IoCall { name: string; delayMs: number; threadBefore: number; threadAfter: number; }
interface WhenAll { sequentialMs: number; parallelMs: number; calls: IoCall[]; }
interface WhenAny { winner: 'service' | 'timeout'; elapsedMs: number; serviceMs: number; timeoutMs: number; }
interface JobSpan { job: number; startMs: number; endMs: number; inFlightAtStart: number; }
interface Throttle { maxConcurrency: number; observedMaxInFlight: number; totalMs: number; jobs: JobSpan[]; }
interface ChannelEvent { atMs: number; kind: 'produced' | 'blocked' | 'consumed'; item: number; buffered: number; }
interface ChannelRun { capacity: number; producerWaits: number; totalMs: number; events: ChannelEvent[]; }
interface StreamItem { index: number; producedAt: string; thread: number; }
interface SlowRun { runId: string; status: 'completed' | 'cancelled'; stepReached: number; steps: number; at: string; }
interface ValueTaskRun { key: string; value: number; completedSynchronously: boolean; ms: number; taskBytes: number; valueTaskBytes: number; iterations: number; }
interface Race { mode: string; expected: number; actual: number; lost: number; ms: number; processorCount: number; }
interface PoolSnapshot { threadCount: number; pendingWorkItems: number; completedWorkItems: number; availableWorkerThreads: number; availableIoThreads: number; minWorkerThreads: number; maxWorkerThreads: number; processorCount: number; }
interface PoolLoad { mode: string; n: number; ms: number; totalMs: number; avgStartDelayMs: number; maxStartDelayMs: number; peakThreadCount: number; peakPendingWorkItems: number; before: PoolSnapshot; after: PoolSnapshot; }

/**
 * Incremental parser for a streamed JSON array of objects: `[{…},{…}` arrives in arbitrary
 * chunks, each element is emitted as soon as its closing brace is seen. Exported for the spec.
 */
export class JsonArrayStream<T> {
  private buf = '';
  private pos = 0;
  private depth = 0;
  private start = -1;
  private inString = false;
  private escaped = false;

  push(chunk: string): T[] {
    this.buf += chunk;
    const out: T[] = [];
    for (; this.pos < this.buf.length; this.pos++) {
      const c = this.buf[this.pos];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') this.inString = false;
        continue;
      }
      if (c === '"') this.inString = true;
      else if (c === '{' || c === '[') {
        if (this.depth === 1) this.start = this.pos;   // depth 1 = directly inside the top-level array
        this.depth++;
      } else if (c === '}' || c === ']') {
        this.depth--;
        if (this.depth === 1 && this.start >= 0) {
          out.push(JSON.parse(this.buf.slice(this.start, this.pos + 1)) as T);
          this.start = -1;
        }
      }
    }
    // Keep only the unfinished element in memory.
    const keepFrom = this.start >= 0 ? this.start : this.buf.length;
    this.buf = this.buf.slice(keepFrom);
    this.pos -= keepFrom;
    if (this.start >= 0) this.start = 0;
    return out;
  }
}

@Component({
  selector: 'lesson-async-concurrency',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>async/await : ce qui se passe vraiment</h3>
        <p>Le compilateur réécrit une méthode <code>async</code> en <strong>machine à états</strong> (<code>IAsyncStateMachine</code>) : chaque <code>await</code> est un point de reprise.
        Si la tâche attendue n'est pas terminée, la méthode <em>retourne</em> immédiatement une <code>Task</code> inachevée et le thread repart au pool servir une autre requête.
        Quand l'I/O se termine (IOCP / epoll / timer), la <em>continuation</em> est planifiée sur n'importe quel thread du pool. Pendant l'attente, <strong>aucun thread n'est occupé</strong> — c'est tout l'intérêt : quelques dizaines de threads servent des milliers de requêtes qui attendent la base.</p>
        <pre class="json">var user = await db.Users.FindAsync(id, ct);   // ① thread rendu au pool pendant la requête SQL
var orders = await orders.ListAsync(id, ct);   // ② reprise ici, peut-être sur un AUTRE thread
return new Dashboard(user, orders);            // ③ la Task retournée à l'appelant se complète</pre>
        <ul>
          <li><strong>Séquentiel vs <code>Task.WhenAll</code></strong> : deux <code>await</code> à la suite = la somme des latences. Démarrer les tâches puis <code>await Task.WhenAll(...)</code> = le max. Seulement si les appels sont indépendants (et attention : un <code>DbContext</code> n'accepte <em>pas</em> deux requêtes concurrentes).</li>
          <li><strong><code>Task.WhenAny</code></strong> : le premier gagne (timeout, hedging). Le perdant continue de tourner si tu ne l'annules pas. Raccourci pour un timeout : <code>task.WaitAsync(TimeSpan, ct)</code>.</li>
          <li><strong><code>SemaphoreSlim</code></strong> : limiter la concurrence (quota d'une API externe, pool de connexions). <code>await WaitAsync()</code> n'immobilise aucun thread ; <code>Release()</code> <em>toujours</em> dans un <code>finally</code>. Alternative clé en main : <code>Parallel.ForEachAsync</code> avec <code>MaxDegreeOfParallelism</code>.</li>
          <li><strong><code>System.Threading.Channels</code></strong> : file producteur/consommateur async. Bornée avec <code>BoundedChannelFullMode.Wait</code>, elle applique la <em>backpressure</em> : un producteur trop rapide attend au lieu de remplir la mémoire. C'est la brique derrière une file de jobs alimentée par des endpoints et vidée par un <code>BackgroundService</code>.</li>
          <li><strong><code>IAsyncEnumerable&lt;T&gt;</code></strong> : un endpoint minimal API qui le retourne est sérialisé élément par élément, avec flush pendant que le suivant est attendu. Côté Angular, <code>HttpClient</code> bufferise toute la réponse : pour lire au fil de l'eau il faut <code>fetch</code> + <code>ReadableStream</code>. Côté EF Core : <code>AsAsyncEnumerable()</code>.</li>
          <li><strong><code>CancellationToken</code></strong> : injecté dans un handler, il est lié à <code>HttpContext.RequestAborted</code>. Propage-le jusqu'à EF Core / <code>HttpClient</code> : quand le client part, le travail s'arrête au lieu de tourner pour personne.</li>
        </ul>
        <h3>ValueTask : quand et pourquoi</h3>
        <p>Une <code>Task&lt;T&gt;</code> est un objet alloué sur le tas. Sur un <em>hot path</em> qui se termine le plus souvent de façon synchrone (valeur en cache, buffer déjà rempli), <code>ValueTask&lt;T&gt;</code> est une struct qui porte directement le résultat : zéro allocation. Règles : <strong>l'awaiter une seule fois</strong>, jamais en concurrence, pas de <code>.Result</code> avant qu'elle soit terminée ; besoin de plus ? <code>.AsTask()</code>. Par défaut, garde <code>Task</code> : <code>ValueTask</code> est une optimisation mesurée, pas un style.</p>
        <h3>Concurrence et thread pool</h3>
        <ul>
          <li><strong>Race condition</strong> : <code>counter++</code> = lire, ajouter, écrire. Deux threads lisent la même valeur → un incrément perdu. Corrections : <code>Interlocked.Increment</code> (atomique, sans verrou) ou <code>lock</code> sur un <code>System.Threading.Lock</code> (C# 13) pour une section critique de plusieurs instructions. Aucun analyzer ne détecte ce bug.</li>
          <li><strong>Thread pool starvation</strong> : bloquer un thread du pool (<code>Thread.Sleep</code>, <code>.Result</code>, <code>.Wait()</code>, « sync-over-async ») le retire du service. Au-delà de <code>MinThreads</code>, le pool n'injecte que quelques threads par seconde : les requêtes attendent dans la file, la latence explose alors que le CPU est au repos. Diagnostic : <code>dotnet-counters</code> (<code>threadpool-queue-length</code>). Le remède est d'être async de bout en bout, pas <code>SetMinThreads</code>.</li>
          <li><strong><code>ConfigureAwait(false)</code></strong> : ne pas recapturer le <code>SynchronizationContext</code>. Utile dans une <em>bibliothèque</em> consommée par du WPF/WinForms ; inutile en ASP.NET Core, qui n'en a pas (règle MA0004 désactivée dans ce lab pour cette raison).</li>
          <li><strong>Deadlock <code>.Result</code></strong> : dans un contexte mono-thread (UI, ASP.NET classique), <code>.Result</code> bloque le seul thread sur lequel la continuation doit reprendre → blocage définitif. En ASP.NET Core, pas de deadlock mais de la starvation.</li>
          <li><strong><code>async void</code></strong> : personne ne peut l'attendre, et une exception non gérée y est relancée sur le thread pool → crash du process. Réservé aux handlers d'événements.</li>
        </ul>
      </div>

      <div demo class="col">
        <!-- 1. WhenAll -->
        <div class="card">
          <h3>1. Séquentiel vs Task.WhenAll — 5 appels I/O simulés</h3>
          <div class="row"><button class="primary" (click)="runWhenAll()" [disabled]="whenAllBusy()">GET /api/async/whenall</button></div>
          @if (whenAll(); as w) {
            <div class="bars-h">
              <div class="row"><span class="lbl">séquentiel</span><div class="hbar seq" [style.width.%]="60"></div><span class="badge warn">{{ w.sequentialMs }} ms</span></div>
              <div class="row"><span class="lbl">WhenAll</span><div class="hbar par" [style.width.%]="w.parallelMs / w.sequentialMs * 60"></div><span class="badge ok">{{ w.parallelMs }} ms</span></div>
            </div>
            <p class="small muted">Somme des délais = {{ sum(w.calls) }} ms, max = {{ max(w.calls) }} ms. Thread avant → après chaque <code>await</code> :
              @for (c of w.calls; track c.name) { <code>{{ c.name }} {{ c.threadBefore }}→{{ c.threadAfter }}</code> }
              — le thread n'a pas « attendu » : la continuation reprend sur un thread du pool, pas forcément le même.</p>
          }
        </div>

        <!-- 2. WhenAny -->
        <div class="card">
          <h3>2. Task.WhenAny — timeout contre service lent</h3>
          <div class="row">
            <label>service (ms) <input type="number" min="10" max="2000" [value]="serviceMs()" (input)="serviceMs.set(+$any($event.target).value)" style="width:90px"></label>
            <label>timeout (ms) <input type="number" min="10" max="2000" [value]="timeoutMs()" (input)="timeoutMs.set(+$any($event.target).value)" style="width:90px"></label>
            <button class="primary" (click)="runWhenAny()">Lancer la course</button>
            @if (whenAny(); as a) {
              <span class="badge" [class.ok]="a.winner === 'service'" [class.err]="a.winner === 'timeout'">{{ a.winner === 'service' ? 'le service répond' : 'timeout' }} en {{ a.elapsedMs }} ms</span>
            }
          </div>
        </div>

        <!-- 3. SemaphoreSlim -->
        <div class="card">
          <h3>3. SemaphoreSlim — 20 jobs de 150 ms, au plus K en parallèle</h3>
          <div class="row">
            <label>K <input type="number" min="1" max="20" [value]="k()" (input)="k.set(+$any($event.target).value)" style="width:70px"></label>
            <button class="primary" (click)="runThrottle()">GET /api/async/throttle?max={{ k() }}</button>
            @if (throttle(); as t) {
              <span class="badge brand">max observé en vol : {{ t.observedMaxInFlight }} / {{ t.maxConcurrency }}</span>
              <span class="badge">durée totale : {{ t.totalMs }} ms</span>
            }
          </div>
          @if (throttle(); as t) {
            <div class="gantt">
              @for (j of t.jobs; track j.job) {
                <div class="lane"><span class="mono small">#{{ j.job }}</span>
                  <div class="track"><div class="span" [style.left.%]="j.startMs / t.totalMs * 100" [style.width.%]="(j.endMs - j.startMs) / t.totalMs * 100" [title]="j.startMs + ' → ' + j.endMs + ' ms'"></div></div>
                </div>
              }
            </div>
            <p class="small muted">Durée ≈ ⌈20 / K⌉ × 150 ms : les jobs passent par vagues de K.</p>
          }
        </div>

        <!-- 4. Channels -->
        <div class="card">
          <h3>4. Channel borné — backpressure</h3>
          <div class="row">
            <label>capacité <input type="number" min="1" max="10" [value]="capacity()" (input)="capacity.set(+$any($event.target).value)" style="width:70px"></label>
            <label>producteur (ms/item) <input type="number" min="0" max="300" [value]="producerMs()" (input)="producerMs.set(+$any($event.target).value)" style="width:80px"></label>
            <label>consommateur (ms/item) <input type="number" min="0" max="300" [value]="consumerMs()" (input)="consumerMs.set(+$any($event.target).value)" style="width:80px"></label>
            <button class="primary" (click)="runChannel()">10 items</button>
            @if (channel(); as c) { <span class="badge" [class.warn]="c.producerWaits > 0" [class.ok]="c.producerWaits === 0">producteur bloqué {{ c.producerWaits }} fois</span> }
          </div>
          @if (channel(); as c) {
            <table>
              <tr><th>t (ms)</th><th>événement</th><th>item</th><th>dans le buffer</th></tr>
              @for (e of c.events; track $index) {
                <tr><td class="mono">{{ e.atMs }}</td>
                  <td><span class="badge" [class.ok]="e.kind === 'consumed'" [class.brand]="e.kind === 'produced'" [class.err]="e.kind === 'blocked'">{{ kindLabel[e.kind] }}</span></td>
                  <td>{{ e.item }}</td><td>{{ '▮'.repeat(e.buffered) }}<span class="muted">{{ '▯'.repeat(c.capacity - e.buffered) }}</span></td></tr>
              }
            </table>
          }
        </div>

        <!-- 5. IAsyncEnumerable -->
        <div class="card">
          <h3>5. IAsyncEnumerable — streaming lu avec fetch + ReadableStream</h3>
          <div class="row">
            <button class="primary" (click)="startStream()" [disabled]="streaming()">GET /api/async/stream (8 items, 400 ms)</button>
            <button (click)="stopStream()" [disabled]="!streaming()">Arrêter (AbortController)</button>
            @if (streaming()) { <span class="badge info pulse">réception…</span> }
          </div>
          <div class="col stream">
            @for (s of streamed(); track s.item.index) {
              <div class="fade-in mono small">+{{ s.receivedMs }} ms · item {{ s.item.index }} · produit à {{ s.item.producedAt.slice(11, 23) }} sur le thread {{ s.item.thread }}</div>
            } @empty { <span class="muted small">Les items s'afficheront un par un, à mesure qu'ils sont produits — pas tous à la fin.</span> }
          </div>
        </div>

        <!-- 6. CancellationToken -->
        <div class="card">
          <h3>6. CancellationToken — 10 étapes de 500 ms côté serveur</h3>
          <div class="row">
            <button class="primary" (click)="startSlow()" [disabled]="slowRunning()">Lancer</button>
            <button class="danger" (click)="cancelSlow()" [disabled]="!slowRunning()">Annuler</button>
            @if (slowRunning()) { <span class="badge info pulse">en cours · {{ slowElapsed() }} ms</span> }
            @if (slowOutcome(); as o) {
              <span class="badge" [class.ok]="o.status === 'completed'" [class.warn]="o.status === 'cancelled'">
                {{ o.status === 'cancelled' ? 'serveur : annulé à l’étape ' + o.stepReached + '/' + o.steps : 'terminé (' + o.steps + ' étapes)' }}</span>
            }
          </div>
          <p class="small muted">« Annuler » fait <code>unsubscribe()</code> → HttpClient abandonne la requête → Kestrel déclenche <code>RequestAborted</code> → <code>Task.Delay(…, ct)</code> lève <code>OperationCanceledException</code>. Un 2ᵉ appel (<code>/slow/log</code>) lit ce que le serveur a enregistré.</p>
          @if (slowLog().length) {
            <table>
              <tr><th>run</th><th>statut</th><th>étape</th><th>à</th></tr>
              @for (r of slowLog(); track r.runId + r.at) {
                <tr [class.mine]="r.runId === lastRunId"><td class="mono small">{{ r.runId.slice(0, 8) }}</td><td>{{ r.status }}</td><td>{{ r.stepReached }}/{{ r.steps }}</td><td class="mono small">{{ r.at.slice(11, 19) }}</td></tr>
              }
            </table>
          }
        </div>

        <!-- 7. ValueTask -->
        <div class="card">
          <h3>7. ValueTask — cache hit synchrone, zéro allocation</h3>
          <div class="row">
            <input [value]="vtKey()" (input)="vtKey.set($any($event.target).value)" placeholder="clé produit" style="width:140px">
            <button class="primary" (click)="runValueTask()">GET /api/async/valuetask</button>
            <button (click)="vtKey.set('p-' + rand()); valueTasks.set([])">nouvelle clé</button>
          </div>
          @if (valueTasks().length) {
            <table>
              <tr><th>appel</th><th>synchrone ?</th><th>durée</th><th>Task&lt;T&gt; ({{ valueTasks()[0].iterations / 1000 }} k)</th><th>ValueTask&lt;T&gt;</th></tr>
              @for (v of valueTasks(); track $index) {
                <tr class="fade-in"><td>{{ v.completedSynchronously ? 'cache hit' : 'cache miss' }}</td>
                  <td><span class="badge" [class.ok]="v.completedSynchronously" [class.warn]="!v.completedSynchronously">{{ v.completedSynchronously }}</span></td>
                  <td>{{ v.ms }} ms</td><td class="mono">{{ kb(v.taskBytes) }}</td><td class="mono">{{ kb(v.valueTaskBytes) }}</td></tr>
              }
            </table>
          }
        </div>

        <!-- 8. Race -->
        <div class="card">
          <h3>8. Race condition — N incréments en parallèle</h3>
          <div class="row">
            <select (change)="raceN.set(+$any($event.target).value)">
              <option value="10000">10 000</option><option value="100000" selected>100 000</option><option value="1000000">1 000 000</option>
            </select>
            <button class="primary" (click)="runRace()">GET /api/async/race</button>
          </div>
          @if (race().length) {
            <table>
              <tr><th>mode</th><th>attendu</th><th>obtenu</th><th>perdus</th><th>durée</th></tr>
              @for (r of race(); track r.mode) {
                <tr class="fade-in"><td><code>{{ r.mode }}</code></td><td>{{ r.expected }}</td><td>{{ r.actual }}</td>
                  <td><span class="badge" [class.ok]="r.lost === 0" [class.err]="r.lost > 0">{{ r.lost }}</span></td><td>{{ r.ms }} ms</td></tr>
              }
            </table>
            <p class="small muted">Serveur : {{ race()[0].processorCount }} cœur(s). Sur 1 seul cœur, les pertes deviennent rares (il faut une préemption pile au milieu de l'incrément) : le bug existe toujours, il est juste moins visible.</p>
          }
        </div>

        <!-- 9. ThreadPool -->
        <div class="card">
          <h3>9. Thread pool — bloquer vs await</h3>
          <div class="row">
            <select (change)="poolMode.set($any($event.target).value)">
              <option value="async">async (await Task.Delay)</option>
              <option value="sleep" selected>bloquant (Thread.Sleep)</option>
              <option value="sync-over-async">sync-over-async (Task.Delay().Wait())</option>
            </select>
            <label>N <input type="number" min="1" max="50" [value]="poolN()" (input)="poolN.set(+$any($event.target).value)" style="width:70px"></label>
            <label>ms <input type="number" min="50" max="2000" [value]="poolMs()" (input)="poolMs.set(+$any($event.target).value)" style="width:80px"></label>
            <button class="primary" (click)="runPool()" [disabled]="poolBusy()">POST /threadpool/load</button>
            <button (click)="snapshot()">Snapshot</button>
            @if (poolBusy()) { <span class="badge info pulse">en cours…</span> }
            @if (poolError()) { <span class="badge err">{{ poolError() }}</span> }
          </div>
          @if (pool(); as s) {
            <p class="small mono">ThreadCount={{ s.threadCount }} · PendingWorkItemCount={{ s.pendingWorkItems }} · MinThreads={{ s.minWorkerThreads }} · disponibles={{ s.availableWorkerThreads }} · cœurs={{ s.processorCount }}</p>
          }
          @if (poolRuns().length) {
            <table>
              <tr><th>mode</th><th>N × ms</th><th>durée totale</th><th>attente moy. / max avant exécution</th><th>threads avant → pic → après</th></tr>
              @for (r of poolRuns(); track $index) {
                <tr class="fade-in"><td><code>{{ r.mode }}</code></td><td>{{ r.n }} × {{ r.ms }}</td>
                  <td><span class="badge" [class.ok]="r.totalMs < r.ms * 1.3" [class.err]="r.totalMs >= r.ms * 1.3">{{ r.totalMs }} ms</span></td>
                  <td>{{ r.avgStartDelayMs }} / {{ r.maxStartDelayMs }} ms</td>
                  <td>{{ r.before.threadCount }} → {{ r.peakThreadCount }} → {{ r.after.threadCount }}</td></tr>
              }
            </table>
            <p class="small muted">En mode async, N tâches tiennent en ≈ ms sur une poignée de threads. En mode bloquant, au-delà de MinThreads les tâches <em>attendent un thread</em> : c'est cette attente que subissent aussi toutes les autres requêtes de l'API. Plafonds : N ≤ 50, ms ≤ 2000, un run à la fois.</p>
          }
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .bars-h { display: flex; flex-direction: column; gap: .4rem; margin: .6rem 0; }
    .lbl { width: 90px; font-size: .85rem; color: var(--muted); }
    .hbar { height: 14px; border-radius: 4px; transition: width .4s; flex: 0 0 auto; }
    .hbar.seq { background: var(--warn); }
    .hbar.par { background: var(--ok); }
    .gantt { display: flex; flex-direction: column; gap: 2px; margin-top: .6rem; }
    .lane { display: flex; align-items: center; gap: .5rem; }
    .lane > span { width: 32px; }
    .track { position: relative; flex: 1; height: 10px; background: var(--bg-3); border-radius: 3px; }
    .span { position: absolute; top: 0; bottom: 0; background: linear-gradient(90deg, var(--brand), var(--brand-2)); border-radius: 3px; }
    .stream { margin-top: .5rem; min-height: 2rem; }
    tr.mine td { color: var(--brand-2); }
  `],
})
export class AsyncConcurrencyLesson {
  readonly lesson = lessonById('async-concurrency')!;
  private readonly http = inject(HttpClient);

  readonly whenAllBusy = signal(false);
  readonly whenAll = signal<WhenAll | null>(null);
  readonly serviceMs = signal(800);
  readonly timeoutMs = signal(500);
  readonly whenAny = signal<WhenAny | null>(null);
  readonly k = signal(4);
  readonly throttle = signal<Throttle | null>(null);
  readonly capacity = signal(3);
  readonly producerMs = signal(30);
  readonly consumerMs = signal(150);
  readonly channel = signal<ChannelRun | null>(null);
  readonly kindLabel: Record<ChannelEvent['kind'], string> = { produced: 'écrit', blocked: 'producteur attend', consumed: 'lu' };

  readonly streaming = signal(false);
  readonly streamed = signal<{ item: StreamItem; receivedMs: number }[]>([]);
  private abort?: AbortController;

  readonly slowRunning = signal(false);
  readonly slowElapsed = signal(0);
  readonly slowOutcome = signal<SlowRun | null>(null);
  readonly slowLog = signal<SlowRun[]>([]);
  lastRunId = '';
  private slowSub?: Subscription;
  private slowTimer?: ReturnType<typeof setInterval>;

  readonly rand = () => Math.random().toString(36).slice(2, 7);
  readonly vtKey = signal('p-' + this.rand());
  readonly valueTasks = signal<ValueTaskRun[]>([]);
  readonly raceN = signal(100000);
  readonly race = signal<Race[]>([]);

  readonly poolMode = signal<'async' | 'sleep' | 'sync-over-async'>('sleep');
  readonly poolN = signal(30);
  readonly poolMs = signal(1000);
  readonly pool = signal<PoolSnapshot | null>(null);
  readonly poolRuns = signal<PoolLoad[]>([]);
  readonly poolBusy = signal(false);
  readonly poolError = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.abort?.abort(); this.slowSub?.unsubscribe(); clearInterval(this.slowTimer); });
  }

  sum = (calls: IoCall[]) => calls.reduce((s, c) => s + c.delayMs, 0);
  max = (calls: IoCall[]) => Math.max(...calls.map(c => c.delayMs));
  kb = (bytes: number) => bytes < 1024 ? `${bytes} o` : `${(bytes / 1024 / 1024).toFixed(2)} Mo`;

  runWhenAll() {
    this.whenAllBusy.set(true);
    this.http.get<WhenAll>('/api/async/whenall').subscribe({
      next: r => { this.whenAll.set(r); this.whenAllBusy.set(false); },
      error: () => this.whenAllBusy.set(false),
    });
  }

  runWhenAny() {
    this.http.get<WhenAny>('/api/async/whenany', { params: { serviceMs: this.serviceMs(), timeoutMs: this.timeoutMs() } })
      .subscribe(r => this.whenAny.set(r));
  }

  runThrottle() {
    this.http.get<Throttle>('/api/async/throttle', { params: { max: this.k() } }).subscribe(r => this.throttle.set(r));
  }

  runChannel() {
    this.http.get<ChannelRun>('/api/async/channel', {
      params: { capacity: this.capacity(), items: 10, producerDelayMs: this.producerMs(), consumerDelayMs: this.consumerMs() },
    }).subscribe(r => this.channel.set(r));
  }

  /** HttpClient would hand us the body only once complete: fetch exposes the body as a ReadableStream. */
  async startStream() {
    this.abort = new AbortController();
    this.streamed.set([]);
    this.streaming.set(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/async/stream?count=8&delayMs=400', { signal: this.abort.signal });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      const parser = new JsonArrayStream<StreamItem>();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const items = parser.push(value).map(item => ({ item, receivedMs: Math.round(performance.now() - t0) }));
        this.streamed.update(l => [...l, ...items]);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;   // abort = user clicked "Arrêter": not an error
    } finally {
      this.streaming.set(false);
    }
  }

  stopStream() { this.abort?.abort(); }

  startSlow() {
    this.lastRunId = crypto.randomUUID().replaceAll('-', '');
    this.slowOutcome.set(null);
    this.slowRunning.set(true);
    const t0 = performance.now();
    this.slowTimer = setInterval(() => this.slowElapsed.set(Math.round(performance.now() - t0)), 100);
    this.slowSub = this.http.get<SlowRun>('/api/async/slow', { params: { runId: this.lastRunId, steps: 10, stepMs: 500 } })
      .subscribe({ next: r => { this.slowOutcome.set(r); this.stopSlowUi(); this.loadSlowLog(); }, error: () => this.stopSlowUi() });
  }

  cancelSlow() {
    this.slowSub?.unsubscribe();   // aborts the underlying request (XHR.abort / fetch AbortSignal)
    this.stopSlowUi();
    setTimeout(() => this.loadSlowLog(), 300);   // give the server a moment to observe RequestAborted
  }

  private stopSlowUi() { this.slowRunning.set(false); clearInterval(this.slowTimer); }

  private loadSlowLog() {
    this.http.get<SlowRun[]>('/api/async/slow/log').subscribe(log => {
      this.slowLog.set(log.slice(0, 6));
      const mine = log.find(r => r.runId === this.lastRunId);
      if (mine) this.slowOutcome.set(mine);
    });
  }

  runValueTask() {
    this.http.get<ValueTaskRun>('/api/async/valuetask', { params: { key: this.vtKey() } })
      .subscribe(r => this.valueTasks.update(l => [...l, r].slice(-4)));
  }

  runRace() {
    this.http.get<Race[]>('/api/async/race', { params: { n: this.raceN() } }).subscribe(r => this.race.set(r));
  }

  snapshot() {
    this.http.get<PoolSnapshot>('/api/async/threadpool').subscribe(s => this.pool.set(s));
  }

  runPool() {
    this.poolBusy.set(true);
    this.poolError.set('');
    this.http.post<PoolLoad>('/api/async/threadpool/load', null, { params: { mode: this.poolMode(), n: this.poolN(), ms: this.poolMs() } })
      .subscribe({
        next: r => { this.poolRuns.update(l => [r, ...l].slice(0, 6)); this.pool.set(r.after); this.poolBusy.set(false); },
        error: (e: HttpErrorResponse) => { this.poolError.set(e.status === 409 ? 'un run est déjà en cours (instance partagée), réessaie' : `erreur ${e.status}`); this.poolBusy.set(false); },
      });
  }
}
