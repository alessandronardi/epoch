# The Epochs — Specifica tecnica di design e sviluppo

**Documento:** TECH-SPEC v2.0 (Definitiva Unificata)  
**Destinatario:** orchestratore e agenti IA che generano il codice  
**Fonte normativa delle regole:** `docs/GDD.md` (GDD v1.0 Definitivo, congelato)

\---

## 0\. Come usare questo documento

### 0.1 Gerarchia delle fonti

1. **`docs/GDD.md`**: unica fonte normativa delle regole di gioco. Non va mai modificato dall'agente.
2. **Questo documento (`docs/TECH-SPEC.md`)**: architettura, formati dati, macchina a stati, protocollo, concorrenza, UI mobile-first, pipeline dei contenuti, vettori di test e milestone.
3. **`docs/DECISIONS.md`**: registro delle interpretazioni architetturali e delle deviazioni (ADR). L'agente lo crea e lo aggiorna (formato in sezione 13.3).

### 0.2 Quando il GDD è ambiguo

* Non inventare mai regole, carte, costi o eccezioni di combattimento.
* Applica le decisioni confermate e i default della **sezione 11**, implementandoli come campi tipizzati di `RulesConfig`, mai come costanti magiche sparse nel codice.
* Se durante lo sviluppo emerge un punto ambiguo non coperto dalla sezione 11: **fermati su quel ramo, scrivi la domanda in `docs/DECISIONS.md` con stato `APERTA` e chiedila all'umano**. Nel frattempo prosegui con i moduli non dipendenti.
* Ogni regola implementata in `packages/engine` deve citare nel codice (commento breve) il paragrafo del GDD, es. `// GDD §5.3 Fase 2B`.

### 0.3 Convenzioni

* Identificatori, tipi e file in **inglese**; testi visibili all'utente in **italiano** (con struttura i18n pronta per altre lingue) redatti in sentence case.
* Glossario di mapping (da rispettare ovunque):

|Termine GDD|Identificatore|
|-|-|
|Cibo / Legno / Metallo|`food` / `wood` / `metal`|
|Mura|`walls`|
|Centro Città|`cityCenter` (HP correnti: `cityHp`, massimo: `cityMax`, danno accumulato: `cityDamage`)|
|Fronte / Centro / Retroguardia|`front` / `center` / `rear`|
|Era, Ciclo|`era`, `cycle`|
|Passo|`pass`|
|Carta da campo|`fieldCard` (tipi `economy`, `unit`)|
|Istantanea|`instant`|
|Riconversione|`conversion`|
|Fanteria, Lanciere, Cavalleria, Arciere, Assedio|`infantry`, `spearman`, `cavalry`, `archer`, `siege`|
|Edificio Economico|`building`|
|Razzia, Breccia, Stallo|`raid`, `breach`, `stalemate`|
|Ordine di pesca, ordine di schieramento|`drawnOrder`, `seq`|

\---

## 1\. Obiettivi e perimetro

**Prodotto:** gioco di carte collezionabili competitivo 1v1 a 3 Ere (**The Epochs**), giocabile da dispositivi mobili e desktop via browser (PWA) contro un avversario online, contro bot in locale (anche offline) o in modalità hot-seat sullo stesso dispositivo.

**Deliverable:**

1. Motore di gioco deterministico in TypeScript puro, testato con vettori nominali e property-based testing, condiviso da client, server e simulatore.
2. Client web/mobile responsive (PWA) con interfaccia da TCG: carte con arte e testi dedicati in stile *Magic*, campo di battaglia a 3 linee, animazioni degli eventi guidate da coda deterministica (`EventPlayer`).
3. Server autoritativo per le partite online (con controllo di concorrenza ottimistica, idempotenza, persistenza ibrida snapshot + event sourcing, riconnessione e replay).
4. Bot e simulatore headless multi-thread per bilanciamento e validazione statistica.
5. Pipeline dei contenuti: dati regole carte, testi (regole generate e flavor), illustrazioni.
6. Deck builder (60 carte: 3 sotto-mazzi da 20, massimo 3 copie per carta).

**Fuori perimetro per l'MVP:** classifiche/ELO, pagamenti, bustine, rarità e monetizzazione, chat, spettatori live, editor carte utente, collezione progressiva (tutte le 45 carte ufficiali sono disponibili da subito).

\---

## 2\. Stack tecnologico

Versioni: usare l'ultima stabile al momento dell'installazione e fissarla rigorosamente nel lockfile (`pnpm-lock.yaml`). Non lasciare dipendenze a `latest`. Deviare dalle scelte sotto richiede una voce approvata in `docs/DECISIONS.md`.

|Area|Scelta|Note|
|-|-|-|
|Linguaggio|TypeScript `strict`, con `noUncheckedIndexedAccess` ed `exactOptionalPropertyTypes`|Vietato `any` (regola ESLint bloccante)|
|Runtime|Node.js LTS corrente||
|Monorepo|`pnpm` workspaces|Turborepo opzionale|
|Client|React + Vite|Rendering delle carte in DOM/CSS Grid + Container Queries, non canvas|
|Stato client|Zustand|Contiene l'ultima `PlayerView`, lo stato UI effimero e la coda di eventi da animare|
|Immutabilità|Immer, solo dentro `packages/engine`||
|Validazione|Zod|Ai confini: file dati, protocollo di rete, payload DB|
|Animazioni|Motion (ex Framer Motion)||
|Drag and drop|`@dnd-kit/core`|Sempre affiancato da flusso alternativo *Tap carta $\\to$ Tap zona/pulsante*|
|Test|Vitest, `fast-check`, Playwright, `axe-core`||
|Server|Fastify + `@fastify/websocket`||
|Database|SQLite (`better-sqlite3`) dietro interfaccia repository|Architettura pronta per PostgreSQL in produzione|
|Immagini|`sharp`|Output WebP + AVIF in 3 larghezze ($256 / 512 / 1024\\text{ px}$)|
|PWA|`vite-plugin-pwa`|Funzionamento completo offline contro Bot e in Hot-Seat|
|Log|`pino`|Log strutturati JSON, privi di dati segreti di partita|
|Font|`@fontsource/\*` self-hosted|Nessuna richiesta runtime a CDN esterni|
|Icone|`lucide-react`|Affiancate da SVG dedicati per risorse, linee ed Ere|
|Qualità|ESLint (flat config), Prettier||

\---

## 3\. Struttura del repository

```text
the-epochs/
├─ docs/
│  ├─ GDD.md                    # normativo, congelato, non modificare
│  ├─ TECH-SPEC.md              # questo documento
│  └─ DECISIONS.md              # registro decisioni (ADR, creato e mantenuto dall'agente)
├─ data/
│  ├─ cards.rules.json          # dati di regole (generato da GDD §7 + mapping esplicito)
│  ├─ cards.text.it.json        # nome, type line, flavor text per carta
│  ├─ cards.art.json            # metadati arte per carta (file, alt, prompt, stato)
│  ├─ decks/                    # mazzi preset validi (Aggro, Balanced, Boom)
│  ├─ scenarios/                # scenari JSON e vettori di validazione
│  ├─ art/src/                  # master delle illustrazioni: {cardId}.png
│  └─ schema/                   # schemi Zod/JSON Schema dei file dati
├─ packages/
│  ├─ engine/                   # logica pura, zero I/O (sezione 4)
│  ├─ protocol/                 # schemi Zod dei messaggi di rete e codici errore (sezione 6)
│  ├─ content/                  # loader, validazione, generazione testo regole (sezione 8)
│  ├─ bots/                     # RandomBot, GreedyBot, RationalBot, interfaccia Bot (sezione 7)
│  └─ sim/                      # simulatore headless e CLI multi-worker (sezione 7)
├─ apps/
│  ├─ server/                   # Fastify + WebSocket + Repository DB (sezione 6)
│  └─ web/                      # React + Vite + PWA (sezione 9)
└─ tools/
   ├─ gdd-to-cards.ts           # parser delle tabelle GDD §7 -> cards.rules.json
   ├─ card-effects.ts           # mapping deterministico abilità ed effetti del catalogo
   ├─ content-validate.ts       # controlli di completezza contenuti (sezione 8.6)
   ├─ validate-scenarios.ts     # esecutore standalone di scenari e test vectors JSON (sezione 7.3)
   ├─ art-build.ts              # pipeline immagini (sharp)
   └─ art-placeholders.ts       # generatore SVG segnaposto per arte mancante
```

**Regole di dipendenza** (imposte con ESLint `no-restricted-imports`):

* `packages/engine` non importa nulla dal resto del repo né librerie di I/O;
* `packages/protocol`, `packages/content`, `packages/bots`, `packages/sim` dipendono solo da `packages/engine` (e tra loro secondo necessità unidirezionale: `sim` $\\to$ `bots` $\\to$ `engine`);
* `apps/\*` possono dipendere da tutti i `packages/\*`;
* nessun package dentro `packages/\*` può importare da `apps/\*`.

\---

## 4\. Motore di gioco (`packages/engine`)

### 4.1 Principi non negoziabili

1. **Funzioni pure.** Nessun I/O, nessun `Date`, nessun `Math.random`, nessun accesso a variabili globali. ESLint deve vietare `Math.random`, `Date.now`, `new Date`, `setTimeout`, `fetch`, `process` dentro `packages/engine`.
2. **Determinismo.** Dati stato iniziale e sequenza di comandi, stato ed eventi risultanti sono identici bit per bit. L'unica fonte di casualità è un PRNG con seed (sezione 4.2), usato esclusivamente per assegnare P1/P2 e mescolare i sotto-mazzi a inizio partita. La battaglia non usa mai casualità.
3. **Stato serializzabile.** Solo oggetti JSON-safe: niente `Map`, `Set`, istanze di classi, `undefined`, funzioni. Le liste ordinate sono array.
4. **Immutabilità.** L'API pubblica non muta mai l'input; internamente si usa Immer.
5. **Errori di dominio come valori.** `apply` restituisce `Result<TransitionSuccess, RuleError>`, non lancia mai eccezioni per comandi illegali.
6. **Il motore non conosce i client.** Lo stato canonico `GameState` contiene informazione nascosta; l'uscita verso i client o i bot passa **sempre** da `playerView` e `projectEvent` (sezione 5).
7. **Data-driven.** Nessun nome o valore specifico di carta è cablato nel codice dell'engine: tutto arriva dal dizionario caricato da `cards.rules.json`. I test unitari includono carte sintetiche per provare che l'engine non dipende dal catalogo reale.

### 4.2 PRNG e mescolamento

* Algoritmo: **`sfc32`**, stato composto da 4 interi senza segno a $32\\text{ bit}$, inizializzato da una stringa `seed` tramite funzione di hash **`xmur3`**. Lo stato corrente del generatore vive in `GameState.rngState`.
* Mescolamento: **Fisher-Yates** dall'ultimo elemento verso il primo (`for i = n - 1 down to 1`), con indice $j = \\lfloor \\text{rng}() \\times (i + 1) \\rfloor$.
* Documentare l'algoritmo esatto nel codice sorgente per garantire riproducibilità assoluta tra ambienti e script di validazione.

### 4.3 Modello dati canonico

```ts
export type PlayerId = 'P1' | 'P2';
export type EraNo = 1 | 2 | 3;
export type Resource = 'food' | 'wood' | 'metal';
export type Resources = Record<Resource, number>;
export type Line = 'front' | 'center' | 'rear';
export type CardType = 'economy' | 'unit' | 'instant' | 'conversion';
export type UnitCategory = 'infantry' | 'spearman' | 'cavalry' | 'archer' | 'siege';

// --- Dati di regole (da cards.rules.json) ---
export interface CardRules {
  id: string;                  // es. 'u2\_inf\_h'. ATTENZIONE: il prefisso NON determina il tipo
  era: EraNo;                  // sotto-mazzo di appartenenza (1 | 2 | 3)
  type: CardType;              // determinato dal campo 'Tipo / Cat.' del GDD, mai dall'ID
  category?: UnitCategory;     // presente solo per type === 'unit'
  line?: Line;                 // presente solo per type === 'unit' (front | center | rear)
  cost: Resources;
  atk?: number;
  dem?: number;
  hp?: number;
  isCombatant?: boolean;       // false per category === 'siege', true per le altre unit
  production?: Resources;      // presente solo per type === 'economy'
  abilities: Ability\[];
  effect?: InstantEffect | ConversionEffect;
}

export type Ability =
  | { kind: 'impale'; damage: number }          // vs Cavalleria; valore stampato sulla carta (D1)
  | { kind: 'volley'; bonusVsSpearman: number } // Tiro vs Lancieri; valore stampato sulla carta (D1)
  | { kind: 'flank'; bonusVsArcher: number };   // Accerchiamento vs Arcieri; valore stampato (D1)

export type InstantEffect =
  | { kind: 'atk\_mod'; target: 'own\_archers' | 'own\_front'; amount: number }
  | { kind: 'walls\_mod'; target: 'own' | 'enemy'; amount: number };  // amount con segno (+3, -4, -6)

export type ConversionEffect =
  | { kind: 'gain\_per\_building'; perBuilding: Resources }            // Gilda dei Mercanti
  | { kind: 'gain\_and\_dem\_bonus'; gain: Resources; demBonus: number }; // Altoforno Reale

// --- Istanze in partita ---
export interface CardInstance {
  uid: string;
  cardId: string;
  owner: PlayerId;
  drawnOrder: number;
}

export interface UnitInstance extends CardInstance {
  seq: number;
  hp: number;
  line: Line;
  atkMod: number;
  revealed: boolean;
}

export interface PlayerState {
  hand: CardInstance\[];
  subdecks: Record<EraNo, CardInstance\[]>;   // indice 0 = cima del sotto-mazzo
  discard: CardInstance\[];
  resources: Resources;
  buildings: CardInstance\[];                 // edifici economici attivi (sempre coperti per l'avversario)
  units: UnitInstance\[];                     // coperte in 'development', rivelate in 'prebattle'
  slotsUsed: number;                         // nuove carte da campo giocate nell'Era corrente
  passed: boolean;
  walls: number;
  cityMax: number;
  cityDamage: number;                        // cityHp derivato = cityMax - cityDamage
  demBonus: number;                          // bonus da Altoforno Reale in Era III, cumulabile
  mulliganDone: boolean;
}

export type Phase = 'mulligan' | 'hand\_limit' | 'development' | 'prebattle' | 'finished';

export type PendingCommit =
  | { window: 'mulligan'; cardUids: string\[] }
  | { window: 'hand\_limit'; cardUids: string\[] }
  | { window: 'prebattle'; cardUids: string\[] };

export interface GameState {
  schemaVersion: 1;
  rulesetVersion: '1.0';
  catalogVersion: '1.0';
  stateVersion: number;                      // intero monotono incrementato a ogni apply valido
  rules: RulesConfig;                        // sezione 11 e Appendice C.4
  seed: string;
  rngState: \[number, number, number, number];
  era: EraNo;
  phase: Phase;
  cycle: number;
  initiative: PlayerId;                      // chi agisce per primo nell'Era corrente (P1 in I/III, P2 in II)
  toAct: PlayerId | null;                    // valorizzato solo in 'development'
  players: Record<PlayerId, PlayerState>;
  pending: Partial<Record<PlayerId, PendingCommit>>;  // scelte simultanee bloccate ma non ancora rivelate
  counters: { uid: number; drawnOrder: number; seq: number; event: number };
  result: GameResult | null;
}
```

### 4.4 Flusso di gioco (macchina a stati)

Gli stati **stabili** (in cui il motore restituisce il controllo e attende comandi dai giocatori) sono `mulligan`, `hand\_limit`, `development`, `prebattle`, `finished`. Tutto il resto avviene **atomicamente dentro `apply`** come sequenza deterministica di passi automatici che emettono eventi.

|Passo|Tipo|Riferimento GDD|
|-|-|-|
|1. Avvio partita: assegnazione P1/P2, mescolamento indipendente dei 3 sotto-mazzi per giocatore, Mura $6$, Centro Città $10/10$ (`cityDamage = 0`), risorse iniziali $2/2/0$|automatico|§3.2, §3.3.1, §2.1|
|2. Pesca iniziale Era I ($8$ carte dal sotto-mazzo Era I)|automatico|§2.2|
|3. **`mulligan`**: scelta simultanea e coperta di $0..8$ carte (solo Era I)|attesa comandi|§2.2|
|4. Inizio Era II / III: aggiornamento Mura e Centro Città, pesca ($5$ carte dal rispettivo sotto-mazzo)|automatico|§6, §2.2|
|5. **`hand\_limit`**: solo per chi supera $10$ carte dopo la pesca d'apertura d'Era, scelta simultanea|attesa comandi|§2.3|
|6. Raccolto d'apertura d'Era (prima del Ciclo 1 di `development`)|automatico|§3.3.2|
|7. **`development`**: cicli condivisi ($1, 2, 3, 4\\dots$), un'opportunità d'azione per giocatore non passato in ordine d'iniziativa|attesa comandi|§4.1, §3.3.3–7|
|8. Ingresso in Pre-Battaglia: entrambi hanno passato $\\to$ **rivelazione di tutte le Unità sulle rispettive linee** e **saldi risorse resi pubblici**|automatico|§4.2, §5.1|
|9. **`prebattle`**: selezione simultanea e coperta delle Istantanee dalla mano (a unità e risorse nemiche già visibili), poi rivelazione simultanea e applicazione aggregata degli effetti|attesa comandi|§5.1|
|10. Battaglia campale deterministica (Fasi 1, 2A, 2B, 3) ed eventuale Fase 4 (Demolizione, Breccia, Razzia)|automatico|§5.2–5.3|
|11. Fine Era: scarto di tutte le unità superstiti, transizione all'Era successiva (passo 4) oppure fine partita (`finished`)|automatico|§6|

**Note normative di flusso:**

* **Era I:** dotazione iniziale $2/2/0$, pesca $8$ carte, fase `mulligan`, poi raccolto d'apertura ($+2\\text{ food}, +2\\text{ wood}, +0\\text{ metal}$) che porta il saldo a $4/4/0$ all'apertura del Ciclo 1. Nessun controllo di `hand\_limit` in Era I ($8 \\le 10$).
* **Limite di mano ($10$ carte):** in Era II e III si pescano prima tutte le $5$ carte previste (sommandole a quelle rimaste in mano). Se almeno un giocatore ha più di $10$ carte, il motore entra in `hand\_limit` attendendo `SubmitDiscard` solo dai giocatori che eccedono $10$. Quando tutti hanno $\\le 10$ carte, il motore accredita il Raccolto d'apertura d'Era e apre il Ciclo 1 di `development`.
* **Cap delle risorse:** ogni accredito viene troncato al cap dell'Era corrente ($7$ in Era I, $11$ in Era II, $16$ in Era III); l'eccedenza produce un evento `ResourcesOverflowed` e va perduta. Le risorse non spese si conservano tra le Ere.
* **Rendite periodiche (§3.3.4–6):** all'apertura del Ciclo 2 e del Ciclo 3, se almeno un giocatore non ha passato, **entrambi** i giocatori (incluso chi avesse già passato al ciclo precedente) ricevono $+1\\text{ food}, +1\\text{ wood}$ più **una volta** il vettore di produzione degli edifici attivi in quel momento. Se entrambi hanno passato, la Fase di Sviluppo termina immediatamente senza aprire il nuovo ciclo e senza accreditare rendite. Dal Ciclo 4 in poi non vi è alcuna rendita periodica.
* **Ordine dei giocatori in un ciclo:** sempre quello di iniziativa dell'Era (`P1` in Era I e III, `P2` in Era II); chi ha già dichiarato Passo viene saltato.
* **Opportunità d'azione (§4.1):** il giocatore attivo non passato deve scegliere **esattamente una** opzione tra *giocare al massimo una (1) carta legalmente giocabile* oppure *dichiarare Passo*. Se non dispone di alcuna carta legalmente giocabile, passa (vedi `D6`).
* **Legalità delle giocate:**

  * `PlayCard` (`economy` o `unit`): la carta è in mano (può appartenere all'Era corrente o a un'Era precedente), `slotsUsed < capLogisticoEra` ($4$ in Era I, $5$ in Era II, $6$ in Era III), e il costo è interamente pagabile col saldo risorse corrente.
  * `PlayConversion` (`conversion`): siamo in `development` di **Era III**, la carta è in mano, il costo è pagabile e il giocatore possiede almeno $1$ edificio economico attivo in `buildings` da sacrificare.
  * Le carte `instant` **non** sono giocabili durante `development`.
  * Le carte `conversion` e `instant` consumano $0$ slot del Cap Logistico.
* **Slot logistici:** `slotsUsed` si azzera all'inizio di ogni Era. Gli edifici economici costruiti in Ere precedenti restano attivi ma non occupano slot della nuova Era.
* **Contatori `seq` e `drawnOrder`:** interi monotoni crescenti nel `GameState` (`seq` assegnato al momento della giocata di un'unità, `drawnOrder` assegnato a ogni singola carta pescata).

### 4.5 Comandi ed eventi

**Comandi** (ogni comando inviato al motore include `player: PlayerId`):

|Comando|Fase valida|Note|
|-|-|-|
|`SubmitMulligan { cardUids }`|`mulligan`|Lista vuota = nessun cambio. Pesca prima $N$ sostitute dalla cima del sotto-mazzo Era I, poi mette le $N$ carte rese in fondo al sotto-mazzo Era I (ordinate per `drawnOrder` crescente)|
|`SubmitDiscard { cardUids }`|`hand\_limit`|Obbligatorio solo per chi ha $>10$ carte; deve riportare la mano esattamente a $10$ carte|
|`PlayCard { cardUid }`|`development`|Carta `economy` o `unit`; viene collocata coperta nella zona cittadina e incrementa `slotsUsed` di $1$|
|`PlayConversion { cardUid, sacrificeUid }`|`development`|Solo Era III; sacrifica `sacrificeUid` da `buildings`, consuma $0$ slot|
|`Pass {}`|`development`|Irrevocabile per l'Era corrente|
|`LockInstants { cardUids }`|`prebattle`|Lista di $0$ o più `cardUid` di tipo `instant` in mano; il costo aggregato deve essere pagabile col saldo corrente|
|`ApplyTimeout {}`|qualsiasi fase di attesa|Emesso dal server o dal controller; applica la politica deterministica (sezione 11 `D2`)|
|`Concede {}`|qualsiasi (tranne `finished`)|Resa del giocatore; vittoria immediata all'avversario|

**Finestre simultanee (`mulligan`, `hand\_limit`, `prebattle`):**

* Il comando del primo giocatore che conferma viene salvato in `state.pending\[player]` ed emette l'evento pubblico `PlayerCommitted { player, window }` **senza svelare le carte scelte**.
* Se un giocatore tenta di inviare un secondo comando nella stessa finestra dopo il commit, riceve errore `DECISION\_ALREADY\_LOCKED`.
* Non appena tutti i giocatori attesi nella finestra hanno confermato, il motore risolve simultaneamente le scelte, svuota `pending` ed emette gli eventi di risoluzione/rivelazione.

**Sequenza Normativa degli Eventi:**
Ogni evento possiede un numero sequenziale monotono `n` (`event\_sequence`). Il payload interno è completo; la redazione per ciascun destinatario avviene in `projectEvent`:

1. Setup \& Inizio Era: `GameStarted`, `InitiativeAssigned`, `CardsDrawn`, `PlayerCommitted`, `MulliganResolved`, `EraStarted`, `HandLimitDiscarded`, `ResourcesChanged { reason: 'initial' | 'harvest' | 'rent' | 'cost' | 'conversion' | 'raid' }`, `ResourcesOverflowed`.
2. Sviluppo: `CycleStarted`, `CardPlayed`, `ConversionActivated`, `PlayerPassed { reason: 'chosen' | 'no\_legal\_play' | 'timeout' }`.
3. Ingresso in Pre-Battaglia (appena entrambi hanno passato): `DevelopmentEnded`, **`UnitsRevealed`** (tutte le unità coperte vengono rivelate e posizionate sulle linee `front`, `center`, `rear`, e i saldi risorse diventano visibili).
4. Chiusura Pre-Battaglia (appena entrambi hanno inviato `LockInstants`): `PlayerCommitted`, **`InstantsRevealed`** (rivelazione simultanea delle Istantanee scelte e pagamento costi), **`WallsModified`** (applicazione aggregata dei bonus/malus alle Mura con clamp a $0$).
5. Battaglia e Assedio: `BattleStarted`, `BattlePhaseResolved { phase, damageDealt, assignments, casualties }`, `BattleOutcome { kind: 'winner' | 'mutual\_annihilation' | 'stalemate', winner? }`, `SiegeResolved { attacker, defender, D, W, breach, wallsAfter, directDamage, cityHpAfter }`, `RaidResolved { foodTransferred, woodTransferred }`.
6. Transizione e Fine Partita: `EraEnded`, `GameEnded { kind: 'annihilation' | 'points' | 'draw' | 'concession' | 'timeout', winner: PlayerId | 'DRAW' }`.

### 4.6 API pubblica del package `packages/engine`

```ts
export function createGame(config: NewGameConfig): { state: GameState; events: GameEvent\[] };
export function validateDeck(deck: DeckPayload, catalog: Record<string, CardRules>): ValidationIssue\[];
export function apply(state: GameState, cmd: Command): Result<{ state: GameState; events: GameEvent\[] }, RuleError>;
export function legalCommands(state: GameState, player: PlayerId): LegalCommands;
export function playerView(state: GameState, viewer: PlayerId): PlayerView;
export function projectEvent(event: GameEvent, viewer: PlayerId): GameEvent | null;
export function stateHash(state: GameState): string; // JSON canonico ordinato + SHA-256
export function autoDiscard(hand: CardInstance\[], catalog: Record<string, CardRules>, countToDiscard: number): string\[];
```

* `legalCommands` calcola tutte le mosse valide per `player` nello stato corrente e, per ogni carta in mano non giocabile, restituisce il codice motivo esatto (`no\_slot`, `insufficient\_resources`, `no\_building\_to\_sacrifice`, `wrong\_phase`, `already\_passed`, `already\_committed`) usato dalla UI per mostrare feedback contestuale.
* `autoDiscard` implementa la politica deterministica obbligatoria del GDD §2.3.3: ordina la mano per `card.era` crescente, a parità per costo totale (`cost.food + cost.wood + cost.metal`) crescente, a ulteriore parità per `drawnOrder` crescente (FIFO), e restituisce i primi `countToDiscard` `uid`.

### 4.7 Finestra Pre-Battaglia (§5.1)

1. **Rivelazione pre-scelta:** non appena il secondo giocatore dichiara Passo in `development`, il motore emette `DevelopmentEnded` e `UnitsRevealed` (`u.revealed = true` per tutte le unità schierate da P1 e P2) ed entra in fase `prebattle`. Da questo istante, in `PlayerView`, `opponent.units` e `opponent.resources` sono **pubblici** (mentre `opponent.buildings` resta nascosto).
2. **Selezione segreta:** ciascun giocatore invia `LockInstants { cardUids }` scegliendo $0$ o più carte di tipo `instant` dalla propria mano. Il motore valida che ogni `cardUid` sia un'`instant` distinta presente nella mano del giocatore e che la **somma aggregata dei costi** di tutte le carte scelte sia $\\le$ al saldo risorse corrente del giocatore.
3. **Rivelazione simultanea e calcolo effetti:** quando entrambi i giocatori hanno confermato il lock:

   * Si emette `InstantsRevealed`, si scalano i costi aggregati (`ResourcesChanged { reason: 'cost' }`) e si spostano le carte Istantanee giocate dalla mano a `discard`.
   * **Modificatori ATK (`atk\_mod`):** si sommano a `u.atkMod` delle proprie unità bersaglio (`own\_archers` $\\to$ unità con `category === 'archer'`; `own\_front` $\\to$ unità con `line === 'front'`). Il bonus resta attivo **per tutte le fasi della battaglia dell'Era corrente**.
   * **Modificatori Mura (`walls\_mod`):** per ciascun giocatore si sommano algebricamente tutti i propri bonus Mura (`target: 'own'`) e tutti i malus Mura inflitti dall'avversario (`target: 'enemy'`), applicando il limite minimo a $0$ **solo alla fine della somma aggregata**:
$$W\_{\\text{post}} = \\max\\left(0,; W\_{\\text{pre}} + \\sum \\Delta W\_{\\text{own}} + \\sum \\Delta W\_{\\text{enemy}}\\right)$$
   * Le modifiche agli HP delle Mura sono **permanenti** (se non ridotte ulteriormente in Fase 4, incidono sul calcolo di riporto di fine Era).
   * L'ordine in cui le Istantanee sono state cliccate o inviate non altera mai il risultato.

### 4.8 Implementazione normativa della battaglia (GDD §5.2–5.3)

**Definizioni per unità:**

* $\\text{effAtk}(u) = \\text{card.atk} + u.\\text{atkMod}$
* $\\text{effDem}(u) = \\text{card.dem} + \\text{owner.demBonus}$
* Un'unità è **combattente** se `card.isCombatant === true` (Fanteria, Lanciere, Cavalleria, Arciere). Le unità d'Assedio (`isCombatant === false`) non sono mai bersaglio e non infliggono mai danno nelle Fasi 1, 2A, 2B e 3.
* `snapshot`: copia immutabile delle unità vive (`hp > 0`) all'inizio della singola fase o del singolo ciclo di mischia.

**Guardia Pre-Fase (§5.2)** — eseguita prima di Fase 1, prima di Fase 2A, prima di Fase 2B, prima di ciascuno dei $6$ cicli della Fase 3, e **anche subito dopo la rimozione dei caduti del $6^\\circ$ ciclo della Fase 3**:

```text
c1 = numero di unità combattenti vive di P1
c2 = numero di unità combattenti vive di P2

se c1 == 0 e c2 == 0 -> emetti BattleOutcome { kind: 'mutual\_annihilation' }
                        salta tutte le fasi restanti e salta la Fase 4
se c1 > 0 e c2 == 0  -> emetti BattleOutcome { kind: 'winner', winner: 'P1' }
                        salta le fasi tra truppe restanti e vai direttamente alla Fase 4
se c1 == 0 e c2 > 0  -> emetti BattleOutcome { kind: 'winner', winner: 'P2' }
                        salta le fasi tra truppe restanti e vai direttamente alla Fase 4
altrimenti           -> procedi (o, se siamo dopo il 6° ciclo di Fase 3, emetti BattleOutcome { kind: 'stalemate' } e salta la Fase 4)
```

**Sequenza in 4 passaggi di ogni fase/ciclo (§5.2):**

1. **Snapshot:** lettura dello stato delle unità vive (`hp > 0`) all'inizio della fase/ciclo.
2. **Calcolo:** determinazione dei bonus condizionati e del danno totale `dmg\[P1]` e `dmg\[P2]` leggendo **esclusivamente** lo snapshot, senza mutare alcuna unità.
3. **Applicazione Simultanea:** per ciascun lato, ordinamento dei bersagli nemici tramite `orderTargets(enemySnapshot, linePriority, filter)` e ripartizione del danno con trasferimento dell'eccesso tramite `assignDamage`. I danni calcolati dai due lati vengono sottratti contemporaneamente agli HP delle unità bersaglio.
4. **Rimozione:** tutte le unità con `hp <= 0` vengono eliminate simultaneamente e spostate in `discard` prima del controllo di guardia successivo.

```ts
function orderTargets(
  units: readonly UnitInstance\[],
  linePriority: readonly Line\[],
  filter: (u: UnitInstance) => boolean = () => true
): UnitInstance\[] {
  return units
    .filter(u => isCombatant(u) \&\& u.hp > 0 \&\& filter(u))
    .slice()
    .sort((a, b) => linePriority.indexOf(a.line) - linePriority.indexOf(b.line) || a.seq - b.seq);
}

function assignDamage(totalDamage: number, targets: readonly UnitInstance\[]): Array<{ uid: string; damage: number }> {
  let rest = totalDamage;
  const assignments: Array<{ uid: string; damage: number }> = \[];
  for (const t of targets) {
    if (rest <= 0) break;
    const d = Math.min(rest, t.hp); // l'eccesso oltre t.hp passa al bersaglio successivo
    assignments.push({ uid: t.uid, damage: d });
    rest -= d;
  }
  return assignments; // l'eventuale danno residuo senza altri bersagli validi va perduto
}
```

**Dettaglio delle Fasi (§5.3):**

* **Fase 1 — Tiro degli Arcieri:** per ciascun lato, ogni proprio Arciere vivo infligge $\\text{effAtk}(u)$, aggiungendo il bonus `volley.bonusVsSpearman` stampato sulla carta (confermato in `D1`: $+1$ per carte Era I, $+2$ per carte Era II, $+3$ per carte Era III) **se lo snapshot nemico contiene almeno un Lanciere vivo** (`category === 'spearman'`). Priorità bersagli: `\['front', 'center', 'rear']`.
* **Fase 2A — Impalamento:** sullo snapshot post-Fase 1, ogni proprio Lanciere vivo infligge `impale.damage` stampato sulla carta ($3$ per Lancieri di Era I, $5$ per Era II, $7$ per Era III; vedi `D1`) **esclusivamente contro unità di Cavalleria nemiche** (`u.category === 'cavalry'`), ordinate per `seq` crescente (FIFO). L'eccesso di danno oltre l'ultima Cavalleria nemica si perde. Le Cavallerie ridotte a $\\le 0\\text{ HP}$ vengono rimosse prima della Fase 2B.
* **Fase 2B — Impatto e Accerchiamento:** sullo snapshot post-Fase 2A, sia `enemyHasSpearman` la presenza di almeno un Lanciere vivo nello snapshot nemico e `enemyHasArcher` la presenza di almeno un Arciere vivo nello snapshot nemico:

  * **Se `!enemyHasSpearman` (Accerchiamento):** ogni propria Cavalleria viva infligge $\\text{effAtk}(u)$ più `flank.bonusVsArcher` stampato sulla carta ($+1/+2/+3$, vedi `D1`) **se `enemyHasArcher` è vero**. Priorità bersagli invertita: `\['rear', 'front', 'center']`.
  * **Se `enemyHasSpearman`:** ogni propria Cavalleria viva infligge solo $\\text{effAtk}(u)$ (nessun bonus). Priorità bersagli standard: `\['front', 'center', 'rear']`.
* **Fase 3 — Mischia Generale (Max 6 Cicli):** si eseguono fino a $6$ cicli, ciascuno preceduto dalla Guardia Pre-Fase. Ad ogni ciclo, ogni propria unità combattente viva contribuisce con $\\text{effAtk}(u)$, ad eccezione degli **Arcieri** che contribuiscono con:
$$\\text{atkMischia}(u) = \\max\\left(1,; \\left\\lfloor \\frac{\\text{effAtk}(u)}{2} \\right\\rfloor\\right)$$
*(confermato in `D4`: il dimezzamento si applica all'attacco effettivo comprensivo di eventuali buff da Istantanee)*. Nessun bonus di Tiro, Impalamento o Accerchiamento si applica in Fase 3. Priorità bersagli: `\['front', 'center', 'rear']`. Dopo la rimozione dei caduti del $6^\\circ$ ciclo si esegue la Guardia: se entrambi i giocatori hanno ancora almeno $1$ combattente vivo, l'esito è `stalemate` (Stallo) e la Fase 4 viene saltata.
* **Fase 4 — Demolizione, Breccia e Razzia:** eseguita **esclusivamente** se la battaglia campale è terminata con `BattleOutcome { kind: 'winner' }`. Sia l'attaccante il vincitore campale e il difensore l'avversario:

  1. $D = \\sum \\text{effDem}(u)$ su **tutte** le unità superstiti del vincitore (unità combattenti superstiti + unità d'Assedio).
  2. $W = \\text{walls}$ correnti del difensore.
  3. $\\text{breach} = (D > 0) \\land (D \\ge W)$.
  4. $\\text{walls}\_{\\text{finali}} = \\max(0,; W - D)$.
  5. $\\text{directDamage} = \\max(0,; D - W)$, sommato a `defender.cityDamage` (quindi $\\text{cityHp} = \\text{cityMax} - \\text{cityDamage}$).
  6. Se $\\text{cityHp} \\le 0$: la partita termina **immediatamente** con `GameEnded { kind: 'annihilation', winner: attacker }` **senza eseguire la razzia**.
  7. Altrimenti, se $\\text{breach} === \\text{true}$: per ciascuna risorsa $r \\in {\\text{'food'}, \\text{'wood'}}$, si trasferisce dal difensore all'attaccante:
$$\\Delta r = \\min\\left(1,; \\text{defender.resources}\[r],; \\text{capEra} - \\text{attacker.resources}\[r]\\right)$$
Il Metallo (`metal`) non viene mai razziato.

### 4.9 Fine Era e Condizioni di Vittoria (§6)

Al termine della battaglia (e dell'eventuale Fase 4) dell'Era I e dell'Era II, se nessun Centro Città è a $\\le 0\\text{ HP}$:

1. Tutte le Unità superstiti (combattenti e d'Assedio) di entrambi i giocatori vengono scartate in `discard`; gli Edifici Economici (`buildings`) restano attivi in campo.
2. Si aggiornano gli HP delle Mura per la nuova Era:
$$\\text{walls}*{\\text{nuovaEra}} = \\text{Base}*{\\text{nuovaEra}} + \\left\\lfloor \\frac{\\text{walls}*{\\text{residui}}}{2} \\right\\rfloor$$
dove $\\text{Base}*{\\text{Era II}} = 8$ e $\\text{Base}\_{\\text{Era III}} = 10$.
3. Si aggiorna il massimale del Centro Città conservando il danno diretto accumulato:
$$\\text{cityHp}*{\\text{nuovaEra}} = \\text{Max}*{\\text{nuovaEra}} - \\text{cityDamage}$$
dove $\\text{Max}*{\\text{Era II}} = 16$ e $\\text{Max}*{\\text{Era III}} = 22$.
4. Si azzerano `slotsUsed = 0`, `passed = false`, `demBonus = 0` e si assegna l'iniziativa della nuova Era (`P2` in Era II, `P1` in Era III).

**Fine Era III:** se al termine della battaglia (e dell'eventuale Fase 4) dell'Era III entrambi i Centri Città hanno $\\text{cityHp} > 0$, si confrontano gli HP residui dei due Centri Città:

* Chi ha $\\text{cityHp}$ maggiore vince per `GameEnded { kind: 'points', winner }`.
* In caso di parità ($\\text{cityHp}*{\\text{P1}} === \\text{cityHp}*{\\text{P2}}$), la partita termina in pareggio: `GameEnded { kind: 'draw', winner: 'DRAW' }`.

\---

## 5\. Visibilità e proiezione per giocatore (GDD §4.2)

### 5.1 Regola d'oro

**Nessun client e nessun bot riceve mai `GameState`.** Riceve esclusivamente `PlayerView` (snapshot filtrato per quel giocatore) ed eventi proiettati tramite `projectEvent`. Questa regola vale anche in modalità locale: `LocalGameController` invoca le stesse identiche funzioni `playerView` e `projectEvent`, garantendo per costruzione che la UI non possa mai leggere informazione nascosta.

### 5.2 Contratto `PlayerView`

```ts
export interface PlayerView {
  me: PlayerId;
  stateVersion: number;
  era: EraNo;
  phase: Phase;
  cycle: number;
  initiative: PlayerId;
  toAct: PlayerId | null;
  deadline: number | null;                      // epoch ms del server, null in locale
  self: {
    hand: CardInstance\[];
    resources: Resources;
    buildings: CardInstance\[];
    units: UnitInstance\[];
    discard: CardInstance\[];                    // il proprietario vede sempre i propri scarti
    walls: number;
    cityHp: number;
    cityMax: number;
    cityDamage: number;
    demBonus: number;
    slotsUsed: number;
    passed: boolean;
    committed: boolean;
    subdeckCounts: Record<EraNo, number>;
    legal: LegalCommands;
  };
  opponent: {
    handCount: number;
    resources: Resources | null;                // null in 'mulligan'/'hand\_limit'/'development', visibile da 'prebattle'
    coveredCount: number;                       // carte coperte nella città avversaria (vedi 5.3)
    units: PublicUnitView\[] | null;             // null prima di 'prebattle', lista rivelata da 'prebattle' a fine Era
    walls: number;
    cityHp: number;
    cityMax: number;
    cityDamage: number;
    demBonus: number;                           // pubblico perché derivato da Altoforno Reale (pubblico)
    slotsUsed: number;
    passed: boolean;
    committed: boolean;                         // true se l'avversario ha bloccato la scelta nella finestra simultanea
    discardCount: number;                       // numero totale carte nello scarto avversario
    publicDiscard: string\[];                    // cardId pubblici negli scarti avversari (Riconversioni, Istantanee rivelate, Unità cadute/scartate a fine Era)
    subdeckCounts: Record<EraNo, number>;
  };
  result: GameResult | null;
}
```

### 5.3 Matrice di visibilità vincolante (GDD §4.2 + Decisione `D3`)

|Dato dell'avversario|Fasi `mulligan` / `hand\_limit` / `development`|Dalla fase `prebattle` a fine Era|
|-|-|-|
|`walls`, `cityHp`, `cityMax`, `slotsUsed`, `handCount`, `passed`|**Pubblico**|**Pubblico**|
|`opponent.resources`|`null` (**Nascosto**)|**Pubblico** (valore esatto)|
|`opponent.units`|`null` (**Coperte in città**)|**Pubblico** (rivelate e posizionate sulle linee)|
|`opponent.coveredCount`|N° totale carte coperte in città (`units.length + buildings.length`)|N° edifici attivi (`buildings.length`, che **restano coperti**)|
|Identità degli Edifici Economici avversari|**Mai rivelata**|**Mai rivelata**|
|Identità dell'Edificio sacrificato da Riconversione (`D3`)|**Nascosta** (solo `coveredCount` diminuisce di $1$)|**Nascosta**|
|Identità delle carte scartate per `hand\_limit` (`D3`)|**Nascosta** (solo `discardCount` aumenta)|**Nascosta**|
|Riconversioni giocate (`e3\_gld`, `e3\_frn`)|**Pubblica** al momento dell'attivazione|**Pubblica** (in `publicDiscard`)|
|Istantanee avversarie|Nascoste in mano; in `prebattle` solo flag `committed`|**Pubbliche** solo dopo che **entrambi** hanno bloccato (`InstantsRevealed`)|

### 5.4 Proiezione degli eventi (`projectEvent`)

`projectEvent(event, viewer)` restituisce una copia redatta dell'evento per `viewer`, oppure `null` se il destinatario non deve ricevere alcuna notifica per quell'evento interno.

|Evento|Per il proprietario (`actor === viewer`)|Per l'avversario (`actor !== viewer`)|
|-|-|-|
|`CardsDrawn`|`count` + lista `cards` pescate|Solo `count` (`cards` omesso)|
|`MulliganResolved`|`count` + nuove carte pescate|Solo `count` delle carte cambiate|
|`HandLimitDiscarded`|`count` + `cardUids` scartate|Solo `count` (identità nascoste per `D3`)|
|`ResourcesChanged`, `ResourcesOverflowed` (prima di `prebattle`)|Dettaglio completo|`null` (salvo variazioni da Riconversione pubblica, o dalla `prebattle` in poi)|
|`CardPlayed` (carta da campo in `development`)|Dettaglio completo (`cardId`, `uid`)|Redatto: solo `{ player, slotsUsed, coveredCount }` (nessun `cardId` né tipo)|
|`ConversionActivated`|Completo (`cardId`, `sacrificeUid`, `sacrificeCardId`)|Redatto: `cardId` della Riconversione e risorse/bonus ottenuti, ma **senza** `sacrificeCardId` (`D3`)|
|`PlayerCommitted`|`{ player, window }`|`{ player, window }` (senza contenuto)|
|`UnitsRevealed`, `InstantsRevealed`, `WallsModified`, `BattlePhaseResolved`, `SiegeResolved`, `RaidResolved`|Completo|Completo|

### 5.5 Test anti-leak obbligatori

* **Property-based Leak Test:** su qualunque sequenza casuale di comandi generata da `fast-check`, serializzare in JSON `playerView(state, 'P1')` e tutti gli eventi proiettati per `P1`. La stringa JSON **non deve mai contenere** alcun `uid` o `cardId` delle carte in mano a `P2`, delle carte nei sotto-mazzi di `P2`, degli edifici in campo di `P2`, degli scarti coperti di `P2`, né delle unità di `P2` prima di `UnitsRevealed`, né delle Istantanee scelte da `P2` prima di `InstantsRevealed`. Verifica simmetrica per `P2`.
* **Test di redazione esaustiva:** per ciascuno dei tipi di `GameEvent`, un test unitario dedicato confronta il payload canonico con `projectEvent(ev, 'P1')` e `projectEvent(ev, 'P2')`.

\---

## 6\. Server, concorrenza e protocollo di rete (`apps/server`, `packages/protocol`)

### 6.1 Architettura del server

* **Server autoritativo:** mantiene lo stato canonico `GameState`, valida ogni comando tramite `apply`, persiste atomicamente transizione e comando su DB e invia a ciascun client solo `PlayerView` ed eventi filtrati da `projectEvent`.
* **Serializzazione per partita e concorrenza ottimistica:** ogni `GameRoom` processa i comandi in una coda sequenziale per partita e verifica `expectedStateVersion` (da Proposta 2 §8.3/§8.6) per proteggere i giocatori su rete mobile instabile da doppi invii o azioni basate su viste obsolete.
* **Commit logico sicuro:** nelle finestre simultanee (`mulligan`, `hand\_limit`, `prebattle`), la scelta del primo giocatore resta in `state.pending` solo nella memoria/DB del server finché anche il secondo giocatore non ha inviato il proprio lock.

### 6.2 Protocollo dei messaggi (JSON su WebSocket + REST di supporto, validati con Zod)

|Direzione|Messaggio|Payload|
|-|-|-|
|C $\\to$ S|`hello`|`{ token?: string, clientVersion: string }`|
|C $\\to$ S|`queue.join`|`{ deck: DeckPayload, mode: 'quick' \| 'private', roomCode?: string }`|
|C $\\to$ S|`room.create`|`{ deck: DeckPayload }`|
|C $\\to$ S|`game.command`|`{ gameId: string, commandId: string, expectedStateVersion: number, command: ClientCommand }`|
|C $\\to$ S|`game.resync`|`{ gameId: string, lastEventN: number }`|
|S $\\to$ C|`welcome`|`{ token: string, serverTime: number, playerId: string, nickname: string }`|
|S $\\to$ C|`match.found`|`{ gameId: string, me: PlayerId, rules: RulesConfig }`|
|S $\\to$ C|`game.snapshot`|`{ gameId: string, stateVersion: number, eventN: number, view: PlayerView }`|
|S $\\to$ C|`game.events`|`{ gameId: string, stateVersion: number, fromN: number, events: GameEvent\[], view: PlayerView }`|
|S $\\to$ C|`game.error`|`{ commandId?: string, code: ErrorCode, message: string, retryable: boolean }`|
|S $\\to$ C|`game.deadline`|`{ phase: Phase, deadline: number, serverTime: number }`|
|S $\\to$ C|`game.ended`|`{ gameId: string, result: GameResult, view: PlayerView }`|

**Regole di concorrenza e idempotenza:**

1. **`player` derivato dal server:** il client invia `ClientCommand` senza il campo `player`; il server risolve il token di sessione nella seat `P1` o `P2` della partita. Un utente non partecipante riceve `MATCH\_NOT\_ACCESSIBLE`.
2. **Idempotenza su `commandId`:** se il server riceve un `commandId` già elaborato per quella partita con lo stesso payload, restituisce l'esito già confermato senza rieseguire il comando. Se lo stesso `commandId` viene riusato con un payload differente, restituisce `IDEMPOTENCY\_KEY\_REUSED`.
3. **Controllo `expectedStateVersion`:** se `expectedStateVersion !== state.stateVersion` (e il comando non è un retry idempotente già confermato), il server rifiuta il comando con codice `STALE\_STATE\_VERSION` (`retryable: true`) e invia `game.snapshot` aggiornato al client senza mutare lo stato.
4. **Codici errore strutturati (`ErrorCode`):** `UNAUTHENTICATED`, `MATCH\_NOT\_ACCESSIBLE`, `STALE\_STATE\_VERSION`, `IDEMPOTENCY\_KEY\_REUSED`, `INVALID\_PHASE`, `NOT\_YOUR\_TURN`, `ALREADY\_PASSED`, `DECISION\_ALREADY\_LOCKED`, `CARD\_NOT\_IN\_HAND`, `INSUFFICIENT\_RESOURCES`, `NO\_LOGISTICS\_SLOT`, `NO\_BUILDING\_TO\_SACRIFICE`, `INVALID\_DISCARD\_COUNT`, `INVALID\_DECK`, `INTERNAL\_ERROR`.

### 6.3 Timer e disconnessioni (default configurabili in `RulesConfig`)

|Finestra|Durata default|Azione automatica allo scadere (`ApplyTimeout`)|
|-|-|-|
|`mulligan`|$30\\text{ s}$|Nessun cambio (`SubmitMulligan { cardUids: \[] }`)|
|`hand\_limit`|$30\\text{ s}$|Scarto deterministico automatico `autoDiscard` (§2.3.3)|
|Opportunità in `development`|$45\\text{ s}$|Dichiarazione automatica di `Pass`|
|`prebattle`|$30\\text{ s}$|Nessuna Istantanea giocata (`LockInstants { cardUids: \[] }`)|

* Il server è l'unico arbitro del tempo: invia `deadline` ed epoch `serverTime`, e il client calcola l'offset locale per mostrare la barra del conto alla rovescia.
* **Disconnessione:** grace period di $60\\text{ s}$ per la riconnessione; se una finestra scade durante la disconnessione si applica `ApplyTimeout`. Dopo $3$ timeout consecutivi dello stesso giocatore, il server applica `Concede` per abbandono (soglia configurabile in `RulesConfig`).

### 6.4 Persistenza ibrida (Snapshot Canonico + Event Sourcing)

Per coniugare il ripristino istantaneo delle partite attive con la riproducibilità deterministica completa, il database salva **sia l'ultimo `canonical\_state\_json` confermato sia il log append-only dei comandi**:

|Tabella|Campi principali|
|-|-|
|`players`|`id PRIMARY KEY, token\_hash UNIQUE, nickname, created\_at`|
|`decks`|`id PRIMARY KEY, player\_id, name, payload\_json, catalog\_version, updated\_at`|
|`games`|`id PRIMARY KEY, status, state\_version, event\_n, seed, rules\_json, canonical\_state\_json, state\_hash, p1\_id, p2\_id, result\_json, created\_at, updated\_at`|
|`game\_commands`|`game\_id, idx, command\_id, player, expected\_version, resulting\_version, command\_json, state\_hash, created\_at, PRIMARY KEY (game\_id, idx), UNIQUE (game\_id, command\_id)`|

* **Transazione atomica:** ad ogni comando accettato da `apply`, il repository aggiorna `games` (`state\_version`, `event\_n`, `canonical\_state\_json`, `state\_hash`) e inserisce la riga in `game\_commands` dentro un'unica transazione SQLite/Postgres.
* **Ripristino al riavvio del server:** le partite con `status = 'ACTIVE'` vengono ricaricate istantaneamente da `canonical\_state\_json` (verificando che `stateHash(state) === state\_hash`).
* **Riconnessione client:** il client invia `game.resync { gameId, lastEventN }`; il server risponde con `game.snapshot` contenente la `PlayerView` corrente autorizzata per quel giocatore.
* **Replay deterministico:** `GET /api/v1/games/:id/replay?as=P1|P2|public` ricostruisce la partita partendo da `seed` + `rules\_json` e rieseguendo in sequenza `game\_commands`, proiettando stati ed eventi per il punto di vista richiesto (per `P1`/`P2` solo a partita `FINISHED`; durante una partita `ACTIVE` nessuno può interrogare il replay).

### 6.5 Sicurezza e operazioni

* Sessione ospite immediata tramite token opaco ad alta entropia (solo l'hash SHA-256 è salvato in `players.token\_hash`).
* Validazione Zod su ogni messaggio in ingresso; limite payload WebSocket a $16\\text{ KB}$; rate limiting per connessione; controllo `Origin`.
* `canonical\_state\_json` e `seed` di una partita attiva non vengono **mai** esposti in nessuna risposta HTTP o WebSocket.
* Dockerfile multi-stage, configurazione via variabili d'ambiente (`.env.example` documentato), endpoint `GET /api/v1/healthz`, graceful shutdown che chiude in modo pulito le transazioni prima dell'uscita.

\---

## 7\. Bot, simulatore e validazione deterministica

### 7.1 Bot (`packages/bots`)

```ts
export interface Bot {
  readonly name: string;
  choose(view: PlayerView, rng: () => number): ClientCommand;
}
```

* I bot ricevono **esclusivamente `PlayerView`** (zero accesso allo stato nascosto dell'avversario) e scelgono sempre tra le mosse in `view.self.legal`.
* **`RandomBot`:** sceglie uniformemente tra le mosse legali usando il `rng` fornito, con probabilità di `Pass` configurabile quando esistono carte giocabili (default $15%$).
* **`GreedyBot`:** euristica leggibile e competitiva per il gioco locale:

  * *Mulligan:* tiene gli edifici economici di Era I e le unità a basso costo; cambia le carte ridondanti se non ha edifici in mano.
  * *Sviluppo:* nei Cicli 1 e 2 dà priorità massima agli Edifici Economici per massimizzare le rendite dei Cicli 2 e 3; successivamente schiera Unità bilanciando le linee e massimizzando il rapporto $(\\text{ATK} + \\text{DEM} + \\text{HP}) / \\text{costoTotale}$; in Era III usa *Gilda dei Mercanti* quando ha $\\ge 3$ edifici o *Altoforno Reale* quando ha già schierato più unità.
  * *Pre-Battaglia:* gioca *Pioggia di Frecce* se ha almeno $2$ Arcieri schierati; gioca *Grido di Guerra* / *Carica Eroica* se ha almeno $2$ unità sul Fronte; gioca *Mina Sotterranea* / *Fuoco Greco* se la propria DEM totale può aprire una breccia o infliggere danno diretto al Centro Città nemico; gioca *Palizzata Extra* se teme una breccia nemica.
* **`RationalBot`** (opzionale dopo M3): estende `GreedyBot` spendendo Cibo e Legno residui prima della battaglia quando prevede di subire una breccia, negando il bottino di Razzia all'avversario.
* **Mazzi preset (`data/decks/\*.json`):** tre mazzi validi da $60$ carte ($20+20+20$) pronti all'uso per giocatore e bot:

  1. `aggro-breach.json` (pressione campale precoce, Cavalleria, Assedio e demolizione Mura);
  2. `balanced-tactical.json` (equilibrio tra rendita, contromisure Lancieri/Arcieri/Cavalleria e Istantanee);
  3. `boom-economy.json` (massima densità di Edifici Economici in Era I e II, Riconversioni esplosive e unità pesanti in Era III).

### 7.2 Simulatore headless (`packages/sim`)

CLI:

```bash
pnpm sim --deckA data/decks/aggro-breach.json --deckB data/decks/boom-economy.json --botA greedy --botB greedy --games 18000 --seed epochs-v1 --workers 4 --out report.json
```

* Esecuzione parallela con `worker\_threads`; a parità di `--seed` e parametri, il report aggregato è **identico al 100%** indipendentemente dal numero di worker.
* **Metriche nel report JSON/CSV:** win rate per giocatore (`P1` vs `P2`) e per archetipo, ripartizione degli esiti (`annihilation`, `points`, `draw`), durata media in cicli per Era, tasso di breccia per Era, danno diretto medio al Centro Città per Era, distribuzione degli HP delle Mura, risorse razziate medie, frequenza di `stalemate` e `mutual\_annihilation`, utilizzo e win rate per singola carta.
* **Obiettivo di prestazioni:** $18.000$ partite complete in $< 60\\text{ s}$ su $4$ worker.

### 7.3 Oracolo normativo e script di validazione (`tools/validate-scenarios.ts`)

* I **Vettori di Test Nominali dell'Appendice A (`TV-01` – `TV-25`)** costituiscono l'oracolo normativo primario del motore.
* Lo strumento `pnpm validate:scenarios` (`tools/validate-scenarios.ts`) carica file JSON di scenario da `data/scenarios/\*.json`, esegue i comandi su `packages/engine` usando `fixedDecks` e `fixedInitiative` e verifica stato finale, superstiti, HP Mura/Centro Città, eventi emessi e assenza di leak.
* In qualunque momento l'umano o l'agente possono aggiungere nuovi scenari JSON in `data/scenarios/` per testare interazioni complesse o casi limite senza modificare il codice del motore.

```json
{
  "id": "scenario-tv13-flank-mutual-annihilation",
  "era": 2,
  "initiative": "P1",
  "setup": {
    "P1": { "units": \["u2\_cav\_h"], "walls": 8, "cityDamage": 0 },
    "P2": { "units": \["u2\_arc\_l", "u2\_inf\_h"], "walls": 8, "cityDamage": 0 }
  },
  "instants": { "P1": \[], "P2": \[] },
  "expect": {
    "outcome": "mutual\_annihilation",
    "winner": null,
    "survivors": { "P1": \[], "P2": \[] },
    "wallsAfter": { "P1": 8, "P2": 8 },
    "cityDamageAfter": { "P1": 0, "P2": 0 }
  }
}
```

\---

## 8\. Contenuti per carta: dati, testi, immagini

### 8.1 Tre file, una chiave comune

Ogni carta del catalogo ufficiale è identificata dal suo `id` (es. `u2\_inf\_h`) in tre file separati, così regole, testi localizzati e asset grafici evolvono in modo disaccoppiato e `packages/engine` dipende solo da `cards.rules.json`:

|File|Contenuto|Chi lo genera / mantiene|
|-|-|-|
|`data/cards.rules.json`|Statistiche, costi, linea, abilità, effetti|Generato da `tools/gdd-to-cards.ts` + `tools/card-effects.ts`|
|`data/cards.text.it.json`|`name`, `typeLine`, `flavor`|Testi ufficiali in Appendice B|
|`data/cards.art.json`|`file`, `alt`, `prompt`, `negative`, `status`, `credit`|Metadati e prompt in Appendice B|

### 8.2 Generazione deterministica di `cards.rules.json`

`tools/gdd-to-cards.ts` legge le tabelle di `docs/GDD.md` §7 e produce `data/cards.rules.json`.
Controlli bloccanti: esattamente $45$ carte ($15$ per ciascuna Era), ID univoci, costo nel formato `a / b / c`, statistiche `—` mappate a `undefined`.

* **`type` determinato dalla colonna "Tipo / Cat." del GDD:** `Economia` $\\to$ `'economy'`; `Fanteria` / `Lanciere` / `Cavalleria` / `Arciere` / `Assedio` $\\to$ `'unit'` (con rispettiva `category`); `Istantanea` $\\to$ `'instant'`; `Riconversione` $\\to$ `'conversion'`. **Mai** dedurre il tipo dal primo carattere dell'ID (`e3\_gld` ed `e3\_frn` iniziano per `e` ma sono Riconversioni).
* **`line` dalla colonna "Linea":** `Fronte` $\\to$ `'front'`, `Centro` $\\to$ `'center'`, `Retro` $\\to$ `'rear'`.
* **`isCombatant`:** `false` per `category === 'siege'`, `true` per tutte le altre unità.
* **Abilità ed effetti:** associati tramite tabella esplicita in `tools/card-effects.ts` (vedi Appendice C.1). Lo script è idempotente: eseguirlo in CI non deve mai produrre diff rispetto al file committato.

### 8.3 Testo delle carte (stile *Magic*)

Ogni carta mostra: **nome**, **costo** (pip delle risorse con costo $> 0$), **illustrazione**, **riga del tipo**, **testo delle regole**, **testo narrativo (flavor)** e **statistiche** (`ATK`, `DEM`, `HP` per le unità).

* **Riga del tipo (`typeLine`):** formato `Unità — Fanteria · Fronte`, `Economia`, `Istantanea`, `Riconversione`.
* **Testo delle regole generato da `packages/content`** a partire da `cards.rules.json` (così che i numeri nel testo non possano mai divergere dalle regole del motore):

|Elemento|Template generato (IT)|
|-|-|
|Produzione|`Produzione: +{n} {risorsa}.`|
|Fanteria semplice|`Unità combattente.`|
|Impalamento|`Impalamento: {n} danni vs Cavalleria.`|
|Tiro|`Tiro (+{n} vs Lancieri); Mischia: {m} ATK.` *(dove $m = \\max(1, \\lfloor \\text{atk}/2 \\rfloor)$)*|
|Accerchiamento|`Accerchiamento (+{n} ATK vs Arcieri).`|
|Assedio|`Non combattente; solo Demolizione.`|
|Istantanea ATK|`Pre-Battaglia (0 Slot): +{n} ATK {ai tuoi Arcieri \| alle tue unità sul Fronte}.`|
|Istantanea Mura|`Pre-Battaglia (0 Slot): {+n HP alle tue Mura \| -n HP alle Mura nemiche}.`|
|`e3\_gld` (Gilda)|`0 Slot. Sacrifica 1 tuo Edificio: +1 Cibo, +1 Legno, +1 Metallo per tuo edificio pre-sacrificio.`|
|`e3\_frn` (Altoforno)|`0 Slot. Sacrifica 1 tuo Edificio: +2 Legno, +3 Metallo e +1 DEM alle tue unità in Era III.`|

* **Testo narrativo (flavor):** in corsivo, separato dal testo regole tramite un filetto sottile. Vincoli verificati da `content:validate`: massimo $120$ caratteri, $1$–$2$ frasi, tono storico/epico originale (Appendice B).
* **Parole chiave con *reminder text* (tooltip al passaggio del mouse o pressione lunga su mobile):**

|Parola chiave|Testo di richiamo (Tooltip)|
|-|-|
|**Tiro**|In Fase 1 gli Arcieri colpiscono prima del contatto; infliggono il bonus indicato se il nemico schiera almeno un Lanciere.|
|**Impalamento**|In Fase 2A i Lancieri infliggono questo danno speciale solo alla Cavalleria nemica, prima che possa caricare.|
|**Accerchiamento**|In Fase 2B, se il nemico non ha Lancieri vivi, la Cavalleria attacca per prima la Retroguardia e ottiene il bonus contro gli Arcieri.|
|**Demolizione (DEM)**|Danno strutturale: in caso di vittoria campale colpisce le Mura nemiche e, in eccesso, il Centro Città. Non danneggia le truppe.|
|**Riconversione**|Giocabile solo durante lo sviluppo dell'Era III; occupa $0$ slot ma richiede il sacrificio di un tuo Edificio Economico attivo.|
|**Istantanea**|Si seleziona in segreto nella Finestra Pre-Battaglia (dopo la rivelazione delle unità) e si rivela simultaneamente; occupa $0$ slot.|

### 8.4 Illustrazioni e pipeline grafica

* **Una illustrazione dedicata per ciascuna delle $45$ carte.**
* Master: **$1536 \\times 1152\\text{ px}$ ($4:3$)**, sRGB, PNG o JPEG alta qualità, salvato in `data/art/src/{id}.png`. Nessun testo, logo, cornice o watermark dentro l'immagine. Soggetto principale entro il $70%$ centrale.
* `pnpm art:build` (`sharp`) genera WebP e AVIF alle larghezze **$256 / 512 / 1024\\text{ px}$** in `apps/web/public/cards/{id}-{w}.{webp|avif}` e il manifesto `art-manifest.json`.
* **Stile pittorico comune** (da anteporre a ogni prompt dell'Appendice B):

> `Historical oil painting, visible brushwork, dramatic side lighting, cinematic 4:3 composition, no text, no watermark, no frame, no recognizable real person or third-party IP.`

  * Palette per Era: **Era I** terre calde, ocre e verdi di campagna; **Era II** acciaio freddo, rossi araldici, cieli tersi; **Era III** oro imperiale, fumo di polvere da sparo, luce di tramonto.
* **Stati in `cards.art.json`:** `'missing' | 'placeholder' | 'final'`. Lo script `pnpm art:placeholders` genera per tutte le carte senza master un SVG segnaposto elegante e distinto per Era e categoria, così il gioco è immediatamente giocabile e visivamente curato fin da M0.

### 8.5 Controllo `pnpm content:validate` (bloccante in CI)

Fallisce con exit code `1` se: le carte non sono esattamente $45$ ($15$ per Era); manca un ID in uno dei tre file; `name` supera $24$ caratteri; `flavor` è vuoto o supera $120$ caratteri; `alt.it` è inferiore a $20$ caratteri; i valori generati dal testo regole non coincidono con la tabella §7 del GDD; una carta ha `status: "final"` ma manca il file immagine o i metadati di provenienza.

\---

## 9\. Client Web \& Mobile PWA (`apps/web`)

### 9.1 Direzione visiva: "Il Tavolo del Cartografo"

Il tavolo di gioco è un **tavolo da guerra strategico**: panno blu ardesia profondo, filetti di ottone brunito, tipografia nitida color gesso.

**Palette (tema scuro strategico):**

|Token CSS|Esadecimale|Uso|
|-|-|-|
|`--table-deep`|`#141E27`|Sfondo esterno pagina / bordi|
|`--table`|`#1C2B38`|Panno del campo di battaglia|
|`--surface-card`|`#223444`|Fondo interno del riquadro testo carta|
|`--chalk`|`#E9E5D6`|Testo principale, numeri e filetti chiari|
|`--chalk-muted`|`#A7B4C2`|Testo secondario, flavor text, etichette|
|`--brass`|`#B58E48`|Bordi attivi, indicatori d'iniziativa, focus ring|
|`--crimson`|`#A8404D`|Danni subiti, HP ridotti, avvisi di pericolo|
|`--era1` / `--era2` / `--era3`|`#A86F3C` / `#9FB1C2` / `#D9B04A`|Cornici carta per Era: Bronzo (I), Acciaio (II), Oro (III)|
|`--food` / `--wood` / `--metal`|`#86A94C` / `#8A5A34` / `#6F7F91`|Pip delle risorse (sempre accompagnati da icona SVG distinta)|

**Tipografia (self-hosted tramite `@fontsource`):**

* *IM Fell English SC* (o *Cinzel*): nomi delle carte e intestazioni di Era;
* *Alegreya* (Regular, Bold, Italic): testo delle regole e flavor text in corsivo;
* *Barlow Condensed* (SemiBold, Bold): costi, statistiche `ATK/DEM/HP`, contatori Mura/Centro Città e timer.

**Principio chiave di regia:**

* **Il momento memorabile è la Rivelazione delle Unità all'ingresso in Pre-Battaglia (`UnitsRevealed`).** Quando entrambi i giocatori passano, le carte unità coperte nelle due città si voltano in cascata ($120\\text{ ms}$ l'una) e scorrono a schierarsi sulle rispettive linee (*Fronte*, *Centro*, *Retroguardia*), mentre i saldi delle risorse avversarie si svelano. Subito dopo si apre il selettore segreto delle Istantanee.

### 9.2 Layout Desktop ($\\ge 1100\\text{ px}$) e Mobile Landscape/Portrait

**Layout Desktop / Tablet Landscape:**

```text
┌───────────────────────────────────────────────────────────┬────────────────┐
│ Avversario \[Mura 8] \[Centro Città 16/16] \[Slot 3/5] Mano:5│ Timer 0:42     │
│ ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐ │ \[   PASSO    ] │
│ │  Città   │ │  Fronte   │ │  Centro   │ │ Retroguardia │ │                │
│ │ coperta  │ │ (nemico)  │ │ (nemico)  │ │   (nemica)   │ │ Registro       │
│ └──────────┘ └───────────┘ └───────────┘ └──────────────┘ │ - P1 gioca...  │
│ ───────────  Era II · Ciclo 2 · Tocca a te  ───────────── │ - Ciclo 2...   │
│ ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐ │                │
│ │  Città   │ │  Fronte   │ │  Centro   │ │ Retroguardia │ │ Mazzo III: 20  │
│ │  (tua)   │ │  (tuo)    │ │  (tuo)    │ │    (tua)     │ │ Scarti: 4      │
│ └──────────┘ └───────────┘ └───────────┘ └──────────────┘ │                │
│ Tu: \[🍖 5/11] \[🪵 3/11] \[⛏️ 1/11] \[Slot 3/5] \[Mura 8] \[CC]│                │
│        ╭╌╌╌╌╌╌╌ Mano a ventaglio (max 10 carte) ╌╌╌╌╌╌╌╮  │                │
└───────────────────────────────────────────────────────────┴────────────────┘
```

* **Zona "Città":** durante `development`, mostra al proprietario le proprie carte schierate (con badge "Coperta per l'avversario": sia Edifici sia Unità) e per l'avversario mostra solo dorsi impilati col conteggio `opponent.coveredCount`. Dall'ingresso in `prebattle`, le Unità si spostano sulle tre linee (`Fronte`, `Centro`, `Retroguardia`), mentre nella zona "Città" restano solo gli Edifici Economici (visibili al proprietario, coperti con conteggio per l'avversario).

### 9.3 Componente `<Card>`

Rapporto fisso **$5:7$**, dimensionato con CSS Container Queries (`cqw`) per adattarsi senza distorsioni in mano, sul campo (versione compatta *token/field* o carta intera) e nell'ispezione a schermo intero.
Griglia interna a $5$ fasce (`grid-template-rows: 9fr 47fr 6fr 29fr 9fr`):

1. **Header ($9%$):** Nome carta a sinistra; pip dei costi a destra (mostra solo le risorse con costo $> 0$: icona SVG + valore numerico).
2. **Illustrazione ($47%$):** Finestra $4:3$ con `<picture>` (AVIF/WebP) o SVG placeholder.
3. **Riga del Tipo ($6%$):** es. `Unità — Cavalleria · Centro` con icona dell'Era (I, II, III).
4. **Box Testo ($29%$):** Testo regole in *Alegreya*, filetto divisorio sottile in ottone, flavor text in corsivo.
5. **Footer Statistiche ($9%$):** per le unità, badge `ATK` (spada), `DEM` (ariete/torre), `HP` (scudo). Se `atkMod > 0` o `demBonus > 0`, il valore effettivo è evidenziato in oro (`--brass`); se l'unità è danneggiata, gli HP correnti sono evidenziati in cremisi (`--crimson`).

### 9.4 Flusso di interazione per fase

* **`mulligan`:** modale dedicata con le $8$ carte pescate di Era I; tocco per selezionare/deselezionare le carte da cambiare, pulsante `"Conferma Mulligan (N carte)"` (o `"Mantieni mano"` se $N=0$).
* **`hand\_limit`:** modale dedicata con tutte le carte in mano e contatore `"Seleziona N carte da scartare"`; pulsante `"Conferma Scarto"` abilitato solo quando esattamente $N$ carte sono selezionate, affiancato da un pulsante `"Suggerisci (FIFO)"` che pre-seleziona le carte secondo `autoDiscard`.
* **`development`:** le carte giocabili in mano hanno bordo illuminato; le carte non giocabili sono attenuate e, se toccate, mostrano un banner chiaro col motivo (`"Cap Logistico raggiunto (4/4)"`, `"Metallo insufficiente"`, `"Giocabile solo in Pre-Battaglia"`).

  * **Doppio metodo di giocata (Mobile-First):** il giocatore può **trascinare** la carta sul campo (*Drag \& Drop*) **oppure toccare la carta** (che si solleva in anteprima ingrandita) e **toccare il pulsante `"Gioca Carta"`**.
  * **Riconversione (`e3\_gld`, `e3\_frn`):** selezionando la Riconversione si apre il selettore dei propri Edifici Economici attivi con l'anteprima esatta del guadagno netto che si otterrà dopo il sacrificio e il troncamento al cap di $16$.
  * **Pulsante `"Passo"`:** ben distinto, con dialogo di conferma rapida (*"Passare il turno per il resto dell'Era? L'azione è irrevocabile"*), disattivabile nelle impostazioni per giocatori esperti.
* **`prebattle`:**

  1. L'EventPlayer esegue prima l'animazione di `UnitsRevealed`: le unità di entrambi i giocatori si scoprono e si posizionano su *Fronte*, *Centro* e *Retroguardia*, e le risorse dell'avversario diventano visibili.
  2. La UI apre una barra non bloccante per le **Istantanee** che lascia completamente visibili ed esplorabili le tre linee del campo di battaglia: il giocatore può selezionare $0$ o più Istantanee dalla mano, vede in tempo reale il costo totale scalato dal proprio saldo e l'anteprima dei bonus su Mura/Unità, quindi preme **`"Blocca Scelte Pre-Battaglia"`**.
* **Risoluzione Battaglia e Assedio:** riproduzione automatica passo-passo guidata da `EventPlayer` (sezione 9.5) con barra di stato che mostra la fase attiva (*Fase 1: Tiro*, *Fase 2A: Impalamento*, *Fase 2B: Impatto/Accerchiamento*, *Fase 3: Mischia Ciclo X/6*, *Fase 4: Assedio e Razzia*).

### 9.5 Riproduzione deterministica degli eventi (`EventPlayer`)

* Il client **non calcola mai il combattimento**: consuma in ordine la coda degli eventi proiettati (`events`) ricevuti da `apply` o dal WebSocket.
* Controlli di riproduzione sempre visibili durante la battaglia: velocità **$1\\times$**, **$2\\times$**, **Pausa** (per ispezionare i calcoli nel Registro) e **`"Salta alla fine"`** (mostra immediatamente lo stato finale `PlayerView`).
* Con `prefers-reduced-motion: reduce`, le animazioni di traslazione sono sostituite da dissolvenze brevi.
* Ogni evento alimenta in sincrono il **Registro di Battaglia** testuale in italiano (`describeEvent(event, 'it')`) e una regione `aria-live="polite"`.

### 9.6 Ergonomia Mobile-First e Accessibilità

* **Target Touch:** ogni controllo interattivo (carte in mano, pulsanti `"Gioca"`, `"Passo"`, `"Blocca Scelte"`, filtri del Deck Builder) ha un'area minima di tocco di **$44 \\times 44\\text{ CSS px}$**.
* **Viewport Mobile ($360\\text{ px}$ – $1099\\text{ px}$):**

  * Zero scroll accidentale della pagina (`100dvh`, `overflow: hidden` sul tavolo di gioco).
  * In **Mobile Landscape** (orientamento consigliato) e **Mobile Portrait**: le unità sulle tre linee usano un formato *Card Token* compatto ad alta leggibilità (illustrazione + icone categoria/linea + badge grandi `ATK / DEM / HP`); una **pressione prolungata (*long-press* di $250\\text{ ms}$) o doppio tap** su qualsiasi carta in mano o sul campo apre l'overlay di zoom a carta intera con i tooltip delle parole chiave.
  * Il Registro Eventi e i contatori dei sotto-mazzi sono accessibili tramite un cassetto laterale (*drawer*) apribile con un tocco.
* **Tastiera e Screen Reader:** navigazione completa da tastiera (`Tab`, frecce direzionali per scorrere la mano e le linee, `Invio`/`Spazio` per selezionare e confermare, `Esc` per chiudere modali); contrasto testo $\\ge 4.5:1$; nessuna informazione veicolata solo dal colore.

### 9.7 Schermate dell'applicazione

1. **Home:** Gioca contro Bot (scelta difficoltà `RandomBot` / `GreedyBot` e mazzo), Partita Locale Hot-Seat, Multiplayer Online (Coda Veloce / Crea o Entra in Stanza Privata con codice), Deck Builder, Archivio Carte, Regolamento Rapido.
2. **Deck Builder:** gestione dei $3$ sotto-mazzi da $20$ carte ciascuno (Era I, Era II, Era III), limite $3$ copie per carta, indicatori visivi di completamento (`Era I: 20/20`, `Era II: 18/20`, `Era III: 20/20`), curva dei costi Cibo/Legno/Metallo, conteggio Edifici/Unità/Istantanee, import/export JSON e salvataggio locale + server.
3. **Archivio Carte:** catalogo esplorabile delle $45$ carte con filtri per Era, Tipo, Categoria, Linea e ricerca testuale, con vista ingrandita e testi di richiamo.
4. **Tavolo di Partita:** schermata principale descritta in 9.2–9.6.
5. **Visualizzatore Replay:** caricamento di una partita conclusa con controlli *Play / Pausa / Passo Avanti / Selettore Punto di Vista (`P1`, `P2`, `Pubblico`)*.

### 9.8 Controller Unificato (`LocalGameController` vs `RemoteGameController`)

La UI interagisce esclusivamente con l'interfaccia `GameController`:

* `LocalGameController`: esegue `packages/engine` direttamente nel browser; gestisce partite contro Bot (invocando `bot.choose` quando `toAct` o una finestra simultanea richiede l'azione del bot) e partite **Hot-Seat** (mostrando una schermata interstiziale *"Passa il dispositivo al Giocatore 2 — Tocca per svelare la tua mano"* a ogni cambio di turno o finestra segreta, così da proteggere l'informazione nascosta sullo stesso schermo).
* `RemoteGameController`: comunica col server Fastify tramite WebSocket + REST, gestendo `expectedStateVersion`, `commandId`, stato di invio in corso (`pending`) e riconnessione automatica trasparente.

\---

## 10\. Qualità, Invarianti e Strategia di Test

### 10.1 Livelli di test

|Livello|Strumento|Copertura richiesta|
|-|-|-|
|**A. Unit test normativi del motore**|Vitest|Un blocco `describe` per ogni sezione del GDD (§2–§7); tutti i casi limite di risorse, cap, FIFO, fasi di battaglia e transizioni d'Era|
|**B. Vettori di test nominali**|Vitest + `validate:scenarios`|Tutti i **25 Vettori di Test (`TV-01` – `TV-25`)** dell'Appendice A verificati con valori numerici esatti|
|**C. Property-based \& Invarianti**|`fast-check`|1000+ sequenze casuali di comandi validi e invalidi che verificano gli invarianti della sezione 10.2|
|**D. Determinismo e Replay**|Vitest|Stesso `seed` + stessi comandi $\\to$ identico `stateHash` ed eventi bit per bit su $1000$ partite complete|
|**E. Anti-Leak \& Privacy**|Vitest|Verifica automatica (sezione 5.5) che nessuna vista o evento contenga informazioni segrete dell'avversario|
|**F. Server, Concorrenza e DB**|Vitest|Lock di versione (`STALE\_STATE\_VERSION`), idempotenza `commandId`, isolamento delle seat, persistenza e replay|
|**G. Contenuti e Catalogo**|`pnpm content:validate`|Integrità delle $45$ carte tra regole, testi e metadati arte (sezione 8.5)|
|**H. End-to-End \& Accessibilità**|Playwright + `axe-core`|Partita completa fino a `finished` contro Bot; flusso Deck Builder; partita online con $2$ browser context; test mobile viewport $360\\times 800$ e $800\\times 360$; zero violazioni `axe` critical/serious|

### 10.2 Invarianti formali del motore (verificati a ogni transizione nei test)

1. **Dominio risorse:** per ogni giocatore e risorsa $r \\in {\\text{food}, \\text{wood}, \\text{metal}}$, $0 \\le \\text{resources}\[r] \\le \\text{cap}(\\text{era})$, valore intero.
2. **Limiti di mano e logistica:** all'apertura del Ciclo 1 di ogni Era, $|\\text{hand}| \\le 10$; in ogni istante, $0 \\le \\text{slotsUsed} \\le \\text{capLogistico}(\\text{era})$.
3. **Integrità strutturale:** $\\text{walls} \\ge 0$; $\\text{cityDamage} \\ge 0$ e monotono non decrescente; per ogni unità in `units`, $1 \\le u.\\text{hp} \\le \\text{card.hp}$ (le unità con $\\text{hp} \\le 0$ non sopravvivono mai al termine di una fase).
4. **Legge di conservazione delle 60 carte:** per ciascun giocatore, in qualsiasi istante della partita:
$$\\sum\_{e=1}^{3} |\\text{subdecks}\[e]| + |\\text{hand}| + |\\text{discard}| + |\\text{buildings}| + |\\text{units}| = 60$$
Nessun `uid` può apparire in due zone contemporaneamente né andare perduto (edifici sacrificati, carte scartate, istantanee risolte e unità eliminate o congedate a fine Era finiscono tutti in `discard`).
5. **Immutabilità pura:** `apply(Object.freeze(deepFreeze(state)), cmd)` non solleva mai errori di mutazione; un comando rifiutato lascia lo stato invariato.
6. **Terminazione garantita:** qualsiasi partita in cui i giocatori (o il timeout) scelgano mosse legali termina in stato `'finished'` entro un numero finito di passi.

### 10.3 Soglie di qualità e CI

* Coverage minima: `packages/engine` $\\ge 95%$ su statements e branches; `packages/protocol`, `packages/content`, `packages/bots` $\\ge 85%$.
* Pipeline CI (GitHub Actions): `pnpm install --frozen-lockfile` $\\to$ `pnpm content:validate` $\\to$ `pnpm lint` $\\to$ `pnpm typecheck` $\\to$ `pnpm test` $\\to$ `pnpm validate:scenarios` $\\to$ `pnpm build` $\\to$ `pnpm test:e2e`.
* Budget prestazioni client: bundle JS iniziale $\\le 250\\text{ KB}$ gzip (illustrazioni escluse).

\---

## 11\. Decisioni consolidate e configurazione (`RulesConfig`)

Le decisioni di design sono state **confermate con l'umano** e costituiscono il comportamento normativo predefinito del motore. Restano parametrizzate in `RulesConfig` per consentire test comparativi o varianti future senza toccare il codice dell'engine.

|ID|Punto (riferimento GDD)|Stato|Regola Normativa Adottata|Campo in `RulesConfig`|
|-|-|-|-|-|
|**`D1`**|**Bonus `+Era` e danno `1 + 2×Era` su carte conservate in mano e giocate in Ere successive (§5.3 vs §7).**|**CONFERMATA**|**Vale sempre il valore stampato sulla carta** (es. un *Cacciatore* di Era I infligge sempre $+1$ contro i Lancieri anche se schierato in Era III; un *Picchiere di Leva* infligge sempre $3$ danni in Impalamento). Il testo sulla carta corrisponde sempre esattamente all'effetto in battaglia.|`eraScalingSource: 'card'`|
|**`D2`**|**Politica di timeout e disconnessione fuori dallo scarto (§2.3.3).**|**CONFERMATA**|`mulligan`: nessun cambio ($0$ carte); `hand\_limit`: politica deterministica FIFO §2.3.3 (`autoDiscard`); `development`: `Pass` automatico; `prebattle`: nessuna Istantanea ($0$ carte). Dopo $3$ timeout consecutivi: `Concede`.|`timeoutPolicy`|
|**`D3`**|**Visibilità degli scarti per limite di mano e dell'edificio sacrificato da Gilda/Altoforno (§4.2).**|**CONFERMATA**|**Coperto / Nascosto per l'avversario** fino a fine partita. L'avversario vede solo il conteggio totale degli scarti (`discardCount`) e il decremento di `coveredCount`, così da non svelare mai la mano né il bluff economico.|`discardVisibility: 'hidden'`, `sacrificeVisibility: 'hidden'`|
|**`D4`**|**Arcieri in Mischia (§5.3 Fase 3): $\\max(1, \\lfloor \\text{ATK} / 2 \\rfloor)$ con modificatori da Istantanee.**|**CONFERMATA**|**Si dimezza l'ATK effettivo** ($\\text{effAtk} = \\text{atkBase} + \\text{atkMod}$), premiando l'investimento di *Pioggia di Frecce* anche nei cicli di Mischia Generale (es. *Cacciatore* con ATK base $2$ + *Pioggia di Frecce* $+2 = 4 \\to$ Mischia $\\lfloor 4/2 \\rfloor = 2\\text{ ATK}$).|`archerMeleeUsesEffectiveAtk: true`|
|**`D5`**|**Momento di assegnazione del contatore `seq` alle unità (§1).**|**CONFERMATA**|Assegnato **al momento della giocata coperta** in `development` (`PlayCard`), tramite contatore monotono globale. L'ordine relativo FIFO di schieramento viene così preservato fedelmente alla rivelazione.|`seqAssignedAt: 'play'`|
|**`D6`**|**Comportamento quando il giocatore di turno in `development` non ha alcuna carta legalmente giocabile (§4.1).**|**CONFERMATA**|Default configurabile: `autoPassWhenNoLegalPlay: false` nelle partite contro umani (il pulsante `"Passo"` viene evidenziato come unica azione disponibile, così da non rivelare istantaneamente per via del tempo di risposta zero che il giocatore non ha mosse legali; il giocatore clicca `"Passo"`), mentre i Bot e `ApplyTimeout` passano automaticamente.|`autoPassWhenNoLegalPlay: boolean`|

### 11.2 Letture normative esplicite (da rispettare nel codice)

* **R1 (Sequenza Pre-Battaglia §5.1):** `UnitsRevealed` e la visibilità delle risorse avversarie avvengono **prima** che i giocatori scelgano e blocchino le Istantanee con `LockInstants`.
* **R2 (Durata buff ATK §5.1):** i modificatori `atk\_mod` delle Istantanee durano per tutte le fasi ($1$, $2\\text{A}$, $2\\text{B}$ e tutti i $6$ cicli della Fase $3$) della battaglia di quell'Era.
* **R3 (Permanenza modificatori Mura §5.1):** i modificatori `walls\_mod` modificano permanentemente gli HP delle Mura (con minimo a $0$ applicato dopo la somma algebrica) e incidono sul calcolo di riporto alla fine dell'Era.
* **R4 (Bonus DEM di Altoforno Reale §3.4):** il bonus $+1\\text{ DEM}$ si applica a **tutte** le unità del giocatore in Era III (incluse le unità d'Assedio e le unità con DEM base $0$), sia già schierate in precedenza nell'Era III sia schierate successivamente nell'Era III, ed è cumulabile se si giocano più copie di *Altoforno Reale*.
* **R5 (Guardia dopo il $6^\\circ$ ciclo §5.2–5.3):** dopo la rimozione dei caduti del $6^\\circ$ ciclo di Mischia Generale, si valuta prima se uno o entrambi i lati sono rimasti con $0$ combattenti vivi (`winner` o `mutual\_annihilation`); solo se entrambi hanno ancora $\\ge 1$ combattente vivo si dichiara `stalemate`.
* **R6 (Mulligan §2.2):** il mulligan pesca prima le $N$ carte sostitutive dalla cima del sotto-mazzo Era I e **solo dopo** rimette le $N$ carte scartate in fondo al sotto-mazzo Era I (ordinate per `drawnOrder` crescente), impedendo di ripescare le carte appena cambiate.

\---

## 12\. Roadmap e Milestone di Sviluppo

Ordine obbligatorio: **M0 $\\to$ M1 $\\to$ M2 $\\to$ M3 $\\to$ M4 $\\to$ M5 $\\to$ M6 $\\to$ M7**.  
La prima partita completa giocabile (M3) esiste e viene validata nel browser **prima** di sviluppare il server multiplayer (M5).

|Milestone|Contenuto|Definition of Done (DoD)|
|-|-|-|
|**M0 — Bootstrap e Catalogo**|Setup monorepo `pnpm`, configurazione TS/ESLint, `gdd-to-cards.ts`, `card-effects.ts`, generazione `cards.rules.json`, `cards.text.it.json`, `cards.art.json`, SVG placeholders, `content:validate`, mazzi preset in `data/decks/`|`pnpm content:validate` e `pnpm typecheck` verdi; $45$ carte validate; rigenerare `cards.rules.json` non produce diff|
|**M1 — Core Engine**|Implementazione completa di `packages/engine` (GDD §2–§7), API 4.6, `playerView`, `projectEvent`, `stateHash`|Tutti i **25 Vettori di Test (`TV-01` – `TV-25`)** passano; invarianti `fast-check` verdi; determinismo su $1000$ partite; test anti-leak verdi; coverage engine $\\ge 95%$|
|**M2 — Bot, Simulatore e Scenari**|`RandomBot`, `GreedyBot`, `packages/sim` multi-worker, `tools/validate-scenarios.ts`|Simulazione di $18.000$ partite riproducibile con lo stesso seed; `pnpm validate:scenarios` verde|
|**M3 — Client Locale \& Mobile UI**|`<Card>`, Tavolo del Cartografo responsive (Desktop + Mobile Landscape/Portrait), fasi, `EventPlayer`, `LocalGameController` (vs Bot e Hot-Seat)|E2E Playwright completa una partita intera vs Bot fino a `finished` sia su viewport desktop sia su viewport mobile; zero violazioni `axe` critical/serious|
|**M4 — Pipeline Arte \& Archivio**|`art:build` (`sharp`), tooltip parole chiave, schermata Archivio Carte e Regolamento rapido|Tutte le $45$ carte renderizzate con `<picture>` / SVG curati e tooltip funzionanti al passaggio/long-press|
|**M5 — Server Autoritativo \& Online**|`packages/protocol`, `apps/server` (Fastify + WS + SQLite), `expectedStateVersion`, idempotenza, timer, riconnessione, replay|E2E Playwright con $2$ client completa una partita online; test conflitto `STALE\_STATE\_VERSION`, riconnessione e replay deterministici verdi|
|**M6 — Deck Builder**|Schermata Deck Builder ($3\\times 20$, max $3$ copie), validazione live, import/export JSON, persistenza|E2E Playwright crea, valida, salva e usa un mazzo personalizzato in partita; i mazzi invalidi sono bloccati|
|**M7 — Rifinitura, Tutorial e PWA**|Effetti sonori sintetici/leggeri (Web Audio), Tutorial guidato (seed fisso in $6$ passi), caching PWA offline, README completo|Funzionamento offline verificato; budget di performance 10.3 rispettati; tutta la suite CI verde|

\---

## 13\. Istruzioni operative per l'agente

### 13.1 Metodo di lavoro

1. Procedi rigorosamente in ordine di milestone (`M0` $\\to$ `M7`), con incrementi piccoli e testati.
2. **Test-First sulle regole:** per ogni meccanica del GDD, scrivi prima il test unitario (e il relativo Test Vector dell'Appendice A), verifica che fallisca, poi implementa la regola in `packages/engine`.
3. Non dichiarare mai completata una milestone senza aver realmente eseguito i comandi di verifica (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm content:validate`) e controllato l'output.

### 13.2 Divieti assoluti

* Non modificare `docs/GDD.md`.
* Non inserire nel motore nomi cablati di carte, né casualità fuori da `sfc32`, né accessi a `Date`/rete/filesystem.
* Non inviare mai al client o ai bot `GameState` o eventi non filtrati da `projectEvent`.
* Non invertire mai l'ordine della Pre-Battaglia: le unità (`UnitsRevealed`) e le risorse avversarie **devono** essere rivelate prima che i giocatori scelgano le Istantanee (`LockInstants`).
* Non scrivere testi di flavor o prompt d'arte che citino opere, personaggi reali o proprietà intellettuali di terzi.

### 13.3 Formato di `docs/DECISIONS.md`

```markdown
## DEC-001 — Titolo sintetico della decisione
- \*\*Stato:\*\* CONFERMATA | APERTA | DEVIAZIONE
- \*\*Riferimento GDD:\*\* §5.3 Fase 1 / Fase 2A / Fase 2B
- \*\*Contesto:\*\* descrizione del punto tecnico o interpretativo
- \*\*Scelta adottata:\*\* descrizione precisa del comportamento implementato
- \*\*Flag RulesConfig:\*\* `rules.eraScalingSource = 'card'`
- \*\*Autore e data:\*\* umano / agente (YYYY-MM-DD)
```

\---

## Appendice A — Vettori di test nominali (`TV-01` – `TV-25`)

Tutti i valori derivano dal GDD v1.0 e dal catalogo ufficiale (§7). I test usano `createGame` con `fixedDecks` e `fixedInitiative`, tranne dove indicato "carte sintetiche".

|ID|Scenario|Risultato atteso|
|-|-|-|
|**`TV-01`**|Risorse a inizio partita; poi raccolto d'apertura Era I|Dotazione iniziale `2/2/0`; dopo il raccolto d'apertura `4/4/0` all'apertura del Ciclo 1|
|**`TV-02`**|Era II con *Fattoria* (`1,0,0`) e *Fonderia* (`0,0,2`) già attive; raccolto d'apertura, poi rendita Ciclo 2|Raccolto: `(2,2,1) + 2×(1,0,2) = (4,2,5)`; ciascuna rendita periodica (Ciclo 2 e 3): `(1,1,0) + (1,0,2) = (2,1,2)`|
|**`TV-03`**|Era I, risorse `(6,6,0)`, accredito `+2 food`|Cibo troncato a `7` (cap Era I), evento `ResourcesOverflowed` con overflow `1`|
|**`TV-04`**|Riporto Mura: residue `0, 1, 2, 3, 4, 5, 6, 9` passando all'Era II (base $8$)|Nuove Mura Era II: `8, 8, 9, 9, 10, 10, 11, 12` ($8 + \\lfloor W / 2 \\rfloor$)|
|**`TV-04b`**|Riporto Mura passando all'Era III (base $10$): residue `8, 11, 15`|Nuove Mura Era III: `14, 15, 17` ($10 + \\lfloor W / 2 \\rfloor$)|
|**`TV-05`**|Centro Città con danno diretto accumulato `cityDamage = 3`|Era I: `7/10`; Era II: `13/16`; Era III: `19/22`|
|**`TV-06`**|Fase 4 con coppie `(D, W)` = `(0,0), (5,8), (10,11), (11,11), (12,11), (13,8), (1,0)`|`(breach, Mura finali, danno diretto)`: `(false,0,0)`, `(false,3,0)`, `(false,1,0)`, `(true,0,0)`, `(true,0,1)`, `(true,0,5)`, `(true,0,1)`|
|**`TV-07`**|Razzia in Era I: attaccante Cibo `7` Legno `5`, difensore Cibo `3` Legno `0`|Nessun trasferimento (`0` Cibo perché attaccante al cap `7`, `0` Legno perché difensore a `0`)|
|**`TV-07b`**|Razzia in Era I: attaccante Cibo `6` Legno `5` Metallo `0`, difensore Cibo `3` Legno `2` Metallo `4`|`+1` Cibo e `+1` Legno all'attaccante (`7,6,0`); `-1` Cibo e `-1` Legno al difensore (`2,1,4`); Metallo mai razziato|
|**`TV-07c`**|Fase 4 che porta il Centro Città del difensore a $\\le 0\\text{ HP}$ con `breach = true`|Vittoria immediata per `annihilation`, **nessuna** razzia eseguita|
|**`TV-08`**|Mulligan Era I: sotto-mazzo `\[c1..c20]`, mano iniziale `c1..c8`, il giocatore cambia `{c2, c5}`|Pesca prima `c9, c10`; mano finale `{c1,c3,c4,c6,c7,c8,c9,c10}`; sotto-mazzo `\[c11..c20, c2, c5]`|
|**`TV-09`**|Mano di $12$ carte a inizio Era II, scarto automatico (`autoDiscard`) di $2$ carte: presenti carte di Era I ed Era II, e a parità di Era/costo `drawnOrder` $3$ e $5$|Si scartano prima le carte di Era inferiore; a parità di Era quelle col costo totale inferiore; a ulteriore parità `drawnOrder` $3$ prima di $5$ (FIFO)|
|**`TV-10`**|Assegnazione danno `5` contro bersagli in Fronte `\[\*Milizia Cittadina\* hp 3 seq 1, \*Fante con Scudo\* hp 5 seq 2]`|*Milizia* subisce `3` e muore; l'eccesso `2` passa a *Fante con Scudo* che resta a `hp 3`|
|**`TV-11`**|Era I, zero Istantanee: P1 *Milizia Cittadina* (`2/1/3`) vs P2 *Fante con Scudo* (`2/1/5`); Mura P1 = `6`|Fase 3 Ciclo 1: *Milizia* `hp 1`, *Fante* `hp 3`. Ciclo 2: *Milizia* muore (`0`), *Fante* `hp 1`. Guardia: vince P2. Fase 4: `D=1, W=6` $\\to$ Mura P1 = `5`, `breach=false`|
|**`TV-12`**|Era I: P1 *Lanciere Pesante* (`2/1/4`, Impalamento `3`), P2 *Cavaliere Feudale* (`4/1/3`)|Fase 2A: `3` danni alla Cavalleria, *Cavaliere Feudale* muore prima della Fase 2B; la Guardia pre-2B assegna vittoria campale a P1; Fase 4: `D=1, W=6` $\\to$ Mura P2 = `5`|
|**`TV-13`**|Era II: P1 *Cavaliere Corazzato* (`6/2/6`, Accerchiamento `+2`); P2 *Arciere Composto* (`4/0/2`) + *Uomo d'Arme* (`4/2/8`), zero Lancieri|Fase 1: Arciere infligge `4` $\\to$ Cavaliere a `hp 2`. Fase 2B: Accerchiamento `6+2=8`, priorità `rear->front->center`: Arciere muore (`2`), eccesso `6` a *Uomo d'Arme* (`hp 8->2`). Fase 3 Ciclo 1: Cavaliere (`6`) e Uomo d'Arme (`4`) si eliminano a vicenda. **Annientamento Reciproco, Fase 4 saltata**|
|**`TV-14`**|Pre-Battaglia: Mura P1 = `4`; P2 gioca *Fuoco Greco* (`-6`), P1 gioca *Palizzata Extra* (`+3`)|Somma aggregata prima del clamp: $\\max(0, 4 + 3 - 6) = 1\\text{ HP}$. Con solo *Fuoco Greco*: $\\max(0, 4 - 6) = 0\\text{ HP}$|
|**`TV-15`**|Era III, P1 ha $3$ edifici attivi e risorse `(2,2,2)`, gioca *Gilda dei Mercanti* (costo `0/1/0`) sacrificando $1$ edificio|Paga `1` Legno $\\to$ `(2,1,2)`; calcola $N=3$ pre-sacrificio; rimuove l'edificio ($2$ restano); accredita `(+3,+3,+3)` $\\to$ saldo finale `(5,4,5)`, `slotsUsed` invariato ($0$ slot)|
|**`TV-16`**|Era III: P1 gioca due volte *Altoforno Reale*; ha *Campione Imperiale* (`DEM 3`) schierato prima, *Bombarda di Bronzo* (`DEM 18`) schierata dopo|`demBonus = 2`: DEM effettiva `5` per il Campione e `20` per la Bombarda; in caso di vittoria campale `D = 25`|
|**`TV-17`**|Esclusività opportunità d'azione: in Era III P1 gioca `PlayConversion` e tenta subito `PlayCard` nella stessa opportunità|Il turno in quel ciclo è già passato all'avversario (o al ciclo successivo); il secondo comando immediato viene rifiutato|
|**`TV-18`**|Cap Logistico Era I = `4`: P1 gioca $4$ carte da campo e tenta di giocare la $5^{\\text{a}}$|Rifiutata con `no\_slot`; in Pre-Battaglia può comunque giocare Istantanee ($0$ slot)|
|**`TV-19`**|Rendite periodiche: P1 e P2 passano entrambi al Ciclo 1|La Fase di Sviluppo termina subito; nessun Ciclo 2 aperto, nessuna rendita accreditata|
|**`TV-19b`**|Rendite periodiche: P1 passa al Ciclo 1, P2 gioca una carta al Ciclo 1|Si apre il Ciclo 2: **entrambi** (anche P1 che ha già passato) ricevono la rendita del Ciclo 2, poi agisce solo P2|
|**`TV-20`**|Alternanza Iniziativa|`P1` agisce per primo in Era I ed Era III; `P2` agisce per primo in Era II|
|**`TV-21`**|Stallo al $6^\\circ$ ciclo (carte sintetiche): ciascun lato ha $1$ unità `ATK 1, HP 10` sul Fronte|Dopo $6$ cicli di Fase 3 entrambe restano a `hp 4`: esito `stalemate`, Fase 4 saltata, Mura invariate|
|**`TV-22`**|Unità d'Assedio senza combattenti: P1 schiera solo *Ariete Batteria* (`isCombatant: false`), P2 non schiera unità|Guardia prima della Fase 1: $c\_1 = 0, c\_2 = 0 \\to$ `mutual\_annihilation`, Fase 4 saltata, l'Ariete non effettua assedio|
|**`TV-23`**|Fine Era III ai punti: Centro Città P1 = `12 HP`, P2 = `9 HP`|Vince P1 con `kind: 'points'`; se entrambi a `12 HP`, esito `kind: 'draw', winner: 'DRAW'`|
|**`TV-24`**|**Decisione `D1` + `D4`:** in Era III, P1 schiera *Cacciatore* di Era I (`ATK 2, HP 1`, Tiro `+1`) conservato in mano e gioca *Pioggia di Frecce* (`+2 ATK`); P2 ha un Lanciere|`effAtk = 2 + 2 = 4`. In Fase 1 (Tiro) infligge $4 + 1 = 5$ danni (usa il bonus `+1` stampato sulla carta per `D1`, non `+3`). In Fase 3 (Mischia) infligge $\\max(1, \\lfloor 4/2 \\rfloor) = 2$ danni (dimezza `effAtk` per `D4`)|
|**`TV-25`**|**Sequenza Pre-Battaglia (§5.1) + Decisione `D3`:** P1 sacrifica un edificio con *Gilda dei Mercanti*, poi entrambi passano|Nella vista di P2, `sacrificeCardId` è nascosto (`D3`); appena entrambi passano, il motore entra in `prebattle` ed emette subito `UnitsRevealed` rendendo visibili a P2 sia `opponent.units` sia `opponent.resources` **prima** che P1 e P2 inviino `LockInstants`|

\---

## Appendice B — Contenuti delle 45 carte: testi narrativi e brief d'arte

Tutti i flavor text sono **originali** ($\\le 120$ caratteri). I prompt in inglese vanno anteposti allo **stile comune** della sezione 8.4 (`Historical oil painting, visible brushwork, dramatic side lighting, cinematic 4:3 composition, no text, no watermark, no frame...`).

### Era I (Palette: terre calde, ocre, verdi di campagna)

|ID|Nome|Flavor (IT)|Prompt d'arte (EN)|
|-|-|-|-|
|`e1\_farm`|Fattoria|Il primo raccolto non sfama un esercito. Insegna a un villaggio a restare.|Small timber farmstead at dawn, wheat field, ox cart, smoke rising from a thatched roof|
|`e1\_lumb`|Segheria|Ogni palizzata comincia come un albero che qualcuno ha deciso di abbattere.|Rustic sawing pit at a forest edge, two men with a long saw, stacked logs|
|`e1\_mine`|Cava Grezza|Sotto la collina il ferro dorme. I minatori lo svegliano a colpi di piccone.|Open rock quarry with crude timber scaffolds, miners with pickaxes, torchlight|
|`u1\_inf\_l`|Milizia Cittadina|Ieri erano fabbri e fornai. Oggi la porta della città è affar loro.|Townsmen militia in mismatched leather and quilted jackets, round wooden shields, behind a town gate|
|`u1\_inf\_h`|Fante con Scudo|Chi regge lo scudo non vede la battaglia: la sente arrivare.|Infantryman braced behind a large kite shield, mail coif, short sword, impact imminent|
|`u1\_spr\_l`|Picchiere di Leva|Una lancia lunga fa sembrare coraggioso anche chi non lo è.|Levy spearman in a plain cap holding a long spear, field and line of spears behind him|
|`u1\_spr\_h`|Lanciere Pesante|Il cavaliere carica contro l'orizzonte. La lancia gli ricorda dov'è la terra.|Armored spearman kneeling with spear butt planted in the ground, aimed at charging horsemen|
|`u1\_arc\_l`|Cacciatore|Conosce il vento meglio di quanto gli altri conoscano il proprio nome.|Hooded hunter-archer aiming a short bow from a wooded hillside|
|`u1\_arc\_h`|Arciere d'Ordinanza|Cento frecce nello stesso istante diventano una sola decisione.|Disciplined line of longbow archers in matching livery drawing together, volley rising|
|`u1\_cav\_l`|Esploratore a Cavallo|Torna sempre prima della polvere che solleva.|Light scout rider on a lean horse at full gallop along a ridge, dust trail|
|`u1\_cav\_h`|Cavaliere Feudale|Il suo stemma è più antico del castello che difende.|Feudal knight in mail and heraldic surcoat on a caparisoned horse, lance lowered|
|`u1\_sig\_l`|Squadra Genieri|Dove gli altri vedono un muro, loro vedono un problema di leve.|Military engineers with crowbars and wooden props undermining a stone wall|
|`u1\_sig\_h`|Ariete Batteria|Non bussa. Spiega alla porta come andrà a finire.|Roofed battering ram with an iron-capped log being pushed toward a gate|
|`i1\_arr`|Pioggia di Frecce|Il cielo si fece scuro a mezzogiorno, e non per le nuvole.|Dense volley of arrows darkening the sky above a battlefield|
|`i1\_wall`|Palizzata Extra|Una notte di lavoro vale un anno di assedio.|Soldiers driving sharpened stakes into an earthen rampart at night by torchlight|

### Era II (Palette: acciaio freddo, rossi araldici, cieli tersi)

|ID|Nome|Flavor (IT)|Prompt d'arte (EN)|
|-|-|-|-|
|`e2\_mill`|Mulino Idraulico|Il fiume lavora per tutti, anche quando i soldati dormono.|Stone watermill with a large wooden wheel beside a stream, flour sacks, bright afternoon|
|`e2\_saw`|Segheria Grande|Una sola lama sostituisce dieci braccia e non chiede il cambio.|Water-powered sawmill with a reciprocating blade cutting a huge log|
|`e2\_fnd`|Fonderia|Il ferro, quando è rosso, accetta qualsiasi idea.|Foundry with glowing crucibles and bellows, molten metal poured into molds, sparks|
|`u2\_inf\_l`|Spadaccino Scelto|Ogni cicatrice è una lezione che ha già superato.|Veteran swordsman in a half-plate cuirass in a longsword guard stance, scarred face|
|`u2\_inf\_h`|Uomo d'Arme|Pesa quanto un muro e cammina meglio.|Man-at-arms in full steel harness with a poleaxe, visor open, banner behind|
|`u2\_spr\_l`|Alabardiere|L'alabarda decide quanto lontano si può stare dal pericolo.|Halberdier in a morion helmet advancing, halberd held diagonally|
|`u2\_spr\_h`|Guardia Svizzera|Il contratto dura tre mesi. La disciplina, da sempre.|Mercenary pikeman in slashed doublet and plumed cap with a long pike, tight formation|
|`u2\_arc\_l`|Arciere Composto|L'arco è fatto di corno, legno e tendini. La pazienza, di sola pazienza.|Archer drawing a recurved composite bow, horn and sinew detail, cold steel sky|
|`u2\_arc\_h`|Balestriere Pesante|Si carica in un respiro. Non perdona in nessuno.|Crossbowman winding a heavy steel crossbow behind a large pavise shield|
|`u2\_cav\_l`|Ussaro Alato|Le ali sono di piume. Il fragore è tutto suo.|Winged hussar cavalry charging with feathered wing frames on their backs, lances aloft|
|`u2\_cav\_h`|Cavaliere Corazzato|Quando carica, l'orizzonte arretra.|Fully plated knight on an armored warhorse charging, sunlit steel|
|`u2\_sig\_l`|Scorpione d'Assedio|Un dardo grande come un uomo ha sempre ragione.|Large torsion siege crossbow on a wheeled wooden frame, crew loading a huge bolt|
|`u2\_sig\_h`|Mangano Pesante|Il contrappeso cade. Un secolo di mura cade con lui.|Counterweight mangonel mid-throw, boulder against the sky, crew hauling ropes|
|`i2\_sab`|Mina Sotterranea|Il crollo fu preceduto da un silenzio troppo lungo.|Tunnel beneath fortress walls with timber props and sappers by candlelight, cracks above|
|`i2\_mor`|Grido di Guerra|Una voce sola, mille spade che la seguono.|Commander roaring on a rampart with a raised banner, soldiers surging behind|

### Era III (Palette: oro imperiale, fumo di polvere da sparo, luce di tramonto)

|ID|Nome|Flavor (IT)|Prompt d'arte (EN)|
|-|-|-|-|
|`e3\_gld`|Gilda dei Mercanti|Chi vende il proprio banco ha di solito già comprato la nave.|Merchant guild hall interior, ledgers and gold coins on a table, a trader signing a deed with a wax seal|
|`e3\_frn`|Altoforno Reale|Il re volle più cannoni. L'altoforno chiese più fuoco.|Massive blast furnace pouring molten iron, workers in silhouette, orange glow, smoke|
|`u3\_inf\_l`|Berserker d'Élite|Non indossa armatura: ha già pagato in anticipo.|Elite warrior with two axes mid-roar, fur and scars, battlefield smoke|
|`u3\_inf\_h`|Campione Imperiale|L'impero gli diede un nome. Lui gli diede una frontiera.|Champion in gilded heavy armor with a greatsword, imperial standard behind|
|`u3\_spr\_l`|Picchiere Reale|Dietro la picca, la formazione pensa al posto suo.|Royal pikeman in a pike-and-shot formation, forest of tall pikes, livery coats|
|`u3\_spr\_h`|Falange Imperiale|Quando la falange avanza, anche la storia fa un passo indietro.|Tight phalanx with tall shields and long spears advancing, golden light|
|`u3\_arc\_l`|Arciere Lungo Reale|La corona paga l'arco. Il resto lo mette lui.|Royal longbowman in partial plate with a tall war bow, sunset volley|
|`u3\_arc\_h`|Archibugiere|Il fumo arriva prima del suono, il suono prima del dubbio.|Arquebusier firing a matchlock, huge cloud of powder smoke, plumed hat|
|`u3\_cav\_l`|Dragone Imperiale|Cavalca come un cavaliere e spara come un fante: non rispetta nessuna categoria.|Mounted dragoon firing a carbine from horseback, early modern uniform, smoke|
|`u3\_cav\_h`|Catafratto Reale|Un cavallo d'acciaio non teme nulla, tranne le ruote del cannone.|Heavily armored cavalry with full horse barding and golden crests, charging|
|`u3\_sig\_l`|Torre d'Assedio|Avanzava lenta. Le mura, ferme, ebbero più tempo per pensarci.|Wooden siege tower covered in hides rolling up to a fortress wall, archers on the top deck|
|`u3\_sig\_m`|Trabucco Gigante|Il suo contrappeso peserebbe quanto un villaggio.|Gigantic trebuchet at the moment of release, massive counterweight box, dust and stones|
|`u3\_sig\_h`|Bombarda di Bronzo|Fu fusa con le campane. Parla ancora più forte.|Huge bronze bombard on a timber carriage, flash and smoke at the muzzle, wall crumbling|
|`i3\_fir`|Fuoco Greco|L'acqua lo alimenta. Solo il tempo lo sazia.|Bronze siphon spraying streams of liquid fire across a wall, flames reflected on armor|
|`i3\_ral`|Carica Eroica|Il primo a correre non ha coraggio: ha fretta di non pensare.|Infantry and spearmen charging up a slope behind a standard-bearer, golden backlight|

\---

## Appendice C — Mapping degli effetti e configurazione predefinita

### C.1 Tabella esplicita per `tools/card-effects.ts`

|Elemento|Valori esatti|
|-|-|
|**Produzione Edifici**|`e1\_farm`: `+1 food` · `e1\_lumb`: `+1 wood` · `e1\_mine`: `+1 metal` · `e2\_mill`: `+2 food` · `e2\_saw`: `+2 wood` · `e2\_fnd`: `+2 metal`|
|**Impalamento (Lancieri)**|`u1\_spr\_l`, `u1\_spr\_h`: `damage: 3` · `u2\_spr\_l`, `u2\_spr\_h`: `damage: 5` · `u3\_spr\_l`, `u3\_spr\_h`: `damage: 7` ($1 + 2 \\times \\text{eraCarta}$)|
|**Tiro (Arcieri)**|`u1\_arc\_l`, `u1\_arc\_h`: `bonusVsSpearman: 1` · `u2\_arc\_l`, `u2\_arc\_h`: `bonusVsSpearman: 2` · `u3\_arc\_l`, `u3\_arc\_h`: `bonusVsSpearman: 3`|
|**Accerchiamento (Cavalleria)**|`u1\_cav\_l`, `u1\_cav\_h`: `bonusVsArcher: 1` · `u2\_cav\_l`, `u2\_cav\_h`: `bonusVsArcher: 2` · `u3\_cav\_l`, `u3\_cav\_h`: `bonusVsArcher: 3`|
|**Istantanee**|`i1\_arr`: `atk\_mod own\_archers +2` · `i1\_wall`: `walls\_mod own +3` · `i2\_sab`: `walls\_mod enemy -4` · `i2\_mor`: `atk\_mod own\_front +2` · `i3\_fir`: `walls\_mod enemy -6` · `i3\_ral`: `atk\_mod own\_front +2`|
|**Riconversioni**|`e3\_gld`: `gain\_per\_building { food: 1, wood: 1, metal: 1 }` · `e3\_frn`: `gain\_and\_dem\_bonus { gain: { food: 0, wood: 2, metal: 3 }, demBonus: 1 }`|

Il valore di Mischia degli Arcieri non è un campo statico ma è calcolato a runtime con $\\max(1, \\lfloor \\text{effAtk} / 2 \\rfloor)$ (`D4`). Il validatore `content:validate` verifica che per l'ATK base dei $6$ Arcieri ($2, 3, 4, 5, 6, 8$) la formula restituisca esattamente i valori base indicati nel GDD ($1, 1, 2, 2, 3, 4$).

### C.2 Esempio di voce in `data/cards.rules.json`

```json
{
  "u2\_cav\_h": {
    "id": "u2\_cav\_h",
    "era": 2,
    "type": "unit",
    "category": "cavalry",
    "line": "center",
    "cost": { "food": 3, "wood": 0, "metal": 2 },
    "atk": 6,
    "dem": 2,
    "hp": 6,
    "isCombatant": true,
    "abilities": \[
      { "kind": "flank", "bonusVsArcher": 2 }
    ]
  }
}
```

### C.3 Esempio di voce in `data/cards.text.it.json`

```json
{
  "u2\_cav\_h": {
    "name": "Cavaliere Corazzato",
    "typeLine": "Unità — Cavalleria · Centro",
    "flavor": "Quando carica, l'orizzonte arretra."
  }
}
```

### C.4 Configurazione normativa `RulesConfig` predefinita

```json
{
  "gddVersion": "1.0",
  "eraScalingSource": "card",
  "archerMeleeUsesEffectiveAtk": true,
  "seqAssignedAt": "play",
  "autoPassWhenNoLegalPlay": false,
  "discardVisibility": "hidden",
  "sacrificeVisibility": "hidden",
  "timeoutPolicy": {
    "development": "pass",
    "mulligan": "keep",
    "prebattle": "none",
    "handLimit": "deterministic\_policy",
    "seconds": {
      "mulligan": 30,
      "handLimit": 30,
      "development": 45,
      "prebattle": 30
    },
    "concedeAfterConsecutiveTimeouts": 3
  }
}
```

