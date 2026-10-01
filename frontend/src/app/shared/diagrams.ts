import { Component, input } from '@angular/core';

/**
 * Inline SVG diagrams shared by lessons and the interview mode. Pure presentation:
 * colors come from CSS variables so they follow the theme.
 */
const BASE_STYLE = `
  :host { display: block; margin: .75rem 0; }
  svg { width: 100%; height: auto; max-width: 820px; font-family: Inter, system-ui, sans-serif; font-size: 13px; }
  .box { fill: var(--bg-3); stroke: var(--border); stroke-width: 1.5; rx: 10; }
  .box.a { stroke: var(--brand); } .box.b { stroke: var(--brand-2); } .box.c { stroke: var(--auth); } .box.d { stroke: var(--angular); } .box.ok { stroke: var(--ok); }
  .t { fill: var(--text); } .m { fill: var(--muted); font-size: 11px; } .k { fill: var(--brand-2); font-family: var(--mono); font-size: 11px; }
  .arrow { stroke: var(--muted); stroke-width: 1.5; fill: none; marker-end: url(#arr); }
  .arrow.hi { stroke: var(--brand-2); } .arrow.bad { stroke: var(--err); stroke-dasharray: 4 3; }
  .cap { fill: var(--muted); font-size: 11px; font-style: italic; }
`;
const DEFS = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" style="fill: var(--muted)"/></marker></defs>`;

@Component({
  selector: 'diagram-pipeline',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 230">${DEFS}
    <text x="20" y="24" class="t" font-weight="700">Requête →</text>
    <text x="700" y="24" class="t" font-weight="700">← Réponse</text>
    <g>
      <rect x="20" y="40" width="780" height="170" class="box a"/><text x="34" y="62" class="k">UseExceptionHandler</text>
      <rect x="70" y="72" width="680" height="128" class="box b"/><text x="84" y="94" class="k">UseCors · UseRateLimiter</text>
      <rect x="120" y="104" width="580" height="86" class="box c"/><text x="134" y="126" class="k">UseAuthentication → UseAuthorization</text>
      <rect x="180" y="136" width="460" height="44" class="box ok"/><text x="410" y="162" class="t" text-anchor="middle" font-weight="700">Endpoint (filters → handler)</text>
    </g>
    <path d="M10 130 C 40 130, 40 158, 175 158" class="arrow hi"/>
    <path d="M645 158 C 780 158, 780 130, 810 130" class="arrow hi"/>
    <text x="410" y="225" class="cap" text-anchor="middle">Chaque middleware englobe le suivant : il voit la requête à l'aller et la réponse au retour (ordre inverse).</text>
  </svg>`,
})
export class DiagramPipeline {}

@Component({
  selector: 'diagram-lifetimes',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 240">${DEFS}
    <rect x="20" y="20" width="780" height="200" class="box"/><text x="34" y="42" class="k">Application (Singleton : 1 instance, toute la vie du process)</text>
    <rect x="50" y="60" width="340" height="140" class="box a"/><text x="64" y="82" class="k">Requête HTTP #1 = scope</text>
    <rect x="430" y="60" width="340" height="140" class="box a"/><text x="444" y="82" class="k">Requête HTTP #2 = scope</text>
    <rect x="70" y="100" width="140" height="34" class="box b"/><text x="140" y="122" class="t" text-anchor="middle">Scoped 🟦 (1/scope)</text>
    <rect x="450" y="100" width="140" height="34" class="box b"/><text x="520" y="122" class="t" text-anchor="middle">Scoped 🟩 (autre)</text>
    <rect x="70" y="150" width="90" height="34" class="box d"/><text x="115" y="172" class="t" text-anchor="middle">Transient</text>
    <rect x="170" y="150" width="90" height="34" class="box d"/><text x="215" y="172" class="t" text-anchor="middle">Transient</text>
    <rect x="270" y="150" width="90" height="34" class="box d"/><text x="315" y="172" class="t" text-anchor="middle">Transient</text>
    <rect x="450" y="150" width="90" height="34" class="box d"/><text x="495" y="172" class="t" text-anchor="middle">Transient</text>
    <rect x="620" y="100" width="140" height="84" class="box c"/><text x="690" y="130" class="t" text-anchor="middle">Singleton</text><text x="690" y="150" class="m" text-anchor="middle">partagé par les</text><text x="690" y="164" class="m" text-anchor="middle">deux requêtes</text>
    <text x="410" y="234" class="cap" text-anchor="middle">Transient : nouveau à chaque inject · Scoped : un par requête · Singleton : un pour l'app (thread-safe obligatoire)</text>
  </svg>`,
})
export class DiagramLifetimes {}

@Component({
  selector: 'diagram-jwt',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 300">${DEFS}
    <rect x="20" y="20" width="160" height="40" class="box d"/><text x="100" y="45" class="t" text-anchor="middle" font-weight="700">Angular</text>
    <rect x="640" y="20" width="160" height="40" class="box a"/><text x="720" y="45" class="t" text-anchor="middle" font-weight="700">API .NET</text>
    <line x1="100" y1="60" x2="100" y2="290" stroke="var(--border)" stroke-dasharray="4 4"/>
    <line x1="720" y1="60" x2="720" y2="290" stroke="var(--border)" stroke-dasharray="4 4"/>
    <path d="M100 85 L715 85" class="arrow"/><text x="410" y="80" class="k" text-anchor="middle">POST /login &#123;user, password&#125;</text>
    <path d="M720 115 L105 115" class="arrow hi"/><text x="410" y="110" class="k" text-anchor="middle">&#123; accessToken (JWT, 15 min), refreshToken (opaque) &#125;</text>
    <path d="M100 150 L715 150" class="arrow"/><text x="410" y="145" class="k" text-anchor="middle">GET /me  Authorization: Bearer &lt;access&gt;</text>
    <text x="410" y="168" class="m" text-anchor="middle">signature ✓ iss ✓ aud ✓ exp ✓ — aucune requête en base</text>
    <path d="M720 195 L105 195" class="arrow bad"/><text x="410" y="190" class="k" text-anchor="middle">…plus tard : 401 (exp dépassé)</text>
    <path d="M100 225 L715 225" class="arrow"/><text x="410" y="220" class="k" text-anchor="middle">POST /refresh &#123;refreshToken&#125;</text>
    <path d="M720 255 L105 255" class="arrow hi"/><text x="410" y="250" class="k" text-anchor="middle">nouveau couple — l'ancien refresh est révoqué (rotation)</text>
    <text x="410" y="290" class="cap" text-anchor="middle">L'interceptor Angular fait 401 → refresh → rejeu de la requête, sans que le composant le sache.</text>
  </svg>`,
})
export class DiagramJwt {}

@Component({
  selector: 'diagram-pkce',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 330">${DEFS}
    <rect x="20" y="20" width="140" height="40" class="box d"/><text x="90" y="45" class="t" text-anchor="middle" font-weight="700">SPA</text>
    <rect x="340" y="20" width="140" height="40" class="box c"/><text x="410" y="45" class="t" text-anchor="middle" font-weight="700">IdP</text>
    <rect x="660" y="20" width="140" height="40" class="box a"/><text x="730" y="45" class="t" text-anchor="middle" font-weight="700">API</text>
    <line x1="90" y1="60" x2="90" y2="320" stroke="var(--border)" stroke-dasharray="4 4"/><line x1="410" y1="60" x2="410" y2="320" stroke="var(--border)" stroke-dasharray="4 4"/><line x1="730" y1="60" x2="730" y2="320" stroke="var(--border)" stroke-dasharray="4 4"/>
    <text x="95" y="82" class="m">1. verifier = random · challenge = sha256(verifier) · state, nonce</text>
    <path d="M90 105 L405 105" class="arrow"/><text x="250" y="100" class="k" text-anchor="middle">2. redirect /authorize?code_challenge&amp;state</text>
    <text x="415" y="130" class="m">3. login + consentement (page de l'IdP)</text>
    <path d="M410 155 L95 155" class="arrow hi"/><text x="250" y="150" class="k" text-anchor="middle">4. redirect_uri?code&amp;state</text>
    <text x="95" y="178" class="m">5. state == state stocké ? sinon STOP</text>
    <path d="M90 200 L405 200" class="arrow"/><text x="250" y="195" class="k" text-anchor="middle">6. POST /token &#123;code, code_verifier&#125;</text>
    <text x="415" y="222" class="m">7. sha256(verifier) == challenge ? code non réutilisé ?</text>
    <path d="M410 245 L95 245" class="arrow hi"/><text x="250" y="240" class="k" text-anchor="middle">8. &#123; id_token, access_token &#125;</text>
    <path d="M90 280 L725 280" class="arrow"/><text x="410" y="275" class="k" text-anchor="middle">9. Bearer access_token → l'API vérifie via les clés publiques (JWKS)</text>
    <text x="410" y="318" class="cap" text-anchor="middle">Un code intercepté ne sert à rien sans le verifier, qui n'a jamais quitté la SPA.</text>
  </svg>`,
})
export class DiagramPkce {}

@Component({
  selector: 'diagram-slices',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 260">${DEFS}
    <text x="200" y="24" class="t" text-anchor="middle" font-weight="700">N-Layered / Clean : découpage par couche</text>
    <rect x="40" y="40" width="320" height="34" class="box a"/><text x="200" y="62" class="t" text-anchor="middle">Controllers / Endpoints</text>
    <rect x="40" y="84" width="320" height="34" class="box b"/><text x="200" y="106" class="t" text-anchor="middle">Services / Application</text>
    <rect x="40" y="128" width="320" height="34" class="box c"/><text x="200" y="150" class="t" text-anchor="middle">Repositories / Infrastructure</text>
    <rect x="40" y="172" width="320" height="34" class="box"/><text x="200" y="194" class="t" text-anchor="middle">Domain / Entities</text>
    <path d="M370 57 L370 190" class="arrow bad"/><text x="380" y="130" class="m">1 feature = 4 fichiers dans 4 dossiers</text>
    <text x="620" y="24" class="t" text-anchor="middle" font-weight="700">Vertical Slice : découpage par feature</text>
    <rect x="470" y="40" width="90" height="166" class="box ok"/><text x="515" y="60" class="k" text-anchor="middle">PlaceOrder/</text>
    <text x="515" y="90" class="m" text-anchor="middle">Endpoint</text><text x="515" y="120" class="m" text-anchor="middle">Handler</text><text x="515" y="150" class="m" text-anchor="middle">Validator</text><text x="515" y="180" class="m" text-anchor="middle">Request</text>
    <rect x="575" y="40" width="90" height="166" class="box ok"/><text x="620" y="60" class="k" text-anchor="middle">GetOrders/</text><text x="620" y="120" class="m" text-anchor="middle">Endpoint + Handler</text>
    <rect x="680" y="40" width="100" height="166" class="box ok"/><text x="730" y="60" class="k" text-anchor="middle">CancelOrder/</text><text x="730" y="120" class="m" text-anchor="middle">Endpoint + Handler</text>
    <text x="410" y="245" class="cap" text-anchor="middle">Slice : tout ce qui change ensemble vit ensemble. Le partage (Result, DbContext, erreurs) va dans Shared/ — seulement quand deux slices en ont besoin.</text>
  </svg>`,
})
export class DiagramSlices {}

@Component({
  selector: 'diagram-modules',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 290">${DEFS}
    <rect x="30" y="30" width="340" height="220" class="box a"/><text x="44" y="52" class="k">Module Orders</text>
    <rect x="50" y="70" width="140" height="36" class="box"/><text x="120" y="93" class="t" text-anchor="middle">PlaceOrderHandler</text>
    <rect x="50" y="120" width="140" height="36" class="box"/><text x="120" y="143" class="t" text-anchor="middle">OrdersDbContext</text>
    <rect x="210" y="70" width="140" height="36" class="box ok"/><text x="280" y="86" class="t" text-anchor="middle">PublicApi</text><text x="280" y="100" class="m" text-anchor="middle">OrderPlaced (event)</text>
    <rect x="50" y="190" width="300" height="40" class="box"/><text x="200" y="215" class="m" text-anchor="middle">orders.db — données privées au module</text>
    <rect x="450" y="30" width="340" height="220" class="box b"/><text x="464" y="52" class="k">Module Products</text>
    <rect x="470" y="70" width="140" height="36" class="box ok"/><text x="540" y="86" class="t" text-anchor="middle">PublicApi</text><text x="540" y="100" class="m" text-anchor="middle">IProductCatalog</text>
    <rect x="630" y="70" width="140" height="36" class="box"/><text x="700" y="93" class="t" text-anchor="middle">OrderPlacedHandler</text>
    <rect x="630" y="120" width="140" height="36" class="box"/><text x="700" y="143" class="t" text-anchor="middle">AppDbContext</text>
    <rect x="470" y="190" width="300" height="40" class="box"/><text x="620" y="215" class="m" text-anchor="middle">devlab.db — données privées au module</text>
    <path d="M190 88 L465 88" class="arrow hi"/><text x="330" y="82" class="m" text-anchor="middle">appelle (interface)</text>
    <path d="M350 100 C 420 140, 560 140, 625 100" class="arrow hi"/><text x="480" y="150" class="m" text-anchor="middle">publie → réagit (event)</text>
    <path d="M190 138 L625 138" class="arrow bad"/><text x="410" y="132" class="m" text-anchor="middle" style="fill: var(--err)">interdit : test d'architecture</text>
    <text x="410" y="278" class="cap" text-anchor="middle">Un monolithe modulaire : un déploiement, des frontières explicites. Le jour où Orders doit scaler seul, il devient un service — sans réécriture.</text>
  </svg>`,
})
export class DiagramModules {}

@Component({
  selector: 'diagram-signals',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 200">${DEFS}
    <rect x="30" y="70" width="130" height="44" class="box d"/><text x="95" y="90" class="t" text-anchor="middle">signal</text><text x="95" y="106" class="k" text-anchor="middle">count = 3</text>
    <rect x="240" y="30" width="150" height="44" class="box b"/><text x="315" y="50" class="t" text-anchor="middle">computed</text><text x="315" y="66" class="k" text-anchor="middle">double = 6</text>
    <rect x="240" y="120" width="150" height="44" class="box b"/><text x="315" y="140" class="t" text-anchor="middle">computed</text><text x="315" y="156" class="k" text-anchor="middle">isEven = false</text>
    <rect x="480" y="30" width="150" height="44" class="box ok"/><text x="555" y="50" class="t" text-anchor="middle">template</text><text x="555" y="66" class="k" text-anchor="middle">{{ '{{' }} double() {{ '}}' }}</text>
    <rect x="480" y="120" width="150" height="44" class="box c"/><text x="555" y="140" class="t" text-anchor="middle">effect</text><text x="555" y="156" class="k" text-anchor="middle">localStorage.set(…)</text>
    <path d="M160 85 L235 55" class="arrow hi"/><path d="M160 100 L235 140" class="arrow hi"/>
    <path d="M390 52 L475 52" class="arrow hi"/><path d="M390 142 L475 142" class="arrow hi"/><path d="M160 92 C 300 92, 380 100, 475 128" class="arrow"/>
    <text x="410" y="192" class="cap" text-anchor="middle">count.set(4) → seuls les nœuds qui dépendent de count sont marqués « dirty » ; le template se re-rend sans zone.js.</text>
  </svg>`,
})
export class DiagramSignals {}

@Component({
  selector: 'diagram-cookie-vs-jwt',
  styles: [BASE_STYLE],
  template: `<svg viewBox="0 0 820 220">${DEFS}
    <text x="210" y="24" class="t" text-anchor="middle" font-weight="700">Cookie (session)</text>
    <rect x="40" y="40" width="340" height="150" class="box c"/>
    <text x="56" y="66" class="m">Navigateur : cookie HttpOnly, envoyé automatiquement</text>
    <text x="56" y="90" class="m">Serveur : ticket chiffré (Data Protection) ou session store</text>
    <text x="56" y="114" class="m">+ XSS ne peut pas lire le cookie</text>
    <text x="56" y="138" class="m">− CSRF possible → SameSite + antiforgery</text>
    <text x="56" y="162" class="m">− Un seul domaine / front ; scale = sticky ou store partagé</text>
    <text x="610" y="24" class="t" text-anchor="middle" font-weight="700">JWT (Bearer)</text>
    <rect x="440" y="40" width="340" height="150" class="box a"/>
    <text x="456" y="66" class="m">Client : ajoute le header lui-même (interceptor)</text>
    <text x="456" y="90" class="m">Serveur : stateless, vérifie la signature</text>
    <text x="456" y="114" class="m">+ Multi-clients (mobile, services), scale horizontal</text>
    <text x="456" y="138" class="m">− Révocation impossible avant exp → tokens courts + refresh</text>
    <text x="456" y="162" class="m">− Stockage côté JS exposé au XSS</text>
    <text x="410" y="212" class="cap" text-anchor="middle">Même app, même domaine → cookie. API consommée par plusieurs clients → JWT/OIDC. Hybride BFF : le meilleur des deux.</text>
  </svg>`,
})
export class DiagramCookieVsJwt {}

export const DIAGRAMS = {
  pipeline: DiagramPipeline, lifetimes: DiagramLifetimes, jwt: DiagramJwt, pkce: DiagramPkce,
  slices: DiagramSlices, modules: DiagramModules, signals: DiagramSignals, 'cookie-vs-jwt': DiagramCookieVsJwt,
} as const;
export type DiagramKey = keyof typeof DIAGRAMS;

/** Renders a diagram by key — used by the interview mode where the diagram is data-driven. */
@Component({
  selector: 'diagram',
  imports: [DiagramPipeline, DiagramLifetimes, DiagramJwt, DiagramPkce, DiagramSlices, DiagramModules, DiagramSignals, DiagramCookieVsJwt],
  template: `
    @switch (key()) {
      @case ('pipeline') { <diagram-pipeline /> }
      @case ('lifetimes') { <diagram-lifetimes /> }
      @case ('jwt') { <diagram-jwt /> }
      @case ('pkce') { <diagram-pkce /> }
      @case ('slices') { <diagram-slices /> }
      @case ('modules') { <diagram-modules /> }
      @case ('signals') { <diagram-signals /> }
      @case ('cookie-vs-jwt') { <diagram-cookie-vs-jwt /> }
    }
  `,
})
export class Diagram { readonly key = input.required<DiagramKey>(); }
