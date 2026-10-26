// TECH-SPEC §6.1–6.4 — Attore GameRoom: coda sequenziale per partita, concorrenza ottimistica
// su expectedStateVersion, idempotenza su commandId, isolamento delle seat e gestione timer.

import {
  PLAYERS_ORDER,
  apply,
  canonicalizeJson,
  playerView,
  projectEvent,
  stateHash,
  type ClientCommand,
  type Command,
  type GameEvent,
  type GameState,
  type Phase,
  type PlayerId,
  type PlayerView,
} from '@epochs/engine';
import {
  createGameErrorMessage,
  type GameDeadlineMessage,
  type GameEndedMessage,
  type GameErrorMessage,
  type GameEventsMessage,
  type GameSnapshotMessage,
  type MatchFoundMessage,
  type ServerToClientMessage,
} from '@epochs/protocol';
import type {
  GameCommandLogRecord,
  GameRepository,
  GameStatus,
} from '../db/repository.js';

export const DEFAULT_DISCONNECT_GRACE_MS = 60_000;

export interface RoomClientSink {
  readonly playerId: string;
  send(message: ServerToClientMessage): void;
}

export interface GameRoomOptions {
  readonly gameId: string;
  readonly p1Id: string;
  readonly p2Id: string;
  readonly initialState: GameState;
  readonly repository: GameRepository;
  readonly roomCode?: string;
  readonly initialCommandIdx?: number;
  readonly clock?: () => number;
  readonly disconnectGraceMs?: number;
  readonly enableTimers?: boolean;
  readonly onGameFinished?: (gameId: string) => void;
}

export interface HandleCommandInput {
  readonly playerId: string;
  readonly commandId: string;
  readonly expectedStateVersion: number;
  readonly command: ClientCommand;
  readonly replySink?: RoomClientSink;
}

export type HandleCommandOutcome =
  | {
      readonly ok: true;
      readonly idempotentRetry: boolean;
      readonly stateVersion: number;
      readonly eventsBySeat: Readonly<Record<PlayerId, GameEvent[]>>;
    }
  | {
      readonly ok: false;
      readonly error: GameErrorMessage;
    };

interface CachedCommandResult {
  readonly commandId: string;
  readonly player: PlayerId;
  readonly commandJson: string;
  readonly resultingVersion: number;
  readonly fromNBySeat: Readonly<Record<PlayerId, number>>;
  readonly eventsBySeat: Readonly<Record<PlayerId, GameEvent[]>>;
}

export class GameRoom {
  public readonly gameId: string;
  public readonly p1Id: string;
  public readonly p2Id: string;
  public readonly roomCode: string | undefined;

  private state: GameState;
  private commandIdx: number;
  private readonly repository: GameRepository;
  private readonly clock: () => number;
  private readonly disconnectGraceMs: number;
  private readonly enableTimers: boolean;
  private readonly onGameFinished: ((gameId: string) => void) | undefined;

  private readonly clients: Partial<Record<PlayerId, RoomClientSink>> = {};
  private readonly disconnectTimers: Partial<
    Record<PlayerId, ReturnType<typeof setTimeout>>
  > = {};
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private windowTimerToken = 0;
  private currentDeadline: number | null = null;
  private sysCommandCounter = 0;
  private disposed = false;

  private readonly processedCommands = new Map<string, CachedCommandResult>();
  private queue: Promise<void> = Promise.resolve();

  public constructor(options: GameRoomOptions) {
    this.gameId = options.gameId;
    this.p1Id = options.p1Id;
    this.p2Id = options.p2Id;
    this.roomCode = options.roomCode;
    this.state = options.initialState;
    this.repository = options.repository;
    this.clock = options.clock ?? (() => Date.now());
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.enableTimers = options.enableTimers ?? true;
    this.onGameFinished = options.onGameFinished;

    if (options.initialCommandIdx !== undefined) {
      this.commandIdx = options.initialCommandIdx;
    } else {
      const existing = this.repository.listCommandsByGame(this.gameId);
      this.commandIdx = existing.length;
    }

    this.scheduleWindowTimer();
  }

  /**
   * Restituisce la seat ('P1' | 'P2') associata al `playerId` autenticato, oppure `null` se estraneo.
   */
  public resolveSeat(playerId: string): PlayerId | null {
    if (playerId === this.p1Id) {
      return 'P1';
    }
    if (playerId === this.p2Id) {
      return 'P2';
    }
    return null;
  }

  public getPlayerIdForSeat(seat: PlayerId): string {
    return seat === 'P1' ? this.p1Id : this.p2Id;
  }

  public getStateVersion(): number {
    return this.state.stateVersion;
  }

  public getEventN(): number {
    return this.state.counters.event;
  }

  public getPhase(): Phase {
    return this.state.phase;
  }

  public isFinished(): boolean {
    return this.state.phase === 'finished';
  }

  public getCurrentDeadline(): number | null {
    return this.currentDeadline;
  }

  /**
   * Restituisce la `PlayerView` strettamente filtrata per la seat indicata,
   * arricchita con il `deadline` autoritativo del server.
   */
  public getViewForSeat(seat: PlayerId): PlayerView {
    const view = playerView(this.state, seat);
    view.deadline = this.currentDeadline;
    return view;
  }

  /**
   * Collega un client WebSocket alla propria seat ('P1' o 'P2') e annulla eventuale grace timer di disconnessione.
   * Rifiuta gli utenti non appartenenti alla partita con `MATCH_NOT_ACCESSIBLE`.
   */
  public attachClient(
    playerId: string,
    sink: RoomClientSink,
    options: { sendMatchFound?: boolean; sendSnapshot?: boolean } = {},
  ): PlayerId | null {
    const seat = this.resolveSeat(playerId);
    if (seat === null) {
      sink.send(createGameErrorMessage('MATCH_NOT_ACCESSIBLE'));
      return null;
    }

    this.clearDisconnectTimer(seat);
    this.clients[seat] = sink;

    if (options.sendMatchFound) {
      const matchFoundMsg: MatchFoundMessage = {
        type: 'match.found',
        gameId: this.gameId,
        me: seat,
        rules: structuredClone(this.state.rules),
        ...(this.roomCode !== undefined ? { roomCode: this.roomCode } : {}),
      };
      sink.send(matchFoundMsg);
    }

    if (options.sendSnapshot !== false) {
      sink.send(this.buildSnapshotMessage(seat));
      if (this.currentDeadline !== null && !this.isFinished()) {
        sink.send(this.buildDeadlineMessage(this.currentDeadline));
      }
    }

    return seat;
  }

  /**
   * Scollega il client dalla seat e, se la partita è ancora attiva, avvia il grace period di disconnessione (60s default).
   */
  public detachClient(playerId: string, sink?: RoomClientSink): void {
    const seat = this.resolveSeat(playerId);
    if (seat === null) {
      return;
    }

    const currentSink = this.clients[seat];
    if (sink !== undefined && currentSink !== undefined && currentSink !== sink) {
      return;
    }

    delete this.clients[seat];

    if (!this.isFinished() && !this.disposed && this.enableTimers) {
      this.clearDisconnectTimer(seat);
      this.disconnectTimers[seat] = setTimeout(() => {
        delete this.disconnectTimers[seat];
        void this.handleDisconnectGraceExpired(seat);
      }, this.disconnectGraceMs);
    }
  }

  /**
   * Gestisce la richiesta `game.resync` inviando `game.snapshot` (e `game.deadline` se attivo)
   * esclusivamente se il richiedente è P1 o P2 della partita.
   */
  public handleResync(
    playerId: string,
    _lastEventN: number,
    replySink?: RoomClientSink,
  ): Promise<boolean> {
    return this.enqueue(() => {
      const seat = this.resolveSeat(playerId);
      const targetSink = replySink ?? (seat !== null ? this.clients[seat] : undefined);

      if (seat === null) {
        targetSink?.send(createGameErrorMessage('MATCH_NOT_ACCESSIBLE'));
        return false;
      }

      if (replySink !== undefined) {
        this.clearDisconnectTimer(seat);
        this.clients[seat] = replySink;
      }

      const sink = this.clients[seat];
      if (sink !== undefined) {
        sink.send(this.buildSnapshotMessage(seat));
        if (this.currentDeadline !== null && !this.isFinished()) {
          sink.send(this.buildDeadlineMessage(this.currentDeadline));
        }
      }
      return true;
    });
  }

  /**
   * Accoda ed elabora in sequenza un comando client garantendo:
   * 1. Isolamento della seat (`MATCH_NOT_ACCESSIBLE` per estranei);
   * 2. Idempotenza su `commandId` (stesso payload -> esito confermato; payload diverso -> `IDEMPOTENCY_KEY_REUSED`);
   * 3. Concorrenza ottimistica su `expectedStateVersion` (`STALE_STATE_VERSION` `retryable: true` + invio `game.snapshot`);
   * 4. Validazione ed esecuzione pura tramite `apply`, persistenza atomica su `GameRepository` e proiezione anti-leak.
   */
  public handleCommand(input: HandleCommandInput): Promise<HandleCommandOutcome> {
    return this.enqueue(() => this.processCommandInternal(input));
  }

  /**
   * Ferma tutti i timer attivi (usato in chiusura stanza o shutdown del server).
   */
  public dispose(): void {
    this.disposed = true;
    this.clearWindowTimer();
    this.clearDisconnectTimer('P1');
    this.clearDisconnectTimer('P2');
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private processCommandInternal(
    input: HandleCommandInput,
  ): HandleCommandOutcome {
    const seat = this.resolveSeat(input.playerId);
    const callerSink =
      input.replySink ?? (seat !== null ? this.clients[seat] : undefined);

    if (seat === null) {
      const error = createGameErrorMessage(
        'MATCH_NOT_ACCESSIBLE',
        undefined,
        input.commandId,
      );
      callerSink?.send(error);
      return { ok: false, error };
    }

    const incomingCommandJson = canonicalizeJson(input.command);

    // 1. Verifica idempotenza su commandId (in memoria o dal repository DB)
    const cached = this.processedCommands.get(input.commandId);
    if (cached !== undefined) {
      if (
        cached.player !== seat ||
        cached.commandJson !== incomingCommandJson
      ) {
        const error = createGameErrorMessage(
          'IDEMPOTENCY_KEY_REUSED',
          undefined,
          input.commandId,
        );
        callerSink?.send(error);
        return { ok: false, error };
      }

      // Retry idempotente confermato: restituisce l'esito senza rieseguire il comando
      const replayMsg: GameEventsMessage = {
        type: 'game.events',
        gameId: this.gameId,
        stateVersion: this.state.stateVersion,
        fromN: cached.fromNBySeat[seat],
        events: cached.eventsBySeat[seat].map((ev) => structuredClone(ev)),
        view: this.getViewForSeat(seat),
      };
      callerSink?.send(replayMsg);

      return {
        ok: true,
        idempotentRetry: true,
        stateVersion: cached.resultingVersion,
        eventsBySeat: cached.eventsBySeat,
      };
    }

    const dbExisting = this.repository.getCommandByCommandId(
      this.gameId,
      input.commandId,
    );
    if (dbExisting !== null) {
      const dbCommandJson = canonicalizeJson(dbExisting.command);
      if (dbExisting.player !== seat || dbCommandJson !== incomingCommandJson) {
        const error = createGameErrorMessage(
          'IDEMPOTENCY_KEY_REUSED',
          undefined,
          input.commandId,
        );
        callerSink?.send(error);
        return { ok: false, error };
      }

      const emptyBySeat: Record<PlayerId, GameEvent[]> = { P1: [], P2: [] };
      const replayMsg: GameEventsMessage = {
        type: 'game.events',
        gameId: this.gameId,
        stateVersion: this.state.stateVersion,
        fromN: this.state.counters.event,
        events: [],
        view: this.getViewForSeat(seat),
      };
      callerSink?.send(replayMsg);

      return {
        ok: true,
        idempotentRetry: true,
        stateVersion: dbExisting.resultingVersion,
        eventsBySeat: emptyBySeat,
      };
    }

    // 2. Controllo concorrenza ottimistica expectedStateVersion
    if (input.expectedStateVersion !== this.state.stateVersion) {
      const error = createGameErrorMessage(
        'STALE_STATE_VERSION',
        undefined,
        input.commandId,
      );
      callerSink?.send(error);
      callerSink?.send(this.buildSnapshotMessage(seat));
      return { ok: false, error };
    }

    // 3. Costruzione del comando autoritativo con player derivato dal server
    const engineCommand: Command = {
      ...input.command,
      player: seat,
    };

    return this.applyAndPersistCommand(
      seat,
      input.commandId,
      input.command,
      engineCommand,
      callerSink,
    );
  }

  private applyAndPersistCommand(
    seat: PlayerId,
    commandId: string,
    clientCommand: ClientCommand,
    engineCommand: Command,
    callerSink?: RoomClientSink,
  ): HandleCommandOutcome {
    const expectedVersion = this.state.stateVersion;
    const prevPhase = this.state.phase;
    const prevEra = this.state.era;
    const prevCycle = this.state.cycle;
    const prevToAct = this.state.toAct;

    const transition = apply(this.state, engineCommand);
    if (!transition.ok) {
      const error = createGameErrorMessage(
        transition.error.code,
        transition.error.message,
        commandId,
      );
      callerSink?.send(error);
      return { ok: false, error };
    }

    const nextState = transition.value.state;
    const rawEvents = transition.value.events;
    const nextHash = stateHash(nextState);
    const nextStatus: GameStatus =
      nextState.phase === 'finished' ? 'FINISHED' : 'ACTIVE';
    const now = this.clock();
    const idx = this.commandIdx++;

    const logRecord: GameCommandLogRecord = {
      gameId: this.gameId,
      idx,
      commandId,
      player: seat,
      expectedVersion,
      resultingVersion: nextState.stateVersion,
      command: clientCommand,
      stateHash: nextHash,
      createdAt: now,
    };

    this.repository.saveTransition(
      {
        gameId: this.gameId,
        status: nextStatus,
        stateVersion: nextState.stateVersion,
        eventN: nextState.counters.event,
        state: nextState,
        stateHash: nextHash,
        result: nextState.result,
        updatedAt: now,
      },
      logRecord,
    );

    this.state = nextState;

    // Aggiorna i timer se la finestra è cambiata o siamo in development / finished
    const windowChanged =
      nextState.phase === 'finished' ||
      nextState.phase === 'development' ||
      nextState.phase !== prevPhase ||
      nextState.era !== prevEra ||
      nextState.cycle !== prevCycle ||
      nextState.toAct !== prevToAct;

    if (windowChanged) {
      this.scheduleWindowTimer();
    }

    const eventsBySeat: Record<PlayerId, GameEvent[]> = {
      P1: [],
      P2: [],
    };
    const fromNBySeat: Record<PlayerId, number> = {
      P1: nextState.counters.event,
      P2: nextState.counters.event,
    };

    for (const targetSeat of PLAYERS_ORDER) {
      const projected = rawEvents
        .map((ev) => projectEvent(ev, targetSeat))
        .filter((ev): ev is GameEvent => ev !== null);
      eventsBySeat[targetSeat] = projected;
      fromNBySeat[targetSeat] =
        projected.length > 0 ? projected[0]!.n : nextState.counters.event;
    }

    this.processedCommands.set(commandId, {
      commandId,
      player: seat,
      commandJson: canonicalizeJson(clientCommand),
      resultingVersion: nextState.stateVersion,
      fromNBySeat,
      eventsBySeat,
    });

    // Notifica ciascun client con la rispettiva PlayerView ed eventi proiettati
    for (const targetSeat of PLAYERS_ORDER) {
      const sink = this.clients[targetSeat];
      if (sink === undefined) {
        continue;
      }

      const view = this.getViewForSeat(targetSeat);
      const eventsMsg: GameEventsMessage = {
        type: 'game.events',
        gameId: this.gameId,
        stateVersion: nextState.stateVersion,
        fromN: fromNBySeat[targetSeat],
        events: eventsBySeat[targetSeat],
        view,
      };
      sink.send(eventsMsg);

      if (windowChanged && this.currentDeadline !== null && !this.isFinished()) {
        sink.send(this.buildDeadlineMessage(this.currentDeadline));
      }

      if (this.isFinished() && nextState.result !== null) {
        const endedMsg: GameEndedMessage = {
          type: 'game.ended',
          gameId: this.gameId,
          result: structuredClone(nextState.result),
          view,
        };
        sink.send(endedMsg);
      }
    }

    if (this.isFinished()) {
      this.dispose();
      this.onGameFinished?.(this.gameId);
    }

    return {
      ok: true,
      idempotentRetry: false,
      stateVersion: nextState.stateVersion,
      eventsBySeat,
    };
  }

  private scheduleWindowTimer(): void {
    this.clearWindowTimer();

    if (this.isFinished() || this.disposed) {
      this.currentDeadline = null;
      return;
    }

    const durationSeconds = this.getWindowDurationSeconds(this.state.phase);
    const durationMs = Math.max(1, durationSeconds * 1000);
    const now = this.clock();
    this.currentDeadline = now + durationMs;

    if (!this.enableTimers) {
      return;
    }

    const scheduledPhase = this.state.phase;
    const scheduledEra = this.state.era;
    const timerToken = ++this.windowTimerToken;

    this.windowTimer = setTimeout(() => {
      this.windowTimer = null;
      void this.handleWindowTimeoutExpired(
        scheduledPhase,
        scheduledEra,
        timerToken,
      );
    }, durationMs);
  }

  private getWindowDurationSeconds(phase: Phase): number {
    const secs = this.state.rules.timeoutPolicy.seconds;
    switch (phase) {
      case 'mulligan':
        return secs.mulligan;
      case 'hand_limit':
        return secs.handLimit;
      case 'development':
        return secs.development;
      case 'prebattle':
        return secs.prebattle;
      case 'finished':
        return 0;
    }
  }

  private handleWindowTimeoutExpired(
    expectedPhase: Phase,
    expectedEra: number,
    expectedToken: number,
  ): Promise<void> {
    return this.enqueue(() => {
      if (
        this.disposed ||
        this.isFinished() ||
        expectedToken !== this.windowTimerToken ||
        this.state.phase !== expectedPhase ||
        this.state.era !== expectedEra
      ) {
        return;
      }

      const pendingSeats = this.getSeatsAwaitingAction();
      for (const seat of pendingSeats) {
        if (this.isFinished() || this.state.phase !== expectedPhase) {
          break;
        }
        const cmdId = `sys_timeout_${this.gameId}_v${this.state.stateVersion}_${seat}_${++this.sysCommandCounter}`;
        this.applyAndPersistCommand(
          seat,
          cmdId,
          { type: 'ApplyTimeout' },
          { type: 'ApplyTimeout', player: seat },
        );
      }
    });
  }

  private handleDisconnectGraceExpired(seat: PlayerId): Promise<void> {
    return this.enqueue(() => {
      if (
        this.disposed ||
        this.isFinished() ||
        this.clients[seat] !== undefined
      ) {
        return;
      }

      const cmdId = `sys_disconnect_concede_${this.gameId}_v${this.state.stateVersion}_${seat}_${++this.sysCommandCounter}`;
      this.applyAndPersistCommand(
        seat,
        cmdId,
        { type: 'Concede' },
        { type: 'Concede', player: seat },
      );
    });
  }

  private getSeatsAwaitingAction(): PlayerId[] {
    switch (this.state.phase) {
      case 'mulligan':
        return PLAYERS_ORDER.filter(
          (p) =>
            this.state.pending[p] === undefined &&
            !this.state.players[p].mulliganDone,
        );
      case 'hand_limit':
        return PLAYERS_ORDER.filter(
          (p) =>
            this.state.pending[p] === undefined &&
            this.state.players[p].hand.length > 10,
        );
      case 'development':
        return this.state.toAct !== null ? [this.state.toAct] : [];
      case 'prebattle':
        return PLAYERS_ORDER.filter(
          (p) => this.state.pending[p] === undefined,
        );
      case 'finished':
        return [];
    }
  }

  private buildSnapshotMessage(seat: PlayerId): GameSnapshotMessage {
    return {
      type: 'game.snapshot',
      gameId: this.gameId,
      stateVersion: this.state.stateVersion,
      eventN: this.state.counters.event,
      view: this.getViewForSeat(seat),
    };
  }

  private buildDeadlineMessage(deadline: number): GameDeadlineMessage {
    return {
      type: 'game.deadline',
      phase: this.state.phase,
      deadline,
      serverTime: this.clock(),
    };
  }

  private clearWindowTimer(): void {
    if (this.windowTimer !== null) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
  }

  private clearDisconnectTimer(seat: PlayerId): void {
    const timer = this.disconnectTimers[seat];
    if (timer !== undefined) {
      clearTimeout(timer);
      delete this.disconnectTimers[seat];
    }
  }
}
