import { CARDS_RULES } from '@epochs/content';
import {
  apply,
  createGame,
  playerView,
  projectEvent,
  stateHash,
  type Command,
  type GameEvent,
  type GameState,
  type PlayerView,
} from '@epochs/engine';
import type {
  ClientToServerMessage,
  ReplayPayload,
  ReplayPerspective,
  ReplayStep,
  ServerToClientMessage,
} from '../../../../packages/protocol/src/index.js';
import { RemoteGameController, type WebSocketLike } from '../controllers/remote-controller.js';
import { createGameStore } from '../state/game-store.js';
import { createTutorialDecks } from './tutorial-scenario.js';

/** Dati interamente prodotti dal motore; nessuna partita o richiesta HTTP esterna. */
export function createTutorialReplay(perspective: ReplayPerspective): ReplayPayload {
  const created = createGame({
    seed: 'epochs-replay-demo',
    catalog: CARDS_RULES,
    fixedDecks: createTutorialDecks(),
    fixedInitiative: 'P1',
  });
  const view = (state: GameState): PlayerView => {
    const base = playerView(state, perspective === 'P2' ? 'P2' : 'P1');
    if (perspective !== 'public') return base;
    // Questa breve partita finisce per resa nello Sviluppo: nessuna carta viene rivelata.
    return {
      ...base,
      self: {
        ...base.self,
        hand: [],
        buildings: [],
        units: [],
        discard: [],
        resources: { food: 0, wood: 0, metal: 0 },
        legal: {
          phase: state.phase,
          canAct: false,
          canSubmitMulligan: false,
          maxMulliganCards: 0,
          canSubmitDiscard: false,
          mustDiscardCount: 0,
          canPass: false,
          canLockInstants: false,
          playableFieldCardUids: [],
          playableConversionUids: [],
          sacrificableBuildingUids: [],
          playableInstantUids: [],
          handPlayability: {},
        },
      },
    };
  };
  const events = (items: readonly GameEvent[]): GameEvent[] =>
    items
      .map((event) => {
        if (perspective !== 'public') return projectEvent(event, perspective);
        const first = projectEvent(event, 'P1');
        return first === null ? null : projectEvent(first, 'P2');
      })
      .filter((event): event is GameEvent => event !== null);
  const commands: Command[] = [
    { type: 'SubmitMulligan', player: 'P1', cardUids: [] },
    { type: 'SubmitMulligan', player: 'P2', cardUids: [] },
    { type: 'Concede', player: 'P1' },
  ];
  let state = created.state;
  const steps: ReplayStep[] = [];
  for (const command of commands) {
    const before = state.stateVersion;
    const result = apply(state, command);
    if (!result.ok) throw new Error(result.error.message);
    state = result.value.state;
    const { player, ...clientCommand } = command;
    steps.push({
      idx: steps.length,
      commandId: `tutorial-${steps.length}`,
      player,
      command: clientCommand,
      expectedStateVersion: before,
      resultingStateVersion: state.stateVersion,
      stateHash: stateHash(state),
      events: events(result.value.events),
      view: view(state),
    });
  }
  return {
    gameId: 'tutorial-local',
    perspective,
    rules: state.rules,
    result: state.result!,
    initialView: view(created.state),
    initialEvents: events(created.events),
    steps,
  };
}

export type OnlineDemoEvent =
  'connected' | 'quick' | 'room' | 'error' | 'joined' | 'disconnected' | 'reconnected';

class DemoSocket implements WebSocketLike {
  readyState = 0;
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  readonly timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(
    readonly report: (event: OnlineDemoEvent) => void,
    readonly reconnected: boolean,
  ) {
    this.schedule(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  schedule(callback: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.readyState !== 3) callback();
    }, 20);
    this.timers.add(timer);
  }
  emit(message: ServerToClientMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  send(data: string): void {
    const message = JSON.parse(data) as ClientToServerMessage;
    this.schedule(() => {
      if (message.type === 'hello') {
        this.emit({
          type: 'welcome',
          token: 'tutorial-only',
          serverTime: Date.now(),
          playerId: 'tutorial-player',
          nickname: 'Ospite dimostrativo',
        });
        this.report(this.reconnected ? 'reconnected' : 'connected');
      } else if (message.type === 'room.create') {
        this.emit({ type: 'room.created', roomCode: 'EPOCH' });
        this.report('room');
      } else if (message.type === 'queue.join' && message.mode === 'quick') {
        this.report('quick');
      } else if (message.type === 'queue.join') {
        if (message.roomCode === 'EPOCH') {
          this.emit({ type: 'room.created', roomCode: 'EPOCH' });
          this.report('joined');
        } else {
          this.emit({
            type: 'game.error',
            code: 'MATCH_NOT_ACCESSIBLE',
            message: 'Demo locale: stanza non trovata. Prova il codice EPOCH.',
            retryable: false,
          });
          this.report('error');
        }
      }
    });
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.onclose?.({ code: 1000 });
  }
}

/** Il trasporto sostituisce soltanto la rete; controller e schermata sono quelli reali. */
export function createOnlineTutorialDemo(report: (event: OnlineDemoEvent) => void) {
  let socket: DemoSocket | null = null;
  let authenticated = false;
  const controllers: RemoteGameController[] = [];
  const store = createGameStore();
  const createController = (): RemoteGameController => {
    const controller = new RemoteGameController({
      wsUrl: 'ws://tutorial.invalid/ws',
      initialToken: 'tutorial-only',
      tokenStorageKey: 'epochs_tutorial_guest_token',
      autoReconnect: false,
      store,
      webSocketFactory: () => {
        socket = new DemoSocket((event) => {
          if (event === 'connected' || event === 'reconnected') authenticated = true;
          report(event);
        }, authenticated);
        return socket;
      },
    });
    controllers.push(controller);
    return controller;
  };
  return {
    createController,
    disconnect: () => {
      socket?.close();
      report('disconnected');
    },
    dispose: () => {
      for (const controller of controllers) controller.dispose();
      store.getState().resetStore();
    },
  };
}
