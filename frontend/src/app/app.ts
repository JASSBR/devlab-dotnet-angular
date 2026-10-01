import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { RequestLog } from './core/http/request-log.interceptor';
import { LESSONS, TRACKS, Track } from './lessons/catalog';
import { Progress } from './shared/progress';
import { CommandPalette } from './shared/command-palette';
import { NetworkPanel } from './shared/network-panel';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NetworkPanel, CommandPalette],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthStore);
  readonly progress = inject(Progress);
  readonly log = inject(RequestLog);

  readonly tracks = Object.entries(TRACKS) as [Track, (typeof TRACKS)[Track]][];
  readonly lessonsOf = (track: Track) => LESSONS.filter(l => l.track === track);
  readonly total = LESSONS.length;

  readonly palette = viewChild.required(CommandPalette);
  readonly isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  readonly panelOpen = signal(false);
  readonly sidebarOpen = signal(false);
  readonly pendingLabel = computed(() => this.log.pending() ? `${this.log.pending()} en cours` : `${this.log.entries().length} requêtes`);
}
