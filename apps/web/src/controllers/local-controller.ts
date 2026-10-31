import { createBot, type Bot } from '@epochs/bots';
import { getCatalog } from '@epochs/content';
import {
  apply,
  createGame,
  createSfc32,
  getOpponent,
  playerView,
  projectEvent,
  type CardRules,
  type ClientCommand,
  type Command,
  type DeckPayload,
  type EraNo,
  type GameEvent,
  type GameState,
  type NewGameConfig,
  type PlayerId,
  type PlayerView,
  type Result,
  type RuleError,
  type RulesConfig,
} from '@epochs/engine';
import { useGameStore, type GameStoreApi } from '../state/game-store.js';
import type {
  GameController,
  LocalGameControllerOptions,
  ProjectionNotification,
} from './types.js';

const MAX_BOT_SAFETY_STEPS = 512;

function toFullCommand(player: PlayerId, command: ClientCommand): Command {
  switch (command.type) {
    case 'ActivateMarket':
      return { ...command, player };
    case 'SubmitMulligan':
      return {
        type: 'SubmitMulligan',
        player,
        cardUids: [...command.cardUids],
      };
    case 'SubmitDiscard':
      return {
        type: 'SubmitDiscard',
        player,
        cardUids: [...command.cardUids],
      };
    case 'PlayCard':
      return {
        type: 'PlayCard',
        player,
        cardUid: command.cardUid,
      };
    case 'PlayConversion':
      return {
        type: 'PlayConversion',
        player,
        cardUid: command.cardUid,
        sacrificeUid: command.sacrificeUid,
      };
    case 'Pass':
      return {
        type: 'Pass',
        player,
      };
    case 'LockInstants':
      return {
        type: 'LockInstants',
        player,
        cardUids: [...command.cardUids],
      };
    case 'ApplyTimeout':
      return {
        type: 'ApplyTimeout',
        player,
      };
    case 'Concede':
      return {
        type: 'Concede',
        player,
      };
  }
}

/**
 * Determina il giocatore che deve avere il controllo del dispositivo in modalità Hot-Seat
 * per la fase o finestra segreta corrente (§9.8).
 */
export function determineActiveHotSeatPlayer(state: GameState, currentSeat: PlayerId): PlayerId {
  if (state.phase === 'finished') {
    return currentSeat;
  }

  if (state.phase === 'development') {
    return state.toAct ?? state.initiative;
  }

  if (playerView(state, 'P1').self.legal.canAct) {
    return 'P1';
  }
  if (playerView(state, 'P2').self.legal.canAct) {
    return 'P2';
  }

  return state.initiative;
}

/**
 * Controller locale che esegue `@epochs/engine` nel browser filtrando SEMPRE
 * ogni stato ed evento tramite `playerView` e `projectEvent` (TECH-SPEC §5.1, §9.8).
 */
export class LocalGameController implements GameController {
  readonly mode: 'bot' | 'hotseat';

  #state: GameState | null = null;
  #botPrng: { next: () => number };
  #activeViewer: PlayerId;
  readonly #humanPlayer: PlayerId;
  readonly #botPlayer: PlayerId;
  readonly #bot: Bot | null;
  readonly #seed: string;
  readonly #catalog: Readonly<Record<string, CardRules>>;
  readonly #decks: Readonly<Record<PlayerId, DeckPayload>> | undefined;
  readonly #fixedDecks: Readonly<Record<PlayerId, Record<EraNo, string[]>>> | undefined;
  readonly #fixedInitiative: PlayerId | undefined;
  readonly #rules: Partial<RulesConfig> | undefined;
  readonly #store: GameStoreApi;
  readonly #onProjectionEmitted: ((notification: ProjectionNotification) => void) | undefined;

  constructor(options: LocalGameControllerOptions) {
    this.mode = options.mode;
    this.#seed = options.seed;
    this.#catalog =
      options.catalog ?? getCatalog(options.decks?.P1.catalogVersion ?? '1.0').rulesById;
    this.#decks = options.decks;
    this.#fixedDecks = options.fixedDecks;
    this.#fixedInitiative = options.fixedInitiative;
    this.#rules = options.rules;
    this.#humanPlayer = options.humanPlayer ?? 'P1';
    this.#botPlayer = getOpponent(this.#humanPlayer);
    this.#activeViewer = this.#humanPlayer;
    this.#botPrng = createSfc32(`${options.seed}:bot-rng`);
    this.#store = options.store ?? useGameStore;
    this.#onProjectionEmitted = options.onProjectionEmitted;

    if (options.mode === 'bot') {
      this.#bot =
        options.bot ??
        createBot(options.botKind ?? 'greedy', {
          catalog: this.#catalog,
        });
    } else {
      this.#bot = null;
    }
  }

  #nextBotRandom = (): number => {
    return this.#botPrng.next();
  };

  #projectAndPublish(
    state: GameState,
    viewer: PlayerId,
    rawEvents: readonly GameEvent[],
    resetLog = false,
  ): PlayerView {
    const view = playerView(state, viewer);
    const projectedEvents = rawEvents
      .map((ev) => projectEvent(ev, viewer))
      .filter((ev): ev is GameEvent => ev !== null);

    this.#store.getState().receiveTransition(view, projectedEvents, {
      resetLog,
    });
    this.#onProjectionEmitted?.({
      viewer,
      view,
      events: projectedEvents,
    });

    return view;
  }

  #advanceBotLoop(initialState: GameState, accumulatedEvents: GameEvent[]): GameState {
    if (this.mode !== 'bot' || this.#bot === null) {
      return initialState;
    }

    let currentState = initialState;
    let steps = 0;

    while (currentState.phase !== 'finished' && steps < MAX_BOT_SAFETY_STEPS) {
      // Il bot riceve esclusivamente la propria PlayerView filtrata, mai GameState (§7.1)
      const botView = playerView(currentState, this.#botPlayer);
      if (!botView.self.legal.canAct) {
        break;
      }

      const botClientCmd = this.#bot.choose(botView, this.#nextBotRandom);
      const fullCmd = toFullCommand(this.#botPlayer, botClientCmd);
      const res = apply(currentState, fullCmd);

      if (!res.ok) {
        throw new Error(
          `Bot "${this.#bot.name}" produced an invalid command (${botClientCmd.type}): ${res.error.code} — ${res.error.message}`,
        );
      }

      currentState = res.value.state;
      accumulatedEvents.push(...res.value.events);
      steps += 1;
    }

    return currentState;
  }

  startMatch(): PlayerView {
    const config: NewGameConfig = {
      seed: this.#seed,
      catalog: { ...this.#catalog },
      ...(this.#decks !== undefined
        ? {
            decks: {
              P1: this.#decks.P1,
              P2: this.#decks.P2,
            },
          }
        : {}),
      ...(this.#fixedDecks !== undefined
        ? {
            fixedDecks: {
              P1: {
                1: [...this.#fixedDecks.P1[1]],
                2: [...this.#fixedDecks.P1[2]],
                3: [...this.#fixedDecks.P1[3]],
              },
              P2: {
                1: [...this.#fixedDecks.P2[1]],
                2: [...this.#fixedDecks.P2[2]],
                3: [...this.#fixedDecks.P2[3]],
              },
            },
          }
        : {}),
      ...(this.#fixedInitiative !== undefined ? { fixedInitiative: this.#fixedInitiative } : {}),
      ...(this.#rules !== undefined ? { rules: this.#rules } : {}),
    };

    const created = createGame(config);
    const rawEvents: GameEvent[] = [...created.events];
    let currentState = created.state;

    this.#store.getState().setMode(this.mode);
    this.#store.getState().setHotSeatHandover(false, null);

    if (this.mode === 'bot') {
      this.#activeViewer = this.#humanPlayer;
      currentState = this.#advanceBotLoop(currentState, rawEvents);
      this.#state = currentState;
      return this.#projectAndPublish(currentState, this.#activeViewer, rawEvents, true);
    }

    // Modalità Hot-Seat: inizia dal primo giocatore attivo nella finestra iniziale
    this.#activeViewer = determineActiveHotSeatPlayer(currentState, 'P1');
    this.#state = currentState;
    return this.#projectAndPublish(currentState, this.#activeViewer, rawEvents, true);
  }

  dispatch(command: ClientCommand): Result<PlayerView, RuleError> {
    if (this.#state === null) {
      const err: RuleError = {
        code: 'INVALID_PHASE',
        message: 'La partita non è ancora stata avviata.',
      };
      this.#store.getState().setLastError(err);
      return { ok: false, error: err };
    }

    const actingPlayer = this.mode === 'bot' ? this.#humanPlayer : this.#activeViewer;
    const fullCmd = toFullCommand(actingPlayer, command);
    const applied = apply(this.#state, fullCmd);

    if (!applied.ok) {
      this.#store.getState().setLastError(applied.error);
      return { ok: false, error: applied.error };
    }

    const rawEvents: GameEvent[] = [...applied.value.events];
    let nextState = applied.value.state;

    if (this.mode === 'bot') {
      nextState = this.#advanceBotLoop(nextState, rawEvents);
      this.#state = nextState;
      const view = this.#projectAndPublish(nextState, this.#humanPlayer, rawEvents, false);
      return { ok: true, value: view };
    }

    // Modalità Hot-Seat: calcola se il controllo passa all'altro giocatore o a una nuova finestra segreta
    const nextSeat = determineActiveHotSeatPlayer(nextState, actingPlayer);
    const requiresHandover = nextState.phase !== 'finished' && nextSeat !== actingPlayer;

    this.#activeViewer = nextSeat;
    this.#state = nextState;

    const view = this.#projectAndPublish(nextState, this.#activeViewer, rawEvents, false);

    if (requiresHandover) {
      this.#store.getState().setHotSeatHandover(true, nextSeat);
    } else {
      this.#store.getState().setHotSeatHandover(false, null);
    }

    return { ok: true, value: view };
  }

  concede(player?: PlayerId): Result<PlayerView, RuleError> {
    if (this.#state === null) {
      const err: RuleError = {
        code: 'INVALID_PHASE',
        message: 'La partita non è ancora stata avviata.',
      };
      this.#store.getState().setLastError(err);
      return { ok: false, error: err };
    }

    const concedingPlayer =
      player ?? (this.mode === 'bot' ? this.#humanPlayer : this.#activeViewer);
    const applied = apply(this.#state, {
      type: 'Concede',
      player: concedingPlayer,
    });

    if (!applied.ok) {
      this.#store.getState().setLastError(applied.error);
      return { ok: false, error: applied.error };
    }

    this.#state = applied.value.state;
    this.#store.getState().setHotSeatHandover(false, null);
    const view = this.#projectAndPublish(
      this.#state,
      this.#activeViewer,
      applied.value.events,
      false,
    );
    return { ok: true, value: view };
  }

  acknowledgeHotSeatHandover(): void {
    this.#store.getState().setHotSeatHandover(false, null);
  }

  getCurrentViewer(): PlayerId {
    return this.#activeViewer;
  }

  getPlayerView(): PlayerView | null {
    return this.#store.getState().view;
  }

  dispose(): void {
    this.#store.getState().clearPlayback();
    this.#store.getState().setHotSeatHandover(false, null);
  }
}
