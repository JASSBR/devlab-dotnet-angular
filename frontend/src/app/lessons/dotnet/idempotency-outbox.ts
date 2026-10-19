import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { LessonShell } from '../../shared/lesson-shell';
import { lessonById } from '../catalog';
import { Product } from '../angular/cart.store';
import { OrderDto } from './vertical-slice';

interface OutboxRow { id: string; type: string; payload: string; occurredAt: string; processedAt: string | null; attempts: number; error: string | null; status: string; }
interface OutboxState { pending: number; processed: number; poison: number; maxAttempts: number; faultsArmed: number; messages: OutboxRow[]; }
interface Attempt { label: string; key: string; status: number; replayed: boolean; orderId?: number; detail: string; }

@Component({
  selector: 'lesson-idempotency-outbox',
  imports: [LessonShell, DatePipe],
  template: `
    <lesson-shell [lesson]="lesson">
      <div explain>
        <h3>Le problème : le réseau ment</h3>
        <p>Le client envoie <code>POST /api/orders</code>, la commande est créée… et la réponse se perd (timeout, 502 du proxy, wifi). Le client réessaie : <strong>deux commandes</strong>.
        Un <code>POST</code> n'est pas idempotent par nature ; on le <em>rend</em> idempotent avec une clé générée par le client (un UUID), envoyée dans <code>Idempotency-Key</code> à chaque tentative.</p>
        <ul>
          <li><strong>1ʳᵉ requête</strong> : <code>IdempotencyFilter</code> réserve la clé (ligne avec <code>StatusCode = null</code>), exécute le handler, puis stocke statut + corps — dans la <em>même transaction</em> que la commande.</li>
          <li><strong>Rejeu, même payload</strong> : la réponse stockée est renvoyée telle quelle, avec <code>Idempotent-Replayed: true</code>. Le handler ne tourne pas.</li>
          <li><strong>Même clé, autre payload</strong> : bug client → <code>422</code> ProblemDetails (<code>idempotency.payload_mismatch</code>), comparaison sur un hash SHA-256 du corps.</li>
          <li><strong>Doublons simultanés</strong> : l'index unique <code>(Scope, Key)</code> tranche — le second <code>INSERT</code> échoue, il rejoue le gagnant ou reçoit <code>409</code> + <code>Retry-After</code> si le premier tourne encore.</li>
          <li>La clé est scopée par utilisateur + endpoint ; une erreur 5xx libère la clé (ce n'est pas une réponse), un 409 métier est stocké et rejoué comme le reste. En prod : expiration des clés (24 h chez Stripe).</li>
        </ul>

        <h3>Le dual write, et l'outbox</h3>
        <p>Avant, <code>PlaceOrderHandler</code> faisait <code>SaveChanges()</code> puis <code>bus.Publish(OrderPlaced)</code>. Deux écritures, deux systèmes, aucune transaction commune :
        crash entre les deux = commande sans événement (stock jamais décrémenté) ; publier d'abord = événement pour une commande qui n'existe pas. Aucun ordre ne marche.</p>
        <p><strong>Transactional outbox</strong> : l'événement devient une ligne <code>OutboxMessages</code> écrite dans la <em>même transaction</em> que la commande (même base, celle du module Orders).
        Un <code>OutboxDispatcher</code> (<code>BackgroundService</code> + <code>PeriodicTimer</code>, 500 ms) lit les lignes non traitées, les publie, les marque <code>ProcessedAt</code>.
        Échec → <code>Attempts++</code>, <code>Error</code>, nouvel essai au tick suivant ; après <code>MaxAttempts</code> (5) le message est un <strong>poison message</strong> : parqué, plus de retry, quelqu'un doit regarder (l'équivalent d'une dead-letter queue).</p>

        <h3>At-least-once ⇒ consommateurs idempotents</h3>
        <p>Si le process meurt après le handler mais avant <code>ProcessedAt</code>, le message repart. Exactly-once n'existe pas sur le réseau ; on obtient
        <em>at-least-once delivery + effet exactly-once</em> côté consommateur. Ici Products tient une <strong>inbox</strong> (<code>InboxRecords</code>, PK <code>(MessageId, Handler)</code>) :
        la décrémentation du stock et la ligne d'inbox commitent ensemble ; une redélivrance est détectée et ignorée. Autre option : rendre l'effet naturellement idempotent (<code>SET status = 'Paid'</code> plutôt que <code>stock − 1</code>).</p>

        <h3>Avec un vrai broker</h3>
        <p>Le dispatcher publierait vers RabbitMQ ou Azure Service Bus au lieu du bus in-process : même outbox côté producteur, mêmes consommateurs idempotents côté abonnés (ack après traitement, redélivrance si l'ack se perd, DLQ native).
        On n'écrit pas ça à la main en prod : <strong>Wolverine</strong>, <strong>MassTransit</strong> ou <strong>Brighter</strong> fournissent une outbox durable branchée sur EF Core, l'inbox, les retries avec backoff et la DLQ.
        C'est exactement le montage de <strong>Ledgerline</strong> (RabbitMQ + Wolverine) — ce lab montre ce que ces frameworks font sous le capot.</p>
        <div class="callout">Limites assumées du lab : un seul dispatcher (un <code>SemaphoreSlim</code>) ; en multi-instances il faut <em>réclamer</em> les lignes (<code>FOR UPDATE SKIP LOCKED</code> en Postgres, ou un bail <code>LockedUntil</code>). Retry immédiat, sans backoff exponentiel. Le replay ne renvoie pas le header <code>Location</code>.</div>
      </div>

      <div demo class="col">
        @if (!auth.isLoggedIn()) { <div class="callout">Connecte-toi (bob ou alice) : PlaceOrder et l'outbox demandent un token.</div> }
        <div class="card col">
          <h3>1. POST /api/orders avec Idempotency-Key</h3>
          <div class="row">
            <select [value]="productId()" (change)="productId.set(+$any($event.target).value); readStock()">
              @for (p of products(); track p.id) { <option [value]="p.id">#{{ p.id }} {{ p.name }}</option> }
            </select>
            <input type="number" min="1" max="50" [value]="qty()" (input)="qty.set(+$any($event.target).value)" style="width:80px">
            <span class="badge">stock : {{ stock() ?? '…' }}</span>
          </div>
          <div class="row">
            <code class="small">Idempotency-Key: {{ key() }}</code>
            <button class="sm" (click)="newKey()">nouvelle clé</button>
          </div>
          <div class="row">
            <button class="primary" (click)="send('envoi')" [disabled]="!auth.isLoggedIn()">Envoyer</button>
            <button (click)="replay()" [disabled]="!auth.isLoggedIn() || !lastBody()">Rejouer la même requête</button>
            <button (click)="changePayload()" [disabled]="!auth.isLoggedIn() || !lastBody()">Changer le payload (même clé)</button>
            <button (click)="burst()" [disabled]="!auth.isLoggedIn()">5 envois simultanés (nouvelle clé)</button>
          </div>
          <table>
            <tr><th>essai</th><th>clé</th><th>statut</th><th>Idempotent-Replayed</th><th>commande</th><th></th></tr>
            @for (a of attempts(); track $index) {
              <tr class="fade-in"><td>{{ a.label }}</td><td class="mono small">{{ a.key.slice(0, 8) }}…</td>
                <td><span class="badge" [class.ok]="a.status < 300" [class.warn]="a.status === 409" [class.err]="a.status >= 400 && a.status !== 409">{{ a.status }}</span></td>
                <td>@if (a.replayed) { <span class="badge ok">true</span> } @else { <span class="muted">—</span> }</td>
                <td>{{ a.orderId ? '#' + a.orderId : '' }}</td><td class="small muted">{{ a.detail }}</td></tr>
            } @empty { <tr><td colspan="6" class="muted">aucun envoi</td></tr> }
          </table>
        </div>

        <div class="card col">
          <h3>2. Outbox des commandes</h3>
          <div class="row">
            <span class="badge warn">pending {{ outbox()?.pending ?? 0 }}</span>
            <span class="badge ok">processed {{ outbox()?.processed ?? 0 }}</span>
            <span class="badge err">poison {{ outbox()?.poison ?? 0 }}</span>
            <span class="badge" [class.err]="(outbox()?.faultsArmed ?? 0) > 0">échecs armés : {{ outbox()?.faultsArmed ?? 0 }}</span>
            <label class="small"><input type="checkbox" [checked]="auto()" (change)="auto.set(!auto())"> rafraîchir chaque seconde</label>
          </div>
          <div class="row">
            <button class="sm" (click)="arm(2)" [disabled]="!auth.isLoggedIn()">Faire échouer les 2 prochaines livraisons</button>
            <button class="sm" (click)="arm(6)" [disabled]="!auth.isLoggedIn()">6 échecs (→ poison)</button>
            <button class="sm" (click)="arm(0)" [disabled]="!auth.isLoggedIn()">désarmer</button>
            <button class="sm" (click)="dispatch()" [disabled]="!auth.isLoggedIn()">Dispatcher maintenant</button>
          </div>
          <table>
            <tr><th>type</th><th>payload</th><th>écrit à</th><th>statut</th><th>essais</th><th>erreur</th><th></th></tr>
            @for (m of outbox()?.messages ?? []; track m.id) {
              <tr><td><code>{{ m.type }}</code></td><td class="mono small">{{ m.payload }}</td><td class="small">{{ m.occurredAt + 'Z' | date:'HH:mm:ss' }}</td>
                <td><span class="badge" [class.ok]="m.status === 'processed'" [class.warn]="m.status === 'pending' || m.status === 'retrying'" [class.err]="m.status === 'poison'">{{ m.status }}</span></td>
                <td>{{ m.attempts }}/{{ outbox()?.maxAttempts }}</td><td class="small muted">{{ m.error }}</td>
                <td>@if (m.status === 'processed') { <button class="sm" (click)="redeliver(m.id)" title="Simule un ack perdu : le message est republié">redélivrer</button> }</td></tr>
            } @empty { <tr><td colspan="7" class="muted">outbox vide</td></tr> }
          </table>
          <p class="small muted">« redélivrer » republie un message déjà traité : l'inbox de Products le reconnaît, le stock ne bouge pas (regarde les logs : <code>already handled, skipped</code>).</p>
        </div>
      </div>
    </lesson-shell>
  `,
})
export class IdempotencyOutboxLesson {
  readonly lesson = lessonById('idempotency-outbox')!;
  readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  readonly products = signal<Product[]>([]);
  readonly productId = signal(3);
  readonly qty = signal(1);
  readonly stock = signal<number | null>(null);
  readonly key = signal(crypto.randomUUID());
  readonly lastBody = signal<{ productId: number; quantity: number } | null>(null);
  readonly attempts = signal<Attempt[]>([]);
  readonly outbox = signal<OutboxState | null>(null);
  readonly auto = signal(true);

  constructor() {
    this.http.get<{ items: Product[] }>('/api/products', { params: { pageSize: 50 } })
      .subscribe({ next: r => this.products.set(r.items.filter(p => p.stock > 0)), error: () => this.products.set([]) });
    this.readStock();
    this.refreshOutbox();
    interval(1000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.auto() && this.auth.isLoggedIn()) { this.refreshOutbox(); this.readStock(); }
    });
  }

  newKey() { this.key.set(crypto.randomUUID()); this.lastBody.set(null); }

  send(label: string, body = { productId: this.productId(), quantity: this.qty() }, key = this.key()) {
    this.lastBody.set(body);
    this.http.post<OrderDto>('/api/orders', body, { headers: { 'Idempotency-Key': key }, observe: 'response' }).subscribe({
      next: r => this.record(label, key, r),
      error: (e: HttpErrorResponse) => this.record(label, key, e),
    });
  }

  replay() { this.send('rejeu', this.lastBody()!); }
  changePayload() { const b = this.lastBody()!; this.send('payload modifié', { ...b, quantity: b.quantity + 1 }); }

  burst() {
    this.newKey();
    for (let i = 1; i <= 5; i++) this.send(`simultané ${i}`);
  }

  arm(failures: number) { this.http.post('/api/outbox/faults', { failures }).subscribe(() => this.refreshOutbox()); }
  dispatch() { this.http.post('/api/outbox/dispatch', null).subscribe(() => { this.refreshOutbox(); this.readStock(); }); }
  redeliver(id: string) { this.http.post(`/api/outbox/${id}/redeliver`, null).subscribe(() => { this.refreshOutbox(); this.readStock(); }); }

  readStock() {
    this.http.get<Product>(`/api/products/${this.productId()}`).subscribe({ next: p => this.stock.set(p.stock), error: () => this.stock.set(null) });
  }

  private refreshOutbox() {
    if (!this.auth.isLoggedIn()) return;
    this.http.get<OutboxState>('/api/outbox').subscribe({ next: s => this.outbox.set(s), error: () => this.outbox.set(null) });
  }

  private record(label: string, key: string, r: HttpResponse<OrderDto> | HttpErrorResponse) {
    const replayed = r.headers.get('Idempotent-Replayed') === 'true';
    const body = r instanceof HttpResponse ? r.body : null;
    const detail = r instanceof HttpErrorResponse ? (r.error?.title ?? r.message) : `${body?.productName} × ${body?.quantity}`;
    this.attempts.update(l => [{ label, key, status: r.status, replayed, orderId: body?.id, detail }, ...l].slice(0, 12));
    this.refreshOutbox();
  }
}
