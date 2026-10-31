// TECH-SPEC §7.2 — Worker di simulazione deterministica delle partite per @epochs/sim.

import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  collectDevelopmentMetrics,
  emptyDevelopmentMetrics,
  type DevelopmentMetrics,
} from './expansion-metrics.js';
import { DEFAULT_BOT_CATALOG, createBot, type Bot, type BotKind } from '../../bots/src/index.js';
import {
  HAND_LIMIT,
  INITIAL_WALLS,
  PLAYERS_ORDER,
  apply,
  createGame,
  nextRandom,
  playerView,
  seedToRngState,
  type BattleOutcomeKind,
  type CardRules,
  type Command,
  type DeckPayload,
  type EraNo,
  type GameEvent,
  type GameResultKind,
  type GameState,
  type PlayerId,
  type RulesConfig,
} from '../../engine/src/index.js';

export type CompetitorId = 'A' | 'B';

export interface EraMetricsRecord {
  readonly era: EraNo;
  cycles: number;
  battleOutcome: BattleOutcomeKind | null;
  battleWinner: PlayerId | null;
  siegeExecuted: boolean;
  breach: boolean;
  breachAttacker: PlayerId | null;
  directDamage: number;
  directDamageByAttacker: Record<PlayerId, number>;
  wallsAfter: Record<PlayerId, number>;
  raidedFood: number;
  raidedWood: number;
  raidAttacker: PlayerId | null;
}

export interface GameMetricsRecord {
  readonly development?: Record<PlayerId, DevelopmentMetrics>;
  readonly gameIndex: number;
  readonly seed: string;
  readonly aSeat: PlayerId;
  readonly bSeat: PlayerId;
  readonly winner: PlayerId | 'DRAW';
  readonly winnerCompetitor: CompetitorId | 'DRAW';
  readonly resultKind: GameResultKind;
  readonly finalEra: EraNo;
  readonly steps: number;
  readonly finalWalls: Record<PlayerId, number>;
  readonly finalCityHp: Record<PlayerId, number>;
  readonly finalCityDamage: Record<PlayerId, number>;
  readonly eras: Partial<Record<EraNo, EraMetricsRecord>>;
  readonly cardsDrawnByPlayer: Record<PlayerId, Record<string, number>>;
  readonly cardsPlayedByPlayer: Record<PlayerId, Record<string, number>>;
}

export interface SimulateGameParams {
  readonly masterSeed: string;
  readonly gameIndex: number;
  readonly deckA: DeckPayload;
  readonly deckB: DeckPayload;
  readonly botA: Bot | BotKind;
  readonly botB: Bot | BotKind;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly rules?: Partial<RulesConfig>;
  readonly maxSteps?: number;
}

export interface WorkerBatchTask {
  readonly workerId: number;
  readonly masterSeed: string;
  readonly gameIndices: readonly number[];
  readonly deckA: DeckPayload;
  readonly deckB: DeckPayload;
  readonly botA: BotKind;
  readonly botB: BotKind;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly rules?: Partial<RulesConfig>;
  readonly maxSteps?: number;
}

export interface WorkerBatchResult {
  readonly workerId: number;
  readonly records: GameMetricsRecord[];
}

const DEFAULT_MAX_STEPS = 500;

/**
 * Deriva il seed deterministico della singola partita a partire da `masterSeed` e `gameIndex`
 * così che l'esito della partita `gameIndex` sia indipendente dal worker che la esegue.
 */
export function deriveGameSeed(masterSeed: string, gameIndex: number): string {
  return `${masterSeed}:${gameIndex}`;
}

/**
 * Costruisce una funzione PRNG deterministica `[0, 1)` basata su `sfc32` a partire da un seed stringa.
 */
export function createDeterministicBotRng(seed: string): () => number {
  let rngState = seedToRngState(seed);
  return () => {
    const step = nextRandom(rngState);
    rngState = step.nextState;
    return step.value;
  };
}

function resolveBotInstance(
  botOrKind: Bot | BotKind,
  catalog: Readonly<Record<string, CardRules>>,
): Bot {
  if (typeof botOrKind === 'string') {
    return createBot(botOrKind, { catalog });
  }
  return botOrKind;
}

function createEmptyEraMetrics(
  era: EraNo,
  initialWalls: Readonly<Record<PlayerId, number>>,
): EraMetricsRecord {
  return {
    era,
    cycles: 0,
    battleOutcome: null,
    battleWinner: null,
    siegeExecuted: false,
    breach: false,
    breachAttacker: null,
    directDamage: 0,
    directDamageByAttacker: { P1: 0, P2: 0 },
    wallsAfter: { P1: initialWalls.P1, P2: initialWalls.P2 },
    raidedFood: 0,
    raidedWood: 0,
    raidAttacker: null,
  };
}

function ensureEraRecord(
  eras: Partial<Record<EraNo, EraMetricsRecord>>,
  era: EraNo,
  currentWalls: Readonly<Record<PlayerId, number>>,
): EraMetricsRecord {
  let record = eras[era];
  if (record === undefined) {
    record = createEmptyEraMetrics(era, currentWalls);
    eras[era] = record;
  }
  return record;
}

function incrementCardCounter(counter: Record<string, number>, cardId: string): void {
  counter[cardId] = (counter[cardId] ?? 0) + 1;
}

/**
 * Determina quale giocatore deve agire nello stato corrente senza mai esporre `GameState` al bot.
 */
function selectNextActingPlayer(state: Readonly<GameState>): PlayerId {
  if (state.phase === 'development') {
    if (state.toAct !== null) {
      return state.toAct;
    }
  }

  if (state.phase === 'mulligan') {
    if (state.pending.P1 === undefined && !state.players.P1.mulliganDone) {
      return 'P1';
    }
    return 'P2';
  }

  if (state.phase === 'hand_limit') {
    if (state.pending.P1 === undefined && state.players.P1.hand.length > HAND_LIMIT) {
      return 'P1';
    }
    return 'P2';
  }

  if (state.phase === 'prebattle') {
    if (state.pending.P1 === undefined) {
      return 'P1';
    }
    return 'P2';
  }

  return 'P1';
}

function processEventsForMetrics(
  events: readonly GameEvent[],
  stateAfter: Readonly<GameState>,
  eras: Partial<Record<EraNo, EraMetricsRecord>>,
  seenDrawnUids: Record<PlayerId, Set<string>>,
  cardsDrawnByPlayer: Record<PlayerId, Record<string, number>>,
  cardsPlayedByPlayer: Record<PlayerId, Record<string, number>>,
): void {
  for (const event of events) {
    switch (event.type) {
      case 'GameStarted': {
        ensureEraRecord(eras, event.era, {
          P1: INITIAL_WALLS,
          P2: INITIAL_WALLS,
        });
        break;
      }

      case 'EraStarted': {
        ensureEraRecord(eras, event.era, event.walls);
        break;
      }

      case 'MulliganResolved': {
        // Dopo il mulligan, registra le carte effettivamente rimaste o entrate nella mano iniziale di Era I
        const playerHand = stateAfter.players[event.player].hand;
        for (const card of playerHand) {
          if (!seenDrawnUids[event.player].has(card.uid)) {
            seenDrawnUids[event.player].add(card.uid);
            incrementCardCounter(cardsDrawnByPlayer[event.player], card.cardId);
          }
        }
        break;
      }

      case 'CardsDrawn': {
        // Per Era II e Era III (e fallback se non passati da mulligan), registra le nuove carte pescate
        if (event.era !== 1 && event.cards !== undefined) {
          for (const card of event.cards) {
            if (!seenDrawnUids[event.player].has(card.uid)) {
              seenDrawnUids[event.player].add(card.uid);
              incrementCardCounter(cardsDrawnByPlayer[event.player], card.cardId);
            }
          }
        }
        break;
      }

      case 'CycleStarted': {
        const eraRecord = ensureEraRecord(eras, event.era, {
          P1: stateAfter.players.P1.walls,
          P2: stateAfter.players.P2.walls,
        });
        if (event.cycle > eraRecord.cycles) {
          eraRecord.cycles = event.cycle;
        }
        break;
      }

      case 'CardPlayed': {
        if (event.cardId !== undefined) {
          incrementCardCounter(cardsPlayedByPlayer[event.player], event.cardId);
        }
        break;
      }

      case 'ConversionActivated': {
        incrementCardCounter(cardsPlayedByPlayer[event.player], event.cardId);
        break;
      }

      case 'InstantsRevealed': {
        for (const player of PLAYERS_ORDER) {
          for (const playedInstant of event.played[player]) {
            incrementCardCounter(cardsPlayedByPlayer[player], playedInstant.cardId);
          }
        }
        break;
      }

      case 'WallsModified': {
        const eraRecord = ensureEraRecord(eras, event.era, event.wallsAfter);
        eraRecord.wallsAfter = {
          P1: event.wallsAfter.P1,
          P2: event.wallsAfter.P2,
        };
        break;
      }

      case 'BattleOutcome': {
        const eraRecord = ensureEraRecord(eras, event.era, {
          P1: stateAfter.players.P1.walls,
          P2: stateAfter.players.P2.walls,
        });
        eraRecord.battleOutcome = event.kind;
        eraRecord.battleWinner = event.winner ?? null;
        break;
      }

      case 'SiegeResolved': {
        const eraRecord = ensureEraRecord(eras, event.era, {
          P1: stateAfter.players.P1.walls,
          P2: stateAfter.players.P2.walls,
        });
        eraRecord.siegeExecuted = true;
        eraRecord.breach = event.breach;
        eraRecord.breachAttacker = event.breach ? event.attacker : null;
        eraRecord.directDamage += event.directDamage;
        eraRecord.directDamageByAttacker[event.attacker] += event.directDamage;
        eraRecord.wallsAfter[event.defender] = event.wallsAfter;
        break;
      }

      case 'RaidResolved': {
        const eraRecord = ensureEraRecord(eras, event.era, {
          P1: stateAfter.players.P1.walls,
          P2: stateAfter.players.P2.walls,
        });
        eraRecord.raidedFood += event.foodTransferred;
        eraRecord.raidedWood += event.woodTransferred;
        eraRecord.raidAttacker = event.attacker;
        break;
      }

      default:
        break;
    }
  }
}

/**
 * Esegue una singola partita deterministica completa tra `deckA`/`botA` e `deckB`/`botB`
 * con seed derivato da `${masterSeed}:${gameIndex}`, raccogliendo tutte le metriche richieste in §7.2.
 *
 * I posti `P1` (primo giocatore in Era I e III) e `P2` (primo giocatore in Era II) sono alternati
 * in base alla parità di `gameIndex` (`gameIndex % 2 === 0` -> A=P1, B=P2; dispari -> A=P2, B=P1)
 * per bilanciare perfettamente il vantaggio d'iniziativa tra i due archetipi.
 */
export function simulateGame(params: SimulateGameParams): GameMetricsRecord {
  const catalog = (params.catalog ?? DEFAULT_BOT_CATALOG) as Record<string, CardRules>;
  const maxSteps = params.maxSteps ?? DEFAULT_MAX_STEPS;
  const seed = deriveGameSeed(params.masterSeed, params.gameIndex);

  const aIsP1 = params.gameIndex % 2 === 0;
  const aSeat: PlayerId = aIsP1 ? 'P1' : 'P2';
  const bSeat: PlayerId = aIsP1 ? 'P2' : 'P1';

  const botInstanceA = resolveBotInstance(params.botA, catalog);
  const botInstanceB = resolveBotInstance(params.botB, catalog);

  const botByPlayer: Record<PlayerId, Bot> = aIsP1
    ? { P1: botInstanceA, P2: botInstanceB }
    : { P1: botInstanceB, P2: botInstanceA };

  const decksByPlayer: Record<PlayerId, DeckPayload> = aIsP1
    ? { P1: params.deckA, P2: params.deckB }
    : { P1: params.deckB, P2: params.deckA };

  const { state: initialState, events: initialEvents } = createGame({
    seed,
    catalog,
    decks: decksByPlayer,
    fixedInitiative: 'P1',
    ...(params.rules !== undefined ? { rules: params.rules } : {}),
  });

  let state = initialState;
  const development = { P1: emptyDevelopmentMetrics(), P2: emptyDevelopmentMetrics() };
  collectDevelopmentMetrics(development, initialEvents, state);
  const botRng = createDeterministicBotRng(`${seed}:bot`);

  const eras: Partial<Record<EraNo, EraMetricsRecord>> = {};
  const seenDrawnUids: Record<PlayerId, Set<string>> = {
    P1: new Set<string>(),
    P2: new Set<string>(),
  };
  const cardsDrawnByPlayer: Record<PlayerId, Record<string, number>> = {
    P1: {},
    P2: {},
  };
  const cardsPlayedByPlayer: Record<PlayerId, Record<string, number>> = {
    P1: {},
    P2: {},
  };

  processEventsForMetrics(
    initialEvents,
    state,
    eras,
    seenDrawnUids,
    cardsDrawnByPlayer,
    cardsPlayedByPlayer,
  );

  let steps = 0;
  while (state.phase !== 'finished') {
    steps += 1;
    if (steps > maxSteps) {
      throw new Error(
        `Simulated game ${params.gameIndex} (seed "${seed}") exceeded maxSteps (${maxSteps}) in phase "${state.phase}" (era ${state.era}, cycle ${state.cycle}).`,
      );
    }

    const activePlayer = selectNextActingPlayer(state);
    const view = playerView(state, activePlayer);
    const clientCommand = botByPlayer[activePlayer].choose(view, botRng);
    const command: Command = {
      ...clientCommand,
      player: activePlayer,
    };

    const transition = apply(state, command);
    if (!transition.ok) {
      throw new Error(
        `Bot "${botByPlayer[activePlayer].name}" (${activePlayer}) emitted illegal command ${command.type} in game ${params.gameIndex} (seed "${seed}"): ${transition.error.code} — ${transition.error.message}`,
      );
    }

    collectDevelopmentMetrics(development, transition.value.events, state, command);
    state = transition.value.state;
    processEventsForMetrics(
      transition.value.events,
      state,
      eras,
      seenDrawnUids,
      cardsDrawnByPlayer,
      cardsPlayedByPlayer,
    );
  }

  if (state.result === null) {
    throw new Error(
      `Simulated game ${params.gameIndex} (seed "${seed}") reached phase "finished" with null result.`,
    );
  }

  const winner = state.result.winner;
  const winnerCompetitor: CompetitorId | 'DRAW' =
    winner === 'DRAW' ? 'DRAW' : winner === aSeat ? 'A' : 'B';

  return {
    gameIndex: params.gameIndex,
    development,
    seed,
    aSeat,
    bSeat,
    winner,
    winnerCompetitor,
    resultKind: state.result.kind,
    finalEra: state.era,
    steps,
    finalWalls: {
      P1: state.players.P1.walls,
      P2: state.players.P2.walls,
    },
    finalCityHp: {
      P1: state.players.P1.cityMax - state.players.P1.cityDamage,
      P2: state.players.P2.cityMax - state.players.P2.cityDamage,
    },
    finalCityDamage: {
      P1: state.players.P1.cityDamage,
      P2: state.players.P2.cityDamage,
    },
    eras,
    cardsDrawnByPlayer,
    cardsPlayedByPlayer,
  };
}

/**
 * Esegue in sequenza un batch di partite assegnate a un worker.
 */
export function runWorkerBatch(task: WorkerBatchTask): WorkerBatchResult {
  const catalog = (task.catalog ?? DEFAULT_BOT_CATALOG) as Record<string, CardRules>;
  const botInstanceA = createBot(task.botA, { catalog });
  const botInstanceB = createBot(task.botB, { catalog });

  const records: GameMetricsRecord[] = [];
  for (const gameIndex of task.gameIndices) {
    const record = simulateGame({
      masterSeed: task.masterSeed,
      gameIndex,
      deckA: task.deckA,
      deckB: task.deckB,
      botA: botInstanceA,
      botB: botInstanceB,
      catalog,
      ...(task.rules !== undefined ? { rules: task.rules } : {}),
      ...(task.maxSteps !== undefined ? { maxSteps: task.maxSteps } : {}),
    });
    records.push(record);
  }

  return {
    workerId: task.workerId,
    records,
  };
}

if (!isMainThread && parentPort !== null && workerData !== undefined) {
  const result = runWorkerBatch(workerData as WorkerBatchTask);
  parentPort.postMessage(result);
}
