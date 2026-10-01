import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { SourceResult, SourceService } from '../core/http/source.service';
import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import scss from 'highlight.js/lib/languages/scss';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('ini', ini);

/**
 * Renders the project's real files with highlight.js. Source: the API when it is
 * reachable, otherwise the build-time snapshot (see SourceService).
 * Tabs = files; the active file is a signal; the highlighted HTML is a computed.
 */
@Component({
  selector: 'code-viewer',
  template: `
    <div class="tabs">
      @for (f of files(); track f) {
        <button class="tab" [class.active]="f === active()" (click)="active.set(f)">{{ shortName(f) }}</button>
      }
    </div>
    @if (loading()) {
      <div class="loading pulse">Chargement du code source…</div>
    } @else if (error()) {
      <div class="loading">⚠️ {{ error() }}</div>
    } @else {
      <div class="path mono">
        {{ active() }} <span class="muted">· {{ lines() }} lignes</span>
        @if (!live()) { <span class="badge" title="L'API n'est pas joignable : code lu dans le snapshot figé au build">snapshot</span> }
      </div>
      <pre><code class="hljs" [innerHTML]="html()"></code></pre>
    }
  `,
  styles: [`
    :host { display: block; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: #0d1117; }
    .tabs { display: flex; gap: 2px; overflow-x: auto; background: var(--bg-2); border-bottom: 1px solid var(--border); padding: .35rem .35rem 0; }
    .tab { background: transparent; border: 0; border-bottom: 2px solid transparent; border-radius: 8px 8px 0 0; color: var(--muted); padding: .45rem .8rem; font-size: .82rem; font-family: var(--mono); white-space: nowrap; }
    .tab:hover { color: var(--text); background: var(--bg-3); }
    .tab.active { color: var(--text); border-bottom-color: var(--brand); background: #0d1117; }
    .path { display: flex; gap: .5rem; align-items: center; padding: .4rem .9rem; font-size: .75rem; color: var(--brand-2); background: #0a0e14; border-bottom: 1px solid var(--border); }
    pre { margin: 0; padding: 1rem; overflow: auto; max-height: 640px; font-size: .82rem; line-height: 1.55; }
    code { font-family: var(--mono); }
    .loading { padding: 1.5rem; color: var(--muted); text-align: center; }
  `],
})
export class CodeViewer {
  private readonly source = inject(SourceService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly files = input.required<string[]>();
  readonly active = signal<string>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly file = signal<SourceResult | null>(null);
  readonly live = computed(() => this.file()?.live ?? true);

  readonly lines = computed(() => this.file()?.content.split('\n').length ?? 0);
  readonly html = computed(() => {
    const f = this.file();
    if (!f) return '';
    const { value } = hljs.highlight(f.content, { language: f.language });
    return this.sanitizer.bypassSecurityTrustHtml(value);
  });

  constructor() {
    effect(() => { const [first] = this.files(); if (first && !this.files().includes(this.active())) this.active.set(first); });
    effect(() => { const path = this.active(); if (path) this.load(path); });
  }

  shortName = (p: string) => p.split('/').slice(-1)[0];

  private load(path: string) {
    this.loading.set(true); this.error.set(null);
    this.source.get(path).subscribe({
      next: f => { this.file.set(f); this.loading.set(false); },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }
}
