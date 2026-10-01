import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { RuntimeConfigService } from '../../core/http/runtime-config';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';

interface Tick { at: string; requestsServed: number; cpuLoadPercent: number; connectedClients: number; }
interface Chat { from: string; text: string; at: string; }

@Component({
  selector: 'lesson-realtime',
  imports: [LessonShell],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>SignalR = WebSocket + fallback + RPC typé</h3>
        <p>Le client négocie le meilleur transport (WebSockets, sinon SSE, sinon long polling) et expose un RPC bidirectionnel :
        le serveur appelle des méthodes <em>sur le client</em> (<code>ILiveClient.Tick</code>), le client invoque des méthodes <em>du hub</em> (<code>SendMessage</code>).</p>
        <p>Le <code>TickerBackgroundService</code> est un <code>IHostedService</code> : il démarre avec l'app et boucle avec un <code>PeriodicTimer</code>. Il pousse via <code>IHubContext</code> — sans instance de hub, depuis n'importe où (endpoint, job, handler d'événement).</p>
        <div class="callout">Ouvre cette page dans <strong>deux onglets</strong> : la présence passe à 2 et le chat est partagé. Le bouton « Annonce serveur » passe par un endpoint HTTP qui pousse au hub.</div>
      </div>
      <div demo class="col">
        <div class="row">
          <span class="badge" [class.ok]="state() === 'Connected'" [class.warn]="state() === 'Connecting' || state() === 'Reconnecting'" [class.err]="state() === 'Disconnected'">● {{ state() }}</span>
          <span class="badge brand">{{ presence() }} client(s) connecté(s)</span>
          <span class="badge">requêtes servies : {{ lastTick()?.requestsServed ?? '—' }}</span>
          <button class="sm" (click)="state() === 'Connected' ? disconnect() : connect()">{{ state() === 'Connected' ? 'Déconnecter' : 'Connecter' }}</button>
        </div>
        <div class="card">
          <h3>Ticks serveur (toutes les 2 s) — charge CPU simulée</h3>
          <div class="bars">
            @for (t of ticks(); track t.at) {
              <div class="bar" [style.height.%]="t.cpuLoadPercent" [title]="t.cpuLoadPercent + '% à ' + t.at"></div>
            }
          </div>
        </div>
        <div class="card">
          <h3>Chat (hub.invoke('SendMessage'))</h3>
          <div class="row">
            <input [value]="name()" (input)="name.set($any($event.target).value)" style="width:110px" placeholder="pseudo">
            <input #m placeholder="message" (keydown.enter)="send(m.value); m.value = ''" style="flex:1">
            <button class="primary sm" (click)="send(m.value); m.value = ''">Envoyer</button>
            <button class="sm" (click)="announce()">Annonce serveur (HTTP → IHubContext)</button>
          </div>
          <div class="chat">
            @for (c of messages(); track c.at + c.from) {
              <div [class.server]="c.from === 'server'"><strong>{{ c.from }}</strong> <span class="muted small">{{ c.at.slice(11, 19) }}</span><br>{{ c.text }}</div>
            } @empty { <span class="muted small">silence…</span> }
          </div>
        </div>
      </div>
    </lesson-shell>
  `,
  styles: [`
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 90px; }
    .bar { flex: 1; background: linear-gradient(180deg, var(--brand-2), var(--brand)); border-radius: 3px 3px 0 0; min-width: 6px; transition: height .3s; }
    .chat { max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: .4rem; margin-top: .5rem; }
    .chat > div { background: var(--bg-3); padding: .4rem .6rem; border-radius: 8px; font-size: .9rem; }
    .chat > .server { border-left: 3px solid var(--auth); }
  `],
})
export class RealtimeLesson {
  readonly lesson = lessonById('realtime')!;
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private connection?: HubConnection;

  readonly state = signal<string>('Disconnected');
  readonly presence = signal(0);
  readonly ticks = signal<Tick[]>([]);
  readonly messages = signal<Chat[]>([]);
  readonly name = signal('yassir');
  readonly lastTick = computed(() => this.ticks().at(-1));

  constructor() {
    this.connect();
    inject(DestroyRef).onDestroy(() => this.disconnect());   // leaving the page closes the socket
  }

  async connect() {
    this.connection = new HubConnectionBuilder()
      // Same origin in dev (the CLI proxy forwards it); absolute in production, because
      // a CDN/edge proxy cannot forward a WebSocket — hence CORS on the API side.
      .withUrl(this.config.hubUrl('/hubs/live'))
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    // Server → client methods (names match ILiveClient in C#)
    this.connection.on('Tick', (t: Tick) => this.ticks.update(l => [...l, t].slice(-30)));
    this.connection.on('Presence', (n: number) => this.presence.set(n));
    this.connection.on('ChatMessage', (m: Chat) => this.messages.update(l => [...l, m].slice(-50)));
    this.connection.onreconnecting(() => this.state.set('Reconnecting'));
    this.connection.onreconnected(() => this.state.set('Connected'));
    this.connection.onclose(() => this.state.set('Disconnected'));

    this.state.set('Connecting');
    try { await this.connection.start(); this.state.set(HubConnectionState[this.connection.state]); }
    catch { this.state.set('Disconnected'); }
  }

  async disconnect() { await this.connection?.stop(); this.state.set('Disconnected'); }

  send(text: string) { if (text.trim()) this.connection?.invoke('SendMessage', this.name(), text.trim()); }
  announce() { this.http.post('/api/realtime/announce', null, { params: { text: `Annonce depuis un endpoint HTTP à ${new Date().toLocaleTimeString()}` } }).subscribe(); }
}
