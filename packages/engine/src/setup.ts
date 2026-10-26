// GDD §2.1, §2.2, §3.2, §3.3.1–2, TECH-SPEC §4.4, §4.5, §4.6, §11.2 R6, Appendice A TV-08
// Avvio partita (createGame), pesca iniziale da sotto-mazzo e risoluzione simultanea del mulligan.

import { produce } from 'immer';
import type { Result, RuleError, SubmitMulliganCommand } from './commands.js';
import { validateDeck } from './deck.js';
import {
  INITIAL_RESOURCES,
  PLAYERS_ORDER,
  applyOpeningHarvest,
  creditPlayerResources,
} from './economy.js';
import type { GameEvent } from './events.js';
import { nextInt, seedToRngState, shuffle } from './rng.js';
import type { RngState } from './rng.js';
import { DEFAULT_RULES_CONFIG } from './types.js';
import type {
  CardInstance,
  CardRules,
  EraNo,
  GameCounters,
  GameState,
  PlayerId,
  PlayerState,
  RulesConfig,
} from './types.js';
import type { DeckPayload, NewGameConfig } from './view-types.js';

export const INITIAL_WALLS = 6;
export const INITIAL_CITY_MAX = 10;

export const ERA_DRAW_COUNT: Readonly<Record<EraNo, number>> = {
  1: 8,
  2: 5,
  3: 5,
};

export const ERA_CITY_MAX: Readonly<Record<EraNo, number>> = {
  1: 10,
  2: 16,
  3: 22,
};

export const ERA_BASE_WALLS: Readonly<Record<2 | 3, number>> = {
  2: 8,
  3: 10,
};

const ERA_SUBDECK_ENTRIES: ReadonlyArray<readonly ['1' | '2' | '3', EraNo]> = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
];

/**
 * Restituisce l'identificativo dell'avversario di `player`.
 */
export function getOpponent(player: PlayerId): PlayerId {
  return player === 'P1' ? 'P2' : 'P1';
}

/**
 * Unisce la configurazione opzionale con DEFAULT_RULES_CONFIG preservando i sotto-oggetti annidati.
 */
export function mergeRulesConfig(overrides?: Partial<RulesConfig>): RulesConfig {
  if (overrides === undefined) {
    return structuredClone(DEFAULT_RULES_CONFIG);
  }

  return {
    ...DEFAULT_RULES_CONFIG,
    ...overrides,
    timeoutPolicy: {
      ...DEFAULT_RULES_CONFIG.timeoutPolicy,
      ...overrides.timeoutPolicy,
      seconds: {
        ...DEFAULT_RULES_CONFIG.timeoutPolicy.seconds,
        ...overrides.timeoutPolicy?.seconds,
      },
    },
  };
}

function createCardInstances(
  cardIds: readonly string[],
  owner: PlayerId,
  catalog: Readonly<Record<string, CardRules>>,
  counters: GameCounters,
): CardInstance[] {
  return cardIds.map((cardId) => {
    if (catalog[cardId] === undefined) {
      throw new Error(
        `Card "${cardId}" for player ${owner} does not exist in catalog.`,
      );
    }
    const nextUidNum = ++counters.uid;
    return {
      uid: `uid_${owner}_${String(nextUidNum).padStart(4, '0')}`,
      cardId,
      owner,
      drawnOrder: 0,
    };
  });
}

function buildPlayerSubdecks(
  player: PlayerId,
  config: NewGameConfig,
  counters: GameCounters,
  rngState: RngState,
): {
  subdecks: Record<EraNo, CardInstance[]>;
  nextRngState: RngState;
} {
  const fixedForPlayer = config.fixedDecks?.[player];
  if (fixedForPlayer !== undefined) {
    const subdecks: Record<EraNo, CardInstance[]> = {
      1: createCardInstances(fixedForPlayer[1], player, config.catalog, counters),
      2: createCardInstances(fixedForPlayer[2], player, config.catalog, counters),
      3: createCardInstances(fixedForPlayer[3], player, config.catalog, counters),
    };
    return { subdecks, nextRngState: rngState };
  }

  const deckPayload: DeckPayload | undefined = config.decks?.[player];
  if (deckPayload === undefined) {
    throw new Error(
      `Either decks or fixedDecks must be provided for player ${player} in NewGameConfig.`,
    );
  }

  const issues = validateDeck(deckPayload, config.catalog);
  if (issues.length > 0) {
    const firstIssue = issues[0]!;
    throw new Error(
      `Invalid deck for ${player} (${firstIssue.code}): ${firstIssue.message}`,
    );
  }

  let currentRng = rngState;
  const subdecks: Record<EraNo, CardInstance[]> = {
    1: [],
    2: [],
    3: [],
  };

  for (const [eraKey, eraNo] of ERA_SUBDECK_ENTRIES) {
    const instances = createCardInstances(
      deckPayload.subdecks[eraKey],
      player,
      config.catalog,
      counters,
    );
    const shuffled = shuffle(instances, currentRng);
    subdecks[eraNo] = shuffled.items;
    currentRng = shuffled.nextState;
  }

  return { subdecks, nextRngState: currentRng };
}

function createInitialPlayerState(
  subdecks: Record<EraNo, CardInstance[]>,
): PlayerState {
  return {
    hand: [],
    subdecks,
    discard: [],
    publicDiscard: [],
    resources: { food: 0, wood: 0, metal: 0 },
    buildings: [],
    units: [],
    slotsUsed: 0,
    passed: false,
    walls: INITIAL_WALLS,
    cityMax: INITIAL_CITY_MAX,
    cityDamage: 0,
    demBonus: 0,
    mulliganDone: false,
    consecutiveTimeouts: 0,
  };
}

/**
 * Pesca `count` carte dalla cima (indice 0) del sotto-mazzo dell'Era indicata per `player`,
 * assegnando a ciascuna un `drawnOrder` monotono crescente ed emettendo `CardsDrawn`.
 */
export function drawCardsFromSubdeck(
  state: GameState,
  events: GameEvent[],
  player: PlayerId,
  era: EraNo,
  count: number,
): CardInstance[] {
  const playerState = state.players[player];
  const subdeck = playerState.subdecks[era];
  const actualCount = Math.min(count, subdeck.length);
  const drawnCards: CardInstance[] = [];

  for (let i = 0; i < actualCount; i++) {
    const card = subdeck.shift()!;
    card.drawnOrder = ++state.counters.drawnOrder;
    playerState.hand.push(card);
    drawnCards.push({ ...card });
  }

  events.push({
    n: ++state.counters.event,
    type: 'CardsDrawn',
    player,
    era,
    count: drawnCards.length,
    cards: drawnCards,
  });

  return drawnCards;
}

/**
 * Esegue il Raccolto d'apertura dell'Era corrente per entrambi i giocatori e apre il Ciclo 1 di `development`
 * (GDD §3.3.2–3, TECH-SPEC §4.4 passi 6 e 7).
 */
export function startEraDevelopment(
  state: GameState,
  events: GameEvent[],
): void {
  applyOpeningHarvest(state, events);

  state.phase = 'development';
  state.cycle = 1;
  state.toAct = state.initiative;
  state.players.P1.passed = false;
  state.players.P2.passed = false;

  events.push({
    n: ++state.counters.event,
    type: 'CycleStarted',
    era: state.era,
    cycle: 1,
    toAct: state.initiative,
  });
}

/**
 * Inizializza una nuova partita deterministica secondo GDD §2.1, §2.2, §3.2, §3.3.1 e TECH-SPEC §4.4, §4.6:
 * - assegna iniziativa P1/P2 tramite PRNG sfc32 o `fixedInitiative`;
 * - crea e mescola separatamente i 3 sotto-mazzi per ciascun giocatore (o usa `fixedDecks`);
 * - imposta Mura = 6, Centro Città = 10/10, dotazione iniziale = 2/2/0;
 * - pesca 8 carte dal sotto-mazzo di Era I per P1 e P2 con `drawnOrder` monotono;
 * - entra nella finestra simultanea `mulligan`.
 */
export function createGame(config: NewGameConfig): {
  state: GameState;
  events: GameEvent[];
} {
  if (config.decks === undefined && config.fixedDecks === undefined) {
    throw new Error(
      'Either decks or fixedDecks must be provided in NewGameConfig.',
    );
  }

  let rngState: RngState = seedToRngState(config.seed);
  const counters: GameCounters = {
    uid: 0,
    drawnOrder: 0,
    seq: 0,
    event: 0,
  };

  let initiative: PlayerId;
  if (config.fixedInitiative !== undefined) {
    initiative = config.fixedInitiative;
  } else {
    const initStep = nextInt(rngState, 2);
    rngState = initStep.nextState;
    initiative = initStep.value === 0 ? 'P1' : 'P2';
  }

  const p1Build = buildPlayerSubdecks('P1', config, counters, rngState);
  rngState = p1Build.nextRngState;

  const p2Build = buildPlayerSubdecks('P2', config, counters, rngState);
  rngState = p2Build.nextRngState;

  const state: GameState = {
    schemaVersion: 1,
    rulesetVersion: '1.0',
    catalogVersion: '1.0',
    stateVersion: 0,
    rules: mergeRulesConfig(config.rules),
    catalog: config.catalog,
    seed: config.seed,
    rngState,
    era: 1,
    phase: 'mulligan',
    cycle: 0,
    initiative,
    toAct: null,
    players: {
      P1: createInitialPlayerState(p1Build.subdecks),
      P2: createInitialPlayerState(p2Build.subdecks),
    },
    pending: {},
    counters,
    result: null,
  };

  const events: GameEvent[] = [];

  events.push({
    n: ++state.counters.event,
    type: 'GameStarted',
    era: 1,
    rulesetVersion: '1.0',
    catalogVersion: '1.0',
  });

  events.push({
    n: ++state.counters.event,
    type: 'InitiativeAssigned',
    era: 1,
    initiative: state.initiative,
  });

  events.push({
    n: ++state.counters.event,
    type: 'EraStarted',
    era: 1,
    initiative: state.initiative,
    walls: {
      P1: state.players.P1.walls,
      P2: state.players.P2.walls,
    },
    cityHp: {
      P1: state.players.P1.cityMax - state.players.P1.cityDamage,
      P2: state.players.P2.cityMax - state.players.P2.cityDamage,
    },
    cityMax: {
      P1: state.players.P1.cityMax,
      P2: state.players.P2.cityMax,
    },
  });

  for (const player of PLAYERS_ORDER) {
    creditPlayerResources(state, events, player, INITIAL_RESOURCES, 'initial');
  }

  for (const player of PLAYERS_ORDER) {
    drawCardsFromSubdeck(state, events, player, 1, ERA_DRAW_COUNT[1]);
  }

  return { state, events };
}

/**
 * Valida in modo puro un comando `SubmitMulligan` sullo stato corrente.
 */
export function validateSubmitMulligan(
  state: Readonly<GameState>,
  cmd: SubmitMulliganCommand,
): RuleError | null {
  if (state.phase !== 'mulligan') {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot submit mulligan in phase "${state.phase}" (expected "mulligan").`,
    };
  }

  const playerState = state.players[cmd.player];
  if (state.pending[cmd.player] !== undefined || playerState.mulliganDone) {
    return {
      code: 'DECISION_ALREADY_LOCKED',
      message: `Player ${cmd.player} has already locked their mulligan decision.`,
    };
  }

  const handUids = new Set(playerState.hand.map((c) => c.uid));
  const seenUids = new Set<string>();
  for (const uid of cmd.cardUids) {
    if (seenUids.has(uid) || !handUids.has(uid)) {
      return {
        code: 'CARD_NOT_IN_HAND',
        message: `Card "${uid}" is not a distinct card in ${cmd.player}'s hand.`,
      };
    }
    seenUids.add(uid);
  }

  if (cmd.cardUids.length > playerState.subdecks[1].length) {
    return {
      code: 'INVALID_DISCARD_COUNT',
      message: `Cannot mulligan ${cmd.cardUids.length} cards when Era I subdeck has ${playerState.subdecks[1].length} cards.`,
    };
  }

  return null;
}

/**
 * Applica in-place su un draft `GameState` il comando `SubmitMulligan` (usato da `submitMulligan` e `apply`).
 * Quando entrambi i giocatori hanno confermato:
 * 1. Per ciascun giocatore (P1, P2) pesca prima le N carte sostitutive dalla cima del sotto-mazzo Era I;
 * 2. Solo dopo pone le N carte rese in fondo al sotto-mazzo Era I ordinate per `drawnOrder` crescente (R6, TV-08);
 * 3. Emette `MulliganResolved`, svuota `pending`, esegue il Raccolto d'apertura Era I e apre il Ciclo 1 di `development`.
 */
export function mutateSubmitMulligan(
  draft: GameState,
  cmd: SubmitMulliganCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validateSubmitMulligan(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  draft.pending[cmd.player] = {
    window: 'mulligan',
    cardUids: cmd.cardUids.slice(),
  };

  events.push({
    n: ++draft.counters.event,
    type: 'PlayerCommitted',
    player: cmd.player,
    window: 'mulligan',
  });

  if (draft.pending.P1 !== undefined && draft.pending.P2 !== undefined) {
    for (const player of PLAYERS_ORDER) {
      const commit = draft.pending[player]!;
      const selectedUids = new Set(commit.cardUids);
      const playerState = draft.players[player];

      const keptCards = playerState.hand.filter(
        (card) => !selectedUids.has(card.uid),
      );
      const returnedCards = playerState.hand
        .filter((card) => selectedUids.has(card.uid))
        .sort((a, b) => a.drawnOrder - b.drawnOrder);

      const replaceCount = returnedCards.length;
      const drawnReplacementCards: CardInstance[] = [];

      // R6 & TV-08: Pesca prima le N carte sostitutive dalla cima del sotto-mazzo Era I
      for (let i = 0; i < replaceCount; i++) {
        const replacement = playerState.subdecks[1].shift()!;
        replacement.drawnOrder = ++draft.counters.drawnOrder;
        drawnReplacementCards.push(replacement);
      }

      // R6 & TV-08: Solo dopo rimette le N carte rese in fondo al sotto-mazzo Era I (ordinate per drawnOrder crescente)
      for (const returned of returnedCards) {
        playerState.subdecks[1].push(returned);
      }

      playerState.hand = [...keptCards, ...drawnReplacementCards];
      playerState.mulliganDone = true;

      events.push({
        n: ++draft.counters.event,
        type: 'MulliganResolved',
        player,
        count: replaceCount,
        returnedCardUids: returnedCards.map((c) => c.uid),
        drawnCards: drawnReplacementCards.map((c) => ({ ...c })),
      });
    }

    draft.pending = {};
    startEraDevelopment(draft, events);
  }

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `SubmitMulligan` (incrementa `stateVersion` se valido).
 */
export function submitMulligan(
  state: GameState,
  cmd: SubmitMulliganCommand,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validateSubmitMulligan(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.players[cmd.player].consecutiveTimeouts = 0;
    mutateSubmitMulligan(draft, cmd, events);
    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}
