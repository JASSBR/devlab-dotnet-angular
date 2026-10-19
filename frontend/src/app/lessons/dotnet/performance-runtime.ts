import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

type Mode = 'substring' | 'span' | 'array' | 'pool' | 'loh';

interface AllocationResult {
  mode: Mode; iterations: number; allocatedBytes: number; bytesPerIteration: number; elapsedMs: number;
  gen0Collections: number; gen1Collections: number; gen2Collections: number; checksum: number;
}
interface GenerationInfo { name: string; sizeAfterBytes: number; fragmentationAfterBytes: number; }
interface RuntimeInfo {
  framework: string; os: string; architecture: string; processorCount: number; totalAllocatedBytes: number; workingSetBytes: number;
  gc: {
    mode: string; concurrent: boolean; latencyMode: string; datasEnabled: boolean; largeObjectThresholdBytes: number;
    heapSizeBytes: number; fragmentedBytes: number; committedBytes: number; pauseTimePercentage: number;
    gen0Collections: number; gen1Collections: number; gen2Collections: number; generations: GenerationInfo[];
  };
  jit: { compiledMethods: number; compiledIlBytes: number; compilationTimeMs: number; dynamicCodeCompiled: boolean; optimized: boolean;
         switches: { name: string; enabled: boolean; source: string }[] };
}
interface TieringResult {
  variant: 'call' | 'loop'; jitOptimized: boolean; instantiation: string; firstCallUs: number; tier0AvgNs: number; steadyAvgNs: number;
  speedup: number; count: number; durationMs: number; jitMethodsCompiled: number; jitTimeMs: number;
  timeline: { atMs: number; count: number; avgNs: number }[];
}
interface BenchRow { method: string; param?: string; mean: string; ratio: string; gen0: string; gen2?: string; allocated: string; }
interface Bench { title: string; take: string; rows: BenchRow[]; }

/** 1 234 567 → "1,18 Mo". Binary units, French formatting. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value < 10 ? 2 : 1 })} ${units[unit]}`;
}

@Component({
  selector: 'lesson-performance-runtime',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Règle n° 1 : mesurer, avec le bon outil</h3>
        <table>
          <tr><th>Question</th><th>Outil</th><th>Échelle</th></tr>
          <tr><td>Cette méthode coûte combien (ns, octets) ?</td><td><code>BenchmarkDotNet</code> + <code>[MemoryDiagnoser]</code></td><td>micro, hors prod</td></tr>
          <tr><td>Le process va-t-il bien, là, maintenant ?</td><td><code>dotnet-counters</code> (EventPipe, aucun redémarrage)</td><td>macro, prod OK</td></tr>
          <tr><td>Où part le temps CPU ?</td><td><code>dotnet-trace</code> → flame graph (Speedscope, PerfView)</td><td>quelques secondes de prod</td></tr>
          <tr><td>Qu'est-ce qui reste en mémoire ?</td><td><code>dotnet-gcdump</code> (deux snapshots, on compare)</td><td>fuites</td></tr>
        </table>
        <p class="small muted">Un <code>Stopwatch</code> autour d'un appel ne mesure ni le warm-up du JIT, ni le bruit, ni les allocations. BenchmarkDotNet lance un process séparé, chauffe, répète, calcule l'erreur statistique — et refuse de tourner en Debug.</p>

        <h3>Le GC en 6 phrases</h3>
        <ul>
          <li><strong>Allouer est presque gratuit</strong> (on avance un pointeur) ; ce qui coûte, c'est la collection, proportionnelle aux objets <em>vivants</em> et à sa fréquence.</li>
          <li><strong>Générations</strong> : tout naît en gen0 (collectée souvent, en quelques centaines de µs) ; un survivant monte en gen1 puis gen2. Une gen2 parcourt tout le heap : c'est elle qu'on veut rare.</li>
          <li><strong>LOH</strong> : un objet ≥ <strong>85 000 octets</strong> va directement sur le Large Object Heap, collecté seulement avec la gen2 et non compacté par défaut (fragmentation). Allouer des gros buffers en boucle = des gen2 en rafale — la démo <code>loh</code> le montre.</li>
          <li><strong>Workstation vs Server</strong> : un heap ou un heap par cœur. Les projets <code>Microsoft.NET.Sdk.Web</code> sont en Server GC par défaut : débit maximal, plus de mémoire.</li>
          <li><strong>DATAS</strong> (.NET 9+, actif par défaut <em>avec</em> le Server GC) : le nombre de heaps s'adapte à la charge au lieu d'être figé au nombre de cœurs → beaucoup moins de mémoire dans un conteneur peu chargé.</li>
          <li><strong>Background GC</strong> (« concurrent ») : la gen2 se fait en grande partie pendant que l'app tourne ; les pauses restantes sont celles de gen0/gen1.</li>
        </ul>

        <h3>Allouer moins sur les chemins chauds</h3>
        <ul>
          <li><code>Span&lt;T&gt;</code> / <code>ReadOnlySpan&lt;T&gt;</code> : une vue (référence + longueur) sur une mémoire existante. Slicer ne copie rien. <code>ref struct</code> → pile uniquement, pas de <code>await</code> ni de capture ; pour l'async, <code>Memory&lt;T&gt;</code>.</li>
          <li><code>ArrayPool&lt;T&gt;.Shared</code> : <code>Rent</code> peut rendre un tableau <em>plus grand</em> (travailler sur <code>[0..n)</code>), <code>Return</code> dans un <code>finally</code>, <code>clearArray: true</code> si le buffer contenait un secret.</li>
          <li>Chaînes : <code>+=</code> en boucle est quadratique ; <code>StringBuilder</code>, <code>string.Create</code> (longueur connue) ou l'interpolation (<code>DefaultInterpolatedStringHandler</code>, ce que le compilateur génère pour <code>$"…"</code>).</li>
          <li>Allocations cachées : lambda qui capture une variable ou <code>this</code> (closure + délégué), boxing d'un struct en <code>object</code>/interface, LINQ (énumérateurs), <code>params</code>, machine à états <code>async</code> qui ne termine pas synchrone (→ <code>ValueTask</code>).</li>
        </ul>
        <div class="callout">Ne pas optimiser partout : un handler appelé dix fois par seconde peut garder son LINQ lisible. On optimise ce que le profiler désigne.</div>

        <h3>Tiered JIT, OSR, Dynamic PGO</h3>
        <ol class="steps">
          <li><strong>Tier-0</strong> : chaque méthode est d'abord compilée <em>vite</em>, sans optimisation (pas d'inlining, variables sur la pile). Le code du framework arrive souvent précompilé en <strong>ReadyToRun</strong>.</li>
          <li><strong>Comptage d'appels</strong> : après <strong>30 appels</strong> (et 100 ms sans nouvelle compilation tier-0), la méthode est recompilée en arrière-plan.</li>
          <li><strong>Dynamic PGO</strong> (par défaut depuis .NET 8) : une version instrumentée collecte le profil réel (types concrets derrière une interface, branches prises), puis le <strong>tier-1</strong> s'en sert : dévirtualisation gardée, inlining, blocs froids rejetés en fin de méthode.</li>
          <li><strong>OSR</strong> (On-Stack Replacement) : une méthode appelée <em>une fois</em> avec une longue boucle ne peut pas profiter du comptage d'appels. Le tier-0 contient des points de contrôle ; après assez d'itérations, le runtime compile une version optimisée et saute dedans <em>au milieu de la boucle</em>.</li>
        </ol>
        <p class="small muted">Réglages (csproj → <code>runtimeconfig.json</code>) : <code>&lt;TieredCompilation&gt;</code>, <code>&lt;TieredPGO&gt;</code>, <code>&lt;TieredCompilationQuickJitForLoops&gt;</code>, <code>&lt;PublishReadyToRun&gt;</code> ; ou variables <code>DOTNET_TieredPGO=0</code>… Les défauts sont bons : on y touche pour mesurer, rarement pour livrer.</p>

        <h3>Native AOT : le compromis chiffré</h3>
        <p>Le projet <code>DevLab.AotDemo</code> (minimal API, <code>CreateSlimBuilder</code>, <code>JsonSerializerContext</code>) publié deux fois sur ce Mac M4 :</p>
        <table>
          <tr><th></th><th>Native AOT</th><th>JIT (framework-dependent)</th></tr>
          @for (r of aot; track r[0]) { <tr><td>{{ r[0] }}</td><td><strong>{{ r[1] }}</strong></td><td>{{ r[2] }}</td></tr> }
        </table>
        <ul class="small">
          <li><strong>Gagné</strong> : démarrage ÷ 2, mémoire ÷ 3,4, aucun runtime à installer → idéal en scale-to-zero, serverless, CLI.</li>
          <li><strong>Perdu</strong> : pas de code généré à l'exécution, réflexion limitée (le trimming supprime ce qui n'est pas référencé), pas de MVC/controllers, EF Core partiel, un binaire par OS/architecture, build 4,7× plus long, pas de Dynamic PGO.</li>
          <li><strong>Trouvé en mesurant</strong> : la variante JIT publiée avec <code>-p:PublishAot=false</code> mais <code>IsAotCompatible</code> toujours actif échoue en <code>IL2026/IL3050</code> sur chaque <code>MapGet</code> : c'est le <em>Request Delegate Generator</em>, activé par <code>PublishAot</code>, qui rend les minimal APIs compatibles AOT.</li>
        </ul>
      </div>

      <div demo class="col">
        <div class="card">
          <h3>1. Allocations en direct : même travail, deux écritures</h3>
          <div class="row">
            <label class="small">itérations <input type="number" min="1" max="100000" [value]="iterations()" (input)="iterations.set(+$any($event.target).value)" style="width:7rem"></label>
            @for (m of modes; track m.id) { <button [class.primary]="m.good" (click)="measure(m.id)" [title]="m.hint">{{ m.id }}</button> }
            <button (click)="allocations.set([])">effacer</button>
          </div>
          <p class="small muted"><code>substring</code> vs <code>span</code> : parser <code>"1042,7,250,2026,13,99,3,18"</code>. <code>array</code> vs <code>pool</code> : un buffer de 4 Ko par itération. <code>loh</code> : 90 000 octets, au-dessus du seuil LOH. Mesure : <code>GC.GetAllocatedBytesForCurrentThread()</code> avant/après, handler synchrone.</p>
          @if (error()) { <div class="callout err small">{{ error() }}</div> }
          <table>
            <tr><th>mode</th><th>alloué</th><th>par itération</th><th>durée</th><th>GC gen0 / 1 / 2</th></tr>
            @for (r of allocations(); track $index) {
              <tr class="fade-in">
                <td><code>{{ r.mode }}</code> <span class="muted small">× {{ r.iterations.toLocaleString('fr-FR') }}</span></td>
                <td><span class="badge" [class.ok]="r.bytesPerIteration < 16" [class.warn]="r.bytesPerIteration >= 16 && r.bytesPerIteration < 85000" [class.err]="r.bytesPerIteration >= 85000">{{ fmt(r.allocatedBytes) }}</span></td>
                <td class="mono">{{ r.bytesPerIteration.toLocaleString('fr-FR') }} o</td>
                <td class="mono">{{ r.elapsedMs.toLocaleString('fr-FR') }} ms</td>
                <td class="mono">{{ r.gen0Collections }} / {{ r.gen1Collections }} / {{ r.gen2Collections }}</td>
              </tr>
            }
          </table>
          <p class="small muted">Mesuré sur le Mac de dev (10 000 itérations) : substring 2,29 Mo (240 o/ligne) → span 64 o au total ; array 39,3 Mo → pool 4,6 Ko (le 1ᵉʳ Rent). <code>loh</code> × 2 000 : 172 Mo et <strong>10 collections gen2</strong>. Chaque appel alimente aussi le Meter <code>DevLab</code>.</p>
        </div>

        <div class="card">
          <h3>2. Le runtime vu de l'intérieur</h3>
          <div class="row"><button class="primary" (click)="loadRuntime()">GET /api/perf/runtime</button>
            <span class="small muted">relance-le après quelques <code>loh</code> : les collections et la taille de la gen2 bougent.</span></div>
          @if (runtime(); as rt) {
            <div class="grid-2 fade-in">
              <table>
                <tr><th colspan="2">Process</th></tr>
                <tr><td>Runtime</td><td class="mono">{{ rt.framework }} · {{ rt.architecture }}</td></tr>
                <tr><td>OS · cœurs</td><td class="mono">{{ rt.os }} · {{ rt.processorCount }}</td></tr>
                <tr><td>Working set</td><td class="mono">{{ fmt(rt.workingSetBytes) }}</td></tr>
                <tr><td>Alloué depuis le démarrage</td><td class="mono">{{ fmt(rt.totalAllocatedBytes) }}</td></tr>
                <tr><th colspan="2">GC</th></tr>
                <tr><td>Mode</td><td><span class="badge info">{{ rt.gc.mode }}</span> @if (rt.gc.concurrent) { <span class="badge">background</span> } @if (rt.gc.datasEnabled) { <span class="badge ok">DATAS</span> }</td></tr>
                <tr><td>LatencyMode</td><td class="mono">{{ rt.gc.latencyMode }}</td></tr>
                <tr><td>Seuil LOH</td><td class="mono">{{ rt.gc.largeObjectThresholdBytes.toLocaleString('fr-FR') }} o</td></tr>
                <tr><td>Heap · fragmenté · commité</td><td class="mono">{{ fmt(rt.gc.heapSizeBytes) }} · {{ fmt(rt.gc.fragmentedBytes) }} · {{ fmt(rt.gc.committedBytes) }}</td></tr>
                <tr><td>Temps en pause</td><td class="mono">{{ rt.gc.pauseTimePercentage }} %</td></tr>
                <tr><td>Collections gen0 / 1 / 2</td><td class="mono">{{ rt.gc.gen0Collections }} / {{ rt.gc.gen1Collections }} / {{ rt.gc.gen2Collections }}</td></tr>
              </table>
              <table>
                <tr><th>Génération</th><th>après la dernière GC</th><th>fragmentation</th></tr>
                @for (g of rt.gc.generations; track g.name) { <tr><td><code>{{ g.name }}</code></td><td class="mono">{{ fmt(g.sizeAfterBytes) }}</td><td class="mono">{{ fmt(g.fragmentationAfterBytes) }}</td></tr> }
                <tr><th colspan="3">JIT</th></tr>
                <tr><td>Méthodes compilées</td><td colspan="2" class="mono">{{ rt.jit.compiledMethods.toLocaleString('fr-FR') }} ({{ fmt(rt.jit.compiledIlBytes) }} d'IL, {{ rt.jit.compilationTimeMs.toLocaleString('fr-FR') }} ms)</td></tr>
                <tr><td>Assembly optimisée</td><td colspan="2">@if (rt.jit.optimized) { <span class="badge ok">Release</span> } @else { <span class="badge warn">Debug : JIT non optimisé</span> }</td></tr>
                @for (s of rt.jit.switches; track s.name) { <tr><td class="mono small">{{ s.name.replace('System.Runtime.', '') }}</td><td><span class="badge" [class.ok]="s.enabled">{{ s.enabled ? 'on' : 'off' }}</span></td><td class="small muted">{{ s.source }}</td></tr> }
              </table>
            </div>
          }
        </div>

        <div class="card">
          <h3>3. Tiered JIT en direct</h3>
          <div class="row">
            <button class="primary" (click)="tier(false)" [disabled]="tiering()">Méthode sans boucle : tier-0 → tier-1</button>
            <button class="primary" (click)="tier(true)" [disabled]="tiering()">Une boucle, un seul appel : OSR</button>
            @if (tiering()) { <span class="pulse small">mesure en cours…</span> }
          </div>
          <p class="small muted">Chaque clic compile une méthode <em>jamais appelée</em> : <code>Work&lt;T&gt;</code> instancié sur un nouveau struct (<code>ValueTuple</code> de 4 types primitifs) = un nouveau corps de méthode, donc froid à chaque fois.</p>
          @if (tierResult(); as t) {
            @if (!t.jitOptimized) {
              <div class="callout warn small"><strong>API lancée en Debug</strong> : l'assembly porte <code>[Debuggable(DisableOptimizations)]</code>, le JIT compile une fois sans optimiser et ne fait jamais de tier-up. Relance en Release : <code>dotnet run -c Release</code> (l'image Docker l'est déjà).</div>
            }
            <div class="row fade-in">
              <span class="badge info mono">{{ t.instantiation }}</span>
              <span class="badge">1ᵉʳ appel {{ t.firstCallUs.toLocaleString('fr-FR') }} µs</span>
              <span class="badge warn">{{ t.variant === 'call' ? 'appels 2-30' : '1ᵉʳ bloc' }} : {{ t.tier0AvgNs.toLocaleString('fr-FR') }} ns</span>
              <span class="badge ok">fin : {{ t.steadyAvgNs.toLocaleString('fr-FR') }} ns</span>
              <span class="badge brand">× {{ t.speedup.toLocaleString('fr-FR') }}</span>
              <span class="badge">{{ t.jitMethodsCompiled }} méthodes JIT ({{ t.jitTimeMs.toLocaleString('fr-FR') }} ms)</span>
            </div>
            <div class="bars" [title]="t.variant === 'call' ? 'ns par appel, par tranche de temps' : 'ns par itération, par bloc de 512 itérations'">
              @for (p of t.timeline; track $index) {
                <div class="bar" [style.height.%]="100 * p.avgNs / maxNs()" [class.hot]="p.avgNs > maxNs() * 0.5" [title]="p.avgNs + ' ns @ ' + p.atMs + ' ms'"></div>
              }
            </div>
            <p class="small muted">{{ t.variant === 'call'
              ? 'Axe X : ' + t.durationMs + ' ms d’appels en rafale (' + t.count.toLocaleString('fr-FR') + ' appels). La marche = l’installation du code tier-1, compilé en arrière-plan.'
              : 'Axe X : les ' + t.count.toLocaleString('fr-FR') + ' itérations d’un SEUL appel (' + t.durationMs + ' ms). Le pic = la compilation OSR, puis le reste de la boucle tourne en code optimisé.' }}</p>
          }
          <p class="small muted">Mesuré en Release sur le Mac de dev : sans boucle, ≈ 10 ns/appel en tier-0 → <strong>4,8 ns</strong> après le tier-up (×2 à ×4 selon le run ; au tout premier clic, les centaines de méthodes ASP.NET compilées en même temps retardent la promotion). Avec boucle : ≈ 10 ns/itération, pic de ≈ 0,4 ms au bloc 19 (≈ 10 000 itérations), puis <strong>4,9 ns</strong> — 2 méthodes JIT : tier-0 + OSR.</p>
        </div>

        <div class="card">
          <h3>4. BenchmarkDotNet : les vrais chiffres (commités)</h3>
          <p class="small muted">Apple M4, .NET 10.0.12, <code>--job short</code>. Rapport complet : <code>backend/DevLab.Benchmarks/RESULTS.md</code> ci-dessous.</p>
          @for (b of benches; track b.title) {
            <h4>{{ b.title }}</h4>
            <table>
              <tr><th>Méthode</th><th>Moyenne</th><th>Ratio</th><th>Gen0</th><th>Gen2</th><th>Alloué/op</th></tr>
              @for (r of b.rows; track $index) {
                <tr><td><code>{{ r.method }}</code>@if (r.param) { <span class="muted small"> {{ r.param }}</span> }</td><td class="mono">{{ r.mean }}</td>
                  <td><span class="badge" [class.ok]="r.ratio !== '1.00' && +r.ratio < 1" [class.warn]="+r.ratio > 1">{{ r.ratio }}</span></td>
                  <td class="mono">{{ r.gen0 }}</td><td class="mono">{{ r.gen2 ?? '-' }}</td><td class="mono">{{ r.allocated }}</td></tr>
              }
            </table>
            <p class="small muted">{{ b.take }}</p>
          }
        </div>

        <div class="card">
          <h3>5. Cheat-sheet : dotnet-counters & dotnet-trace</h3>
          <pre class="json">{{ commands }}</pre>
          <p class="small">Capture réelle, API en Release sous charge (<code>array</code>, <code>substring</code>, <code>loh</code> en boucle) :</p>
          <pre class="json">{{ countersOutput }}</pre>
          <p class="small muted">À lire : <code>gen0 = 0</code> et <code>gen2 = 314</code> — avec des buffers LOH en boucle, chaque collection est une gen2. Le Meter <code>DevLab</code> apparaît sans aucun exporter : <code>dotnet-counters</code> s'abonne via EventPipe. Ce que je surveille d'abord : <code>dotnet.gc.heap.total_allocated</code> (en delta = débit d'allocation), <code>dotnet.gc.pause.time</code>, <code>dotnet.gc.last_collection.heap.size</code> par génération, <code>dotnet.thread_pool.queue.length</code> (si ça monte avec peu de CPU : sync-over-async).</p>
          <p class="small muted">Trace réelle de 5 s (<code>--profile dotnet-sampled-thread-time --format Speedscope</code>, 1,6 Mo) pendant des appels <code>substring</code> : 38 % du temps dans <code>Number.TryParseBinaryIntegerStyle</code> (le parsing), 13 % dans <code>SpanHelpers.Memmove</code> (la copie des caractères dans chaque nouvelle string), 11 % dans <code>IndexOf</code>. Attention : dans dotnet-trace 10, <code>cpu-sampling</code> est devenu un profil <code>collect-linux</code> (perf kernel) ; sur macOS/Windows, c'est <code>dotnet-sampled-thread-time</code>.</p>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .card h3 { margin-top: 0; }
    h4 { margin: .9rem 0 .35rem; font-size: .9rem; }
    .bars { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: .5rem; background: #0a0e17; border: 1px solid var(--border); border-radius: 10px; margin-top: .5rem; }
    .bar { flex: 1; min-height: 2px; background: var(--ok); border-radius: 2px 2px 0 0; }
    .bar.hot { background: var(--warn); }
  `],
})
export class PerformanceRuntimeLesson {
  readonly lesson = lessonById('performance-runtime')!;
  private readonly http = inject(HttpClient);
  readonly fmt = formatBytes;

  readonly modes: { id: Mode; good: boolean; hint: string }[] = [
    { id: 'substring', good: false, hint: 'Substring + int.Parse(string)' },
    { id: 'span', good: true, hint: 'ReadOnlySpan<char> slicing + int.Parse(span)' },
    { id: 'array', good: false, hint: 'new byte[4096] à chaque itération' },
    { id: 'pool', good: true, hint: 'ArrayPool<byte>.Shared.Rent / Return' },
    { id: 'loh', good: false, hint: 'new byte[90 000] → Large Object Heap' },
  ];
  readonly iterations = signal(10_000);
  readonly allocations = signal<AllocationResult[]>([]);
  readonly error = signal<string | null>(null);
  readonly runtime = signal<RuntimeInfo | null>(null);
  readonly tiering = signal(false);
  readonly tierResult = signal<TieringResult | null>(null);
  readonly maxNs = computed(() => Math.max(1, ...(this.tierResult()?.timeline ?? []).map(p => p.avgNs)));

  measure(mode: Mode) {
    this.error.set(null);
    const iterations = mode === 'loh' ? Math.min(this.iterations(), 2_000) : this.iterations();
    this.http.get<AllocationResult>('/api/perf/allocations', { params: { mode, iterations } }).subscribe({
      next: r => this.allocations.update(l => [r, ...l].slice(0, 10)),
      error: e => this.error.set(e.error?.errors ? JSON.stringify(e.error.errors) : `HTTP ${e.status}`),
    });
  }

  loadRuntime() {
    this.http.get<RuntimeInfo>('/api/perf/runtime').subscribe(r => this.runtime.set(r));
  }

  tier(loop: boolean) {
    this.tiering.set(true);
    this.http.get<TieringResult>('/api/perf/tiering', { params: { loop } }).subscribe({
      next: r => { this.tierResult.set(r); this.tiering.set(false); },
      error: () => this.tiering.set(false),
    });
  }

  readonly aot: [string, string, string][] = [
    ['Taille publiée', '8,07 Mo (un binaire)', '151 Ko + ≈ 111 Mo de runtime partagé'],
    ['Prêt à servir (médiane de 8)', '106 ms', '173 ms'],
    ['1ʳᵉ réponse HTTP', '109 ms', '226 ms'],
    ['Mémoire après 1 requête', '24,4 Mo', '83,1 Mo'],
    ['Mémoire après 500 requêtes', '30,8 Mo', '89,6 Mo'],
    ['dotnet publish', '9,0 s', '1,9 s'],
    ['IsDynamicCodeSupported', 'false', 'true'],
  ];

  readonly benches: Bench[] = [
    { title: 'Parser une ligne CSV de 8 champs', take: 'Span : zéro allocation, 2,3× plus rapide. Split est le pire : un tableau + 8 strings.', rows: [
      { method: 'Substring', mean: '96.23 ns', ratio: '1.00', gen0: '0.0286', allocated: '240 B' },
      { method: 'Span', mean: '42.39 ns', ratio: '0.44', gen0: '-', allocated: '-' },
      { method: 'Split', mean: '101.03 ns', ratio: '1.05', gen0: '0.0391', allocated: '328 B' },
    ] },
    { title: 'Buffer temporaire : new byte[] vs ArrayPool', take: 'À 100 000 octets (> 85 000), chaque new byte[] part sur le LOH : 31 gen2 pour 1 000 opérations, 5,4× plus lent que le pool.', rows: [
      { method: 'NewArray', param: '4096', mean: '144.78 ns', ratio: '1.00', gen0: '0.4923', gen2: '-', allocated: '4120 B' },
      { method: 'ArrayPoolRent', param: '4096', mean: '51.45 ns', ratio: '0.36', gen0: '-', gen2: '-', allocated: '-' },
      { method: 'NewArray', param: '100000', mean: '7,593.92 ns', ratio: '1.00', gen0: '31.2347', gen2: '31.2347', allocated: '100045 B' },
      { method: 'ArrayPoolRent', param: '100000', mean: '1,399.15 ns', ratio: '0.18', gen0: '-', gen2: '-', allocated: '-' },
    ] },
    { title: 'Construire "item0;item1;…" (Count = 100)', take: '+= en boucle : 71 Ko alloués pour une chaîne de 690 caractères (quadratique). string.Create et le handler d’interpolation n’allouent que la chaîne finale.', rows: [
      { method: 'Concat (+=)', mean: '2,895.76 ns', ratio: '1.00', gen0: '8.5220', allocated: '71304 B' },
      { method: 'Builder', mean: '496.65 ns', ratio: '0.17', gen0: '0.4730', allocated: '3960 B' },
      { method: 'InterpolatedHandler', mean: '431.32 ns', ratio: '0.15', gen0: '0.1678', allocated: '1408 B' },
      { method: 'StringCreate', mean: '423.37 ns', ratio: '0.15', gen0: '0.1678', allocated: '1408 B' },
    ] },
    { title: 'LINQ vs foreach (1 000 entiers, filtre + carré + somme)', take: 'LINQ : 3× plus lent et 168 B par appel (closure qui capture this, délégués, énumérateurs).', rows: [
      { method: 'Linq', mean: '1,135.4 ns', ratio: '1.00', gen0: '0.0191', allocated: '168 B' },
      { method: 'Foreach', mean: '377.2 ns', ratio: '0.33', gen0: '-', allocated: '-' },
    ] },
  ];

  readonly commands = `# Installer les outils (une fois)
dotnet tool install -g dotnet-counters
dotnet tool install -g dotnet-trace
dotnet-counters ps                      # PID des process .NET

# Compteurs live : le Meter du lab + le runtime
dotnet-counters monitor -n DevLab.Api --counters DevLab,System.Runtime
#   lancé via "dotnet DevLab.Api.dll" ? le process s'appelle "dotnet" : utiliser -p <PID>
#   trop de lignes pour le terminal ? filtrer :
dotnet-counters monitor -p <PID> --showDeltas \\
  --counters "System.Runtime[dotnet.gc.heap.total_allocated,dotnet.gc.collections,dotnet.gc.pause.time,dotnet.thread_pool.queue.length]"

# Trace CPU échantillonnée → flame graph dans https://www.speedscope.app
dotnet-trace collect -p <PID> --profile dotnet-sampled-thread-time \\
  --format Speedscope --duration 00:00:00:05
#   (sous Linux, profil kernel : dotnet-trace collect-linux --profile cpu-sampling)

# Benchmarks (Release obligatoire)
cd backend/DevLab.Benchmarks
dotnet run -c Release -- --list flat
dotnet run -c Release -- --filter '*Parsing*'
dotnet run -c Release -- --filter '*' --job short

# Native AOT vs JIT
cd backend/DevLab.AotDemo
dotnet publish -c Release -r osx-arm64              # → binaire natif unique
dotnet publish -c Release -r osx-arm64 --self-contained false -p:PublishAot=false -p:IsAotCompatible=false`;

  readonly countersOutput = `$ dotnet-counters monitor -p 87788 --counters DevLab,System.Runtime --duration 00:00:00:08
Name                                               Current Value
[DevLab]
    devlab.perf.demo.allocated (By)
        demo
        ---------
        array                                          9.064e+09
        loh                                           1.9985e+09
        substring                                       5.28e+08
    devlab.perf.demo.duration (ms)
        demo      Percentile
        --------- ----------
        array     50                                       4.57
        array     95                                       6.063
        loh       50                                       9.781
        loh       95                                      14.672
        substring 50                                       2.188
        substring 95                                       3.18
    devlab.perf.demo.runs ({run})                       …

$ dotnet-counters monitor -p 87788 --counters "System.Runtime[…]"
[System.Runtime]
    dotnet.gc.collections ({collection})
        gc.heap.generation
        ------------------
        gen0                                               0
        gen1                                               0
        gen2                                             314
    dotnet.gc.heap.total_allocated (By)               3.5383e+10
    dotnet.gc.last_collection.heap.size (By)
        gen0                                       1,110,656
        gen1                                          15,032
        gen2                                       3,651,272
        loh                                           98,624
        poh                                          161,480
    dotnet.gc.pause.time (s)                               1.946
    dotnet.jit.compiled_methods ({method})            12,371
    dotnet.process.memory.working_set (By)            1.9875e+08
    dotnet.thread_pool.queue.length ({work_item})          0`;
}
