// TECH-SPEC §6.2–6.4, §9.8 — RemoteGameController:
// - Gestione token ospite (persistito in localStorage) e handshake hello/welcome
// - Generazione commandId univoci e invio expectedStateVersion
// - Riallineamento automatico su STALE_STATE_VERSION
// - Calcolo offset serverTime per la barra del conto alla rovescia deadline
// - Riconnessione automatica con game.resync { gameId, lastEventN }

import type {
  ClientCommand,
  DeckPayload,
  Phase,
  PlayerId,
  PlayerView,
  Result,
  RuleError,
  RulesConfig,
} from '@epochs/engine';
import {
  ReplayPayloadSchema,
  parseServerMessage,
  type ClientToServerMessage,
  type GameErrorMessage,
  type ReplayPayload,
  type ReplayPerspective,
  type ServerToClientMessage,
} from '../../../../packages/protocol/src/index.js';
import { useGameStore, type GameStoreApi } from '../state/game-store.js';
import type { GameController } from './types.js';

export const DEFAULT_GUEST_TOKEN_STORAGE_KEY = 'epochs_guest_token';
export const LAST_FINISHED_GAME_STORAGE_KEY = 'epochs_last_finished_game_id';
export const CLIENT_PROTOCOL_VERSION = '1.0.0';

export type RemoteConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'authenticated'
  | 'reconnecting';

export type OnlineLobbyStatus =
  | 'idle'
  | 'searching_quick'
  | 'creating_room'
  | 'waiting_room'
  | 'joining_room'
  | 'in_match';

export interface RemoteControllerSnapshot {
  readonly connectionStatus: RemoteConnectionStatus;
  readonly lobbyStatus: OnlineLobbyStatus;
  readonly playerId: string | null;
  readonly nickname: string | null;
  readonly roomCode: string | null;
  readonly gameId: string | null;
  readonly seat: PlayerId | null;
  readonly stateVersion: number;
  readonly lastEventN: number;
  readonly serverTimeOffsetMs: number;
  readonly deadlineEpochMs: number | null;
  readonly deadlinePhase: Phase | null;
  readonly lastError: GameErrorMessage | null;
}

export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface RemoteGameControllerOptions {
  readonly wsUrl?: string | undefined;
  readonly httpBaseUrl?: string | undefined;
  readonly tokenStorageKey?: string | undefined;
  readonly initialToken?: string | undefined;
  readonly store?: GameStoreApi | undefined;
  readonly clock?: (() => number) | undefined;
  readonly webSocketFactory?: WebSocketFactory | undefined;
  readonly autoReconnect?: boolean | undefined;
  readonly reconnectDelayMs?: number | undefined;
  readonly onStateChange?: ((snapshot: RemoteControllerSnapshot) => void) | undefined;
  readonly onMatchFound?: ((info: {
    gameId: string;
    me: PlayerId;
    rules: RulesConfig;
    roomCode?: string;
  }) => void) | undefined;
  readonly onGameEnded?: ((info: {
    gameId: string;
    view: PlayerView;
  }) => void) | undefined;
}

function getDefaultWsUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const envWs = (import.meta as unknown as { env?: Record<string, string> })
      .env?.['VITE_SERVER_WS_URL'];
    if (typeof envWs === 'string' && envWs.trim().length > 0) {
      return envWs.trim();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    const port = '3000';
    return `${protocol}//${host}:${port}/ws`;
  }
  return 'ws://127.0.0.1:3000/ws';
}

function getDefaultHttpBaseUrl(wsUrl: string): string {
  if (typeof window !== 'undefined') {
    const envHttp = (import.meta as unknown as { env?: Record<string, string> })
      .env?.['VITE_SERVER_HTTP_URL'];
    if (typeof envHttp === 'string' && envHttp.trim().length > 0) {
      return envHttp.trim().replace(/\/+$/, '');
    }
  }
  try {
    const parsed = new URL(wsUrl);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsed.host}`;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

function readLocalStorageSafe(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignora errori di accesso storage in ambienti ristretti
  }
  return null;
}

function writeLocalStorageSafe(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignora errori di scrittura storage
  }
}

function generateCommandId(prefix: string, counter: number): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${counter}`;
}

export class RemoteGameController implements GameController {
  public readonly mode = 'remote' as const;

  readonly #wsUrl: string;
  readonly #httpBaseUrl: string;
  readonly #tokenStorageKey: string;
  readonly #store: GameStoreApi;
  readonly #clock: () => number;
  readonly #webSocketFactory: WebSocketFactory;
  readonly #autoReconnect: boolean;
  readonly #reconnectDelayMs: number;
  readonly #listeners = new Set<(snapshot: RemoteControllerSnapshot) => void>();
  readonly #onMatchFound: RemoteGameControllerOptions['onMatchFound'];
  readonly #onGameEnded: RemoteGameControllerOptions['onGameEnded'];

  #socket: WebSocketLike | null = null;
  #connectionStatus: RemoteConnectionStatus = 'disconnected';
  #lobbyStatus: OnlineLobbyStatus = 'idle';
  #token: string | null;
  #playerId: string | null = null;
  #nickname: string | null = null;
  #roomCode: string | null = null;
  #gameId: string | null = null;
  #seat: PlayerId | null = null;
  #stateVersion = 0;
  #lastEventN = 0;
  #serverTimeOffsetMs = 0;
  #deadlineEpochMs: number | null = null;
  #deadlinePhase: Phase | null = null;
  #lastError: GameErrorMessage | null = null;
  #hasReceivedSnapshotForGame = false;
  #commandCounter = 0;
  #disposed = false;
  #manualDisconnect = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly #inFlightCommands = new Map<
    string,
    {
      command: ClientCommand;
      retriedOnStale: boolean;
    }
  >();
  #awaitingStaleResyncCommandId: string | null = null;
  #welcomeWaiters: Array<{
    resolve: (snapshot: RemoteControllerSnapshot) => void;
    reject: (err: Error) => void;
  }> = [];

  public constructor(options: RemoteGameControllerOptions = {}) {
    this.#wsUrl = options.wsUrl ?? getDefaultWsUrl();
    this.#httpBaseUrl =
      options.httpBaseUrl ?? getDefaultHttpBaseUrl(this.#wsUrl);
    this.#tokenStorageKey =
      options.tokenStorageKey ?? DEFAULT_GUEST_TOKEN_STORAGE_KEY;
    this.#token =
      options.initialToken ?? readLocalStorageSafe(this.#tokenStorageKey);
    this.#store = options.store ?? useGameStore;
    this.#clock = options.clock ?? (() => Date.now());
    this.#webSocketFactory =
      options.webSocketFactory ??
      ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    this.#autoReconnect = options.autoReconnect ?? true;
    this.#reconnectDelayMs = options.reconnectDelayMs ?? 300;
    this.#onMatchFound = options.onMatchFound;
    this.#onGameEnded = options.onGameEnded;

    if (options.onStateChange) {
      this.#listeners.add(options.onStateChange);
    }

    if (typeof window !== 'undefined') {
      (
        window as unknown as {
          __epochsRemoteController?: RemoteGameController;
        }
      ).__epochsRemoteController = this;
    }
  }

  public getHttpBaseUrl(): string {
    return this.#httpBaseUrl;
  }

  public getWsUrl(): string {
    return this.#wsUrl;
  }

  public getGuestToken(): string | null {
    return this.#token;
  }

  public getGameId(): string | null {
    return this.#gameId;
  }

  public getRoomCode(): string | null {
    return this.#roomCode;
  }

  public getServerTimeOffsetMs(): number {
    return this.#serverTimeOffsetMs;
  }

  /**
   * Calcola l'istante corrente stimato sul server sommandovi l'offset rilevato (`serverTime - clientTime`).
   */
  public getEstimatedServerNow(): number {
    return this.#clock() + this.#serverTimeOffsetMs;
  }

  /**
   * Restituisce i millisecondi residui alla `deadline` autoritativa del server per la finestra attiva (§6.3).
   */
  public getRemainingDeadlineMs(): number | null {
    const deadline =
      this.#deadlineEpochMs ?? this.#store.getState().view?.deadline ?? null;
    if (deadline === null) {
      return null;
    }
    return Math.max(0, deadline - this.getEstimatedServerNow());
  }

  public getSnapshot(): RemoteControllerSnapshot {
    return {
      connectionStatus: this.#connectionStatus,
      lobbyStatus: this.#lobbyStatus,
      playerId: this.#playerId,
      nickname: this.#nickname,
      roomCode: this.#roomCode,
      gameId: this.#gameId,
      seat: this.#seat,
      stateVersion: this.#stateVersion,
      lastEventN: this.#lastEventN,
      serverTimeOffsetMs: this.#serverTimeOffsetMs,
      deadlineEpochMs: this.#deadlineEpochMs,
      deadlinePhase: this.#deadlinePhase,
      lastError: this.#lastError,
    };
  }

  public subscribe(
    listener: (snapshot: RemoteControllerSnapshot) => void,
  ): () => void {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notifyListeners(): void {
    const snap = this.getSnapshot();
    for (const listener of this.#listeners) {
      listener(snap);
    }
  }

  /**
   * Apre la connessione WebSocket (se non già aperta) ed esegue l'handshake `hello` -> `welcome`.
   */
  public connect(): Promise<RemoteControllerSnapshot> {
    if (this.#disposed) {
      return Promise.reject(
        new Error('RemoteGameController è stato disposto.'),
      );
    }

    if (
      this.#socket !== null &&
      this.#socket.readyState === 1 &&
      this.#connectionStatus === 'authenticated'
    ) {
      return Promise.resolve(this.getSnapshot());
    }

    this.#manualDisconnect = false;
    this.#clearReconnectTimer();

    return new Promise<RemoteControllerSnapshot>((resolve, reject) => {
      this.#welcomeWaiters.push({ resolve, reject });

      if (
        this.#socket !== null &&
        (this.#socket.readyState === 0 || this.#socket.readyState === 1)
      ) {
        return;
      }

      this.#openSocketInternal(false);
    });
  }

  #openSocketInternal(isReconnect: boolean): void {
    this.#connectionStatus = isReconnect ? 'reconnecting' : 'connecting';
    this.#notifyListeners();

    const socket = this.#webSocketFactory(this.#wsUrl);
    this.#socket = socket;

    socket.onopen = () => {
      if (this.#socket !== socket || this.#disposed) {
        return;
      }
      this.#connectionStatus = 'authenticating';
      this.#notifyListeners();

      const helloMsg: ClientToServerMessage = {
        type: 'hello',
        clientVersion: CLIENT_PROTOCOL_VERSION,
        ...(this.#token !== null && this.#token.trim().length > 0
          ? { token: this.#token }
          : {}),
      };
      this.#sendMessage(helloMsg);
    };

    socket.onmessage = (event: { data: unknown }) => {
      if (this.#socket !== socket || this.#disposed) {
        return;
      }
      const rawText =
        typeof event.data === 'string' ? event.data : String(event.data);
      const parsed = parseServerMessage(rawText);
      if (!parsed.ok) {
        return;
      }
      this.#handleServerMessage(parsed.value);
    };

    socket.onerror = () => {
      // Gestito in onclose per eventuale riconnessione
    };

    socket.onclose = () => {
      if (this.#socket !== socket) {
        return;
      }
      this.#socket = null;
      this.#connectionStatus = 'disconnected';
      this.#notifyListeners();

      if (
        !this.#disposed &&
        !this.#manualDisconnect &&
        this.#autoReconnect &&
        this.#gameId !== null &&
        this.#store.getState().view?.phase !== 'finished'
      ) {
        this.#scheduleReconnect();
      } else if (this.#welcomeWaiters.length > 0) {
        const waiters = this.#welcomeWaiters.splice(
          0,
          this.#welcomeWaiters.length,
        );
        for (const w of waiters) {
          w.reject(new Error('Connessione WebSocket chiusa prima di welcome.'));
        }
      }
    };
  }

  #scheduleReconnect(): void {
    this.#clearReconnectTimer();
    this.#connectionStatus = 'reconnecting';
    this.#notifyListeners();

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (!this.#disposed && !this.#manualDisconnect) {
        this.#openSocketInternal(true);
      }
    }, this.#reconnectDelayMs);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #sendMessage(message: ClientToServerMessage): boolean {
    if (this.#socket === null || this.#socket.readyState !== 1) {
      return false;
    }
    this.#socket.send(JSON.stringify(message));
    return true;
  }

  #handleServerMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case 'welcome': {
        this.#token = msg.token;
        this.#playerId = msg.playerId;
        this.#nickname = msg.nickname;
        this.#serverTimeOffsetMs = msg.serverTime - this.#clock();
        this.#connectionStatus = 'authenticated';
        writeLocalStorageSafe(this.#tokenStorageKey, msg.token);

        const waiters = this.#welcomeWaiters.splice(
          0,
          this.#welcomeWaiters.length,
        );
        for (const w of waiters) {
          w.resolve(this.getSnapshot());
        }

        // Se eravamo in una partita attiva (es. dopo riconnessione), invia automaticamente game.resync (§6.4)
        if (this.#gameId !== null) {
          this.requestResync(this.#gameId, this.#lastEventN);
        }

        this.#notifyListeners();
        return;
      }

      case 'room.created': {
        this.#roomCode = msg.roomCode;
        this.#lobbyStatus = 'waiting_room';
        this.#lastError = null;
        this.#notifyListeners();
        return;
      }

      case 'match.found': {
        this.#gameId = msg.gameId;
        this.#seat = msg.me;
        if (msg.roomCode !== undefined) {
          this.#roomCode = msg.roomCode;
        }
        this.#lobbyStatus = 'in_match';
        this.#hasReceivedSnapshotForGame = false;
        this.#lastError = null;

        this.#store.getState().setMode('remote');
        this.#store.getState().setHotSeatHandover(false, null);

        this.#onMatchFound?.({
          gameId: msg.gameId,
          me: msg.me,
          rules: msg.rules,
          ...(msg.roomCode !== undefined ? { roomCode: msg.roomCode } : {}),
        });
        this.#notifyListeners();
        return;
      }

      case 'game.snapshot': {
        this.#gameId = msg.gameId;
        this.#seat = msg.view.me;
        this.#stateVersion = msg.stateVersion;
        this.#lastEventN = Math.max(this.#lastEventN, msg.eventN);
        this.#lobbyStatus = 'in_match';
        this.#deadlineEpochMs = msg.view.deadline;
        this.#deadlinePhase = msg.view.phase;

        const resetLog = !this.#hasReceivedSnapshotForGame;
        this.#hasReceivedSnapshotForGame = true;

        this.#store.getState().setMode('remote');
        this.#store.getState().setHotSeatHandover(false, null);
        this.#store.getState().receiveTransition(msg.view, [], {
          resetLog, resync: !resetLog,
        });

        // Se lo snapshot arriva in seguito a STALE_STATE_VERSION, riallinea e ritenta se appropriato
        if (this.#awaitingStaleResyncCommandId !== null) {
          const staleCmdId = this.#awaitingStaleResyncCommandId;
          this.#awaitingStaleResyncCommandId = null;
          const pendingEntry = this.#inFlightCommands.get(staleCmdId);
          if (pendingEntry !== undefined && !pendingEntry.retriedOnStale) {
            pendingEntry.retriedOnStale = true;
            this.#retryCommandOnAlignedSnapshot(
              pendingEntry.command,
              msg.view,
            );
          }
        }

        if (msg.view.phase === 'finished') {
          writeLocalStorageSafe(LAST_FINISHED_GAME_STORAGE_KEY, msg.gameId);
          this.#onGameEnded?.({ gameId: msg.gameId, view: msg.view });
        }

        this.#notifyListeners();
        return;
      }

      case 'game.events': {
        this.#gameId = msg.gameId;
        this.#seat = msg.view.me;
        this.#stateVersion = msg.stateVersion;
        const maxEvN = msg.events.reduce(
          (acc, ev) => Math.max(acc, ev.n),
          msg.fromN,
        );
        this.#lastEventN = Math.max(this.#lastEventN, maxEvN);
        this.#deadlineEpochMs = msg.view.deadline;
        this.#deadlinePhase = msg.view.phase;
        this.#lastError = null;

        this.#store.getState().receiveTransition(msg.view, msg.events, {
          resetLog: false,
        });

        if (msg.view.phase === 'finished') {
          writeLocalStorageSafe(LAST_FINISHED_GAME_STORAGE_KEY, msg.gameId);
          this.#onGameEnded?.({ gameId: msg.gameId, view: msg.view });
        }

        this.#notifyListeners();
        return;
      }

      case 'game.deadline': {
        this.#serverTimeOffsetMs = msg.serverTime - this.#clock();
        this.#deadlineEpochMs = msg.deadline;
        this.#deadlinePhase = msg.phase;

        const currentView = this.#store.getState().view;
        if (currentView !== null) {
          this.#store.getState().setPlayerView({
            ...currentView,
            deadline: msg.deadline,
          });
        }

        this.#notifyListeners();
        return;
      }

      case 'game.ended': {
        this.#gameId = msg.gameId;
        this.#seat = msg.view.me;
        this.#stateVersion = msg.view.stateVersion;
        this.#deadlineEpochMs = null;

        writeLocalStorageSafe(LAST_FINISHED_GAME_STORAGE_KEY, msg.gameId);
        this.#store.getState().setPlayerView(msg.view);
        this.#onGameEnded?.({ gameId: msg.gameId, view: msg.view });
        this.#notifyListeners();
        return;
      }

      case 'game.error': {
        this.#lastError = msg;
        this.#store.getState().setLastError({
          code: msg.code,
          message: msg.message,
        });

        // Riallineamento automatico su STALE_STATE_VERSION (§6.2 regola 3)
        if (msg.code === 'STALE_STATE_VERSION') {
          if (msg.commandId !== undefined) {
            this.#awaitingStaleResyncCommandId = msg.commandId;
          }
          if (this.#gameId !== null) {
            this.requestResync(this.#gameId, this.#lastEventN);
          }
        }

        this.#notifyListeners();
        return;
      }
    }
  }

  #retryCommandOnAlignedSnapshot(
    command: ClientCommand,
    freshView: PlayerView,
  ): void {
    if (!freshView.self.legal.canAct) {
      return;
    }

    switch (command.type) {
      case 'SubmitMulligan':
        if (freshView.self.legal.canSubmitMulligan) {
          this.dispatch(command);
        }
        return;
      case 'SubmitDiscard':
        if (
          freshView.self.legal.canSubmitDiscard &&
          command.cardUids.length === freshView.self.legal.mustDiscardCount
        ) {
          this.dispatch(command);
        }
        return;
      case 'Pass':
        if (freshView.self.legal.canPass) {
          this.dispatch(command);
        }
        return;
      case 'LockInstants':
        if (freshView.self.legal.canLockInstants) {
          this.dispatch(command);
        }
        return;
      case 'PlayCard':
        if (
          freshView.self.legal.playableFieldCardUids.includes(command.cardUid)
        ) {
          this.dispatch(command);
        }
        return;
      case 'PlayConversion':
        if (
          freshView.self.legal.playableConversionUids.includes(
            command.cardUid,
          ) &&
          freshView.self.legal.sacrificableBuildingUids.includes(
            command.sacrificeUid,
          )
        ) {
          this.dispatch(command);
        }
        return;
      case 'ApplyTimeout':
      case 'Concede':
        return;
    }
  }

  /**
   * Entra nella coda rapida (`mode: 'quick'`) con il mazzo selezionato.
   */
  public async joinQuickQueue(deck: DeckPayload): Promise<void> {
    await this.connect();
    this.#lobbyStatus = 'searching_quick';
    this.#lastError = null;
    this.#notifyListeners();

    this.#sendMessage({
      type: 'queue.join',
      mode: 'quick',
      deck,
    });
  }

  /**
   * Crea una stanza privata (`room.create`) con il mazzo selezionato.
   */
  public async createPrivateRoom(deck: DeckPayload): Promise<void> {
    await this.connect();
    this.#lobbyStatus = 'creating_room';
    this.#roomCode = null;
    this.#lastError = null;
    this.#notifyListeners();

    this.#sendMessage({
      type: 'room.create',
      deck,
    });
  }

  /**
   * Entra in una stanza privata esistente tramite `roomCode` (`queue.join` con `mode: 'private'`).
   */
  public async joinPrivateRoom(
    roomCode: string,
    deck: DeckPayload,
  ): Promise<void> {
    await this.connect();
    const normalizedCode = roomCode.trim().toUpperCase();
    this.#lobbyStatus = 'joining_room';
    this.#roomCode = normalizedCode;
    this.#lastError = null;
    this.#notifyListeners();

    this.#sendMessage({
      type: 'queue.join',
      mode: 'private',
      roomCode: normalizedCode,
      deck,
    });
  }

  /**
   * Richiede il riallineamento della vista (`game.resync`) al server (§6.2, §6.4).
   */
  public requestResync(
    gameId = this.#gameId,
    lastEventN = this.#lastEventN,
  ): boolean {
    if (gameId === null) {
      return false;
    }
    this.#gameId = gameId;
    return this.#sendMessage({
      type: 'game.resync',
      gameId,
      lastEventN,
    });
  }

  /**
   * Simula o forza una disconnessione temporanea del socket (senza distruggere la sessione),
   * utile per testare il recupero automatico o manuale tramite `reconnectWithResync()`.
   */
  public disconnectSocketForTest(): void {
    this.#manualDisconnect = true;
    this.#clearReconnectTimer();
    if (this.#socket !== null) {
      const sock = this.#socket;
      this.#socket = null;
      sock.close(1000, 'Client disconnect');
    }
    this.#connectionStatus = 'disconnected';
    this.#notifyListeners();
  }

  /**
   * Riapre la connessione WebSocket, riautentica con il token ospite e invia `game.resync`.
   */
  public async reconnectWithResync(): Promise<RemoteControllerSnapshot> {
    this.#manualDisconnect = false;
    const snap = await this.connect();
    if (this.#gameId !== null) {
      this.requestResync(this.#gameId, this.#lastEventN);
    }
    return snap;
  }

  /**
   * Scarica e valida con Zod il Replay deterministico di una partita `FINISHED` (§6.4).
   */
  public async fetchReplay(
    gameId: string,
    perspective: ReplayPerspective = 'public',
  ): Promise<ReplayPayload> {
    const trimmedId = gameId.trim();
    const url = `${this.#httpBaseUrl}/api/v1/games/${encodeURIComponent(
      trimmedId,
    )}/replay?as=${encodeURIComponent(perspective)}`;

    const headers: Record<string, string> = {};
    if (this.#token !== null) {
      headers['Authorization'] = `Bearer ${this.#token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const json: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof json === 'object' &&
        json !== null &&
        'message' in json &&
        typeof (json as { message: unknown }).message === 'string'
          ? (json as { message: string }).message
          : `Errore HTTP ${response.status} nel caricamento del replay.`;
      throw new Error(message);
    }

    return ReplayPayloadSchema.parse(json);
  }

  public startMatch(): PlayerView {
    this.#store.getState().setMode('remote');
    this.#store.getState().setHotSeatHandover(false, null);
    const currentView = this.#store.getState().view;
    if (currentView === null) {
      throw new Error(
        'La vista della partita remota non è ancora stata ricevuta dal server.',
      );
    }
    return currentView;
  }

  public dispatch(command: ClientCommand): Result<PlayerView, RuleError> {
    const currentView = this.#store.getState().view;
    if (this.#gameId === null || currentView === null) {
      const err: RuleError = {
        code: 'INVALID_PHASE',
        message: 'Nessuna partita online attiva.',
      };
      this.#store.getState().setLastError(err);
      return { ok: false, error: err };
    }

    if (this.#socket === null || this.#socket.readyState !== 1) {
      const err: RuleError = {
        code: 'INTERNAL_ERROR',
        message: 'Connessione al server assente. Riconnessione in corso...',
      };
      this.#store.getState().setLastError(err);
      return { ok: false, error: err };
    }

    const commandId = generateCommandId(
      this.#playerId ?? 'client',
      ++this.#commandCounter,
    );
    const expectedStateVersion = this.#stateVersion;

    this.#inFlightCommands.set(commandId, {
      command,
      retriedOnStale: false,
    });

    this.#sendMessage({
      type: 'game.command',
      gameId: this.#gameId,
      commandId,
      expectedStateVersion,
      command,
    });

    return { ok: true, value: currentView };
  }

  public concede(_player?: PlayerId): Result<PlayerView, RuleError> {
    return this.dispatch({ type: 'Concede' });
  }

  public acknowledgeHotSeatHandover(): void {
    this.#store.getState().setHotSeatHandover(false, null);
  }

  public getCurrentViewer(): PlayerId {
    return this.#seat ?? this.#store.getState().view?.me ?? 'P1';
  }

  public getPlayerView(): PlayerView | null {
    return this.#store.getState().view;
  }

  public dispose(): void {
    this.#disposed = true;
    this.#manualDisconnect = true;
    this.#clearReconnectTimer();
    this.#listeners.clear();

    if (this.#socket !== null) {
      const sock = this.#socket;
      this.#socket = null;
      try {
        sock.close(1000, 'Controller disposed');
      } catch {
        // Ignora errori su chiusura socket
      }
    }

    this.#store.getState().clearPlayback();
    this.#store.getState().setHotSeatHandover(false, null);
  }
}
