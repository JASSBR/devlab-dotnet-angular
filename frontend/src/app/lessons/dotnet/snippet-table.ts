import { Component, input } from '@angular/core';

/** One line of a backend demo: the C# that ran and what it returned. */
export interface Snippet { concept: string; code: string; result: string; }

@Component({
  selector: 'snippet-table',
  template: `
    <table>
      <tr><th>concept</th><th>C# exécuté</th><th>résultat</th></tr>
      @for (s of snippets(); track s.concept) {
        <tr class="fade-in">
          <td class="small muted">{{ s.concept }}</td>
          <td><code>{{ s.code }}</code></td>
          <td class="mono small" [class.err]="isError(s.result)">{{ s.result }}</td>
        </tr>
      }
    </table>
  `,
  styles: [`
    td.err { color: var(--err); }
    td { vertical-align: top; }
    td.mono { white-space: pre-wrap; }
  `],
})
export class SnippetTable {
  readonly snippets = input.required<Snippet[]>();
  isError(result: string) { return /Exception\b/.test(result); }
}
