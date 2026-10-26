// TECH-SPEC §6.1–6.5 — RoomManager: matchmaking rapido ('quick'), stanze private ('roomCode'),
// validazione mazzi ('INVALID_DECK'), routing comandi/resync e ricostruzione partite ACTIVE al riavvio.

import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { CARDS_RULES } from '@epochs/content';
import {
  DEFAULT_RULES_CONFIG,
  createGame,
  stateHash,
  validateDeck,
  type CardRules,
  type DeckPayload,
  type RulesConfig,
} from '@epochs/engine';
import {
  DeckPayloadSchema,
  createGameErrorMessage,
  type GameCommandPayload,
  type GameErrorMessage,
  type GameResyncPayload,
  type QueueJoinPayload,
  type RoomCreatePayload,
  type RoomCreatedMessage,
} from '@epochs/protocol';
import type { GameRepository } from '../db/repository.js';
import {
  DEFAULT_DISCONNECT_GRACE_MS,
  GameRoom,
  type HandleCommandOutcome,
  type RoomClientSink,
} from './game-room.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface WaitingQueueEntry {
  readonly playerId: string;
  readonly deck: DeckPayload;
  readonly sink: RoomClientSink;
  readonly joinedAt: number;
}

interface PendingPrivateRoom {
  readonly roomCode: string;
  readonly hostPlayerId: string;
  readonly hostDeck: DeckPayload;
  readonly hostSink: RoomClientSink;
  readonly createdAt: number;
}

export interface RoomManagerOptions {
  readonly repository: GameRepository;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly rulesConfig?: Partial<RulesConfig>;
  readonly clock?: () => number;
  readonly enableTimers?: boolean;
  readonly disconnectGraceMs?: number;
  readonly seedGenerator?: () => string;
  readonly roomCodeGenerator?: () => string;
  readonly autoRestoreActiveGames?: boolean;
}

export type MatchmakingResult =
  | { readonly ok: true; readonly status: 'queued' }
  | { readonly ok: true; readonly status: 'room_created'; readonly roomCode: string }
  | { readonly ok: true; readonly status: 'matched'; readonly room: GameRoom }
  | { readonly ok: false; readonly error: GameErrorMessage };

export class RoomManager {
  private readonly repository: GameRepository;
  private readonly catalog: Record<string, CardRules>;
  private readonly rulesConfig: Partial<RulesConfig> | undefined;
  private readonly clock: () => number;
  private readonly enableTimers: boolean;
  private readonly disconnectGraceMs: number;
  private readonly seedGenerator: () => string;
  private readonly roomCodeGenerator: () => string;

  private readonly rooms = new Map<string, GameRoom>();
  private readonly quickQueue: WaitingQueueEntry[] = [];
  private readonly privateRooms = new Map<string, PendingPrivateRoom>();

  public constructor(options: RoomManagerOptions) {
    this.repository = options.repository;
    this.catalog = { ...(options.catalog ?? CARDS_RULES) };
    this.rulesConfig = options.rulesConfig;
    this.clock = options.clock ?? (() => Date.now());
    this.enableTimers = options.enableTimers ?? true;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.seedGenerator =
      options.seedGenerator ?? (() => randomBytes(16).toString('hex'));
    this.roomCodeGenerator =
      options.roomCodeGenerator ?? (() => this.generateUniqueRoomCode());

    if (options.autoRestoreActiveGames !== false) {
      this.restoreActiveGames();
    }
  }

  /**
   * Ricostruisce in memoria tutte le partite con `status = 'ACTIVE'` dal database (TECH-SPEC §6.4),
   * verificando `stateHash(state) === state_hash` tramite `repository.listActiveGames()`.
   */
  public restoreActiveGames(): number {
    const activeRecords = this.repository.listActiveGames();
    let restoredCount = 0;

    for (const record of activeRecords) {
      if (this.rooms.has(record.id)) {
        continue;
      }

      const existingCommands = this.repository.listCommandsByGame(record.id);
      const room = new GameRoom({
        gameId: record.id,
        p1Id: record.p1Id,
        p2Id: record.p2Id,
        initialState: record.state,
        repository: this.repository,
        initialCommandIdx: existingCommands.length,
        clock: this.clock,
        enableTimers: this.enableTimers,
        disconnectGraceMs: this.disconnectGraceMs,
      });

      this.rooms.set(record.id, room);
      restoredCount += 1;
    }

    return restoredCount;
  }

  public getRoom(gameId: string): GameRoom | null {
    return this.rooms.get(gameId) ?? null;
  }

  public listActiveRoomIds(): string[] {
    return Array.from(this.rooms.values())
      .filter((r) => !r.isFinished())
      .map((r) => r.gameId);
  }

  public getQuickQueueSize(): number {
    return this.quickQueue.length;
  }

  public hasPendingPrivateRoom(roomCode: string): boolean {
    return this.privateRooms.has(roomCode.trim().toUpperCase());
  }

  /**
   * Valida il mazzo sia contro lo schema Zod (`DeckPayloadSchema`) sia contro il catalogo ufficiale (`validateDeck`).
   */
  public validatePlayerDeck(deck: unknown): GameErrorMessage | null {
    const schemaCheck = DeckPayloadSchema.safeParse(deck);
    if (!schemaCheck.success) {
      return createGameErrorMessage(
        'INVALID_DECK',
        schemaCheck.error.issues[0]?.message ?? 'Formato mazzo non valido.',
      );
    }

    const engineIssues = validateDeck(schemaCheck.data, this.catalog);
    if (engineIssues.length > 0) {
      return createGameErrorMessage(
        'INVALID_DECK',
        engineIssues[0]!.message,
      );
    }

    return null;
  }

  /**
   * Gestisce `room.create`: valida il mazzo, registra una stanza privata in attesa e invia `room.created`.
   */
  public createPrivateRoom(
    playerId: string,
    payload: RoomCreatePayload,
    sink: RoomClientSink,
  ): MatchmakingResult {
    const deckError = this.validatePlayerDeck(payload.deck);
    if (deckError !== null) {
      sink.send(deckError);
      return { ok: false, error: deckError };
    }

    this.removeWaitingPlayer(playerId);

    const roomCode = this.roomCodeGenerator().trim().toUpperCase();
    this.privateRooms.set(roomCode, {
      roomCode,
      hostPlayerId: playerId,
      hostDeck: structuredClone(payload.deck),
      hostSink: sink,
      createdAt: this.clock(),
    });

    const createdMsg: RoomCreatedMessage = {
      type: 'room.created',
      roomCode,
    };
    sink.send(createdMsg);

    return { ok: true, status: 'room_created', roomCode };
  }

  /**
   * Gestisce `queue.join` in modalità `'quick'` (coda veloce) o `'private'` (ingresso tramite `roomCode`).
   */
  public joinQueue(
    playerId: string,
    payload: QueueJoinPayload,
    sink: RoomClientSink,
  ): MatchmakingResult {
    const deckError = this.validatePlayerDeck(payload.deck);
    if (deckError !== null) {
      sink.send(deckError);
      return { ok: false, error: deckError };
    }

    if (payload.mode === 'private') {
      const code = payload.roomCode?.trim().toUpperCase();
      if (code === undefined || code.length < 4) {
        const error = createGameErrorMessage(
          'MATCH_NOT_ACCESSIBLE',
          'Codice stanza privata mancante o non valido.',
        );
        sink.send(error);
        return { ok: false, error };
      }

      const pending = this.privateRooms.get(code);
      if (pending === undefined || pending.hostPlayerId === playerId) {
        const error = createGameErrorMessage(
          'MATCH_NOT_ACCESSIBLE',
          `Stanza privata "${code}" non trovata o non disponibile.`,
        );
        sink.send(error);
        return { ok: false, error };
      }

      this.privateRooms.delete(code);
      this.removeWaitingPlayer(playerId);

      const room = this.startNewMatch({
        p1Id: pending.hostPlayerId,
        p1Deck: pending.hostDeck,
        p1Sink: pending.hostSink,
        p2Id: playerId,
        p2Deck: payload.deck,
        p2Sink: sink,
        roomCode: code,
      });

      return { ok: true, status: 'matched', room };
    }

    // Modalità 'quick'
    this.removeWaitingPlayer(playerId);

    const opponentIdx = this.quickQueue.findIndex(
      (entry) => entry.playerId !== playerId,
    );
    if (opponentIdx === -1) {
      this.quickQueue.push({
        playerId,
        deck: structuredClone(payload.deck),
        sink,
        joinedAt: this.clock(),
      });
      return { ok: true, status: 'queued' };
    }

    const [opponent] = this.quickQueue.splice(opponentIdx, 1);
    const room = this.startNewMatch({
      p1Id: opponent!.playerId,
      p1Deck: opponent!.deck,
      p1Sink: opponent!.sink,
      p2Id: playerId,
      p2Deck: payload.deck,
      p2Sink: sink,
    });

    return { ok: true, status: 'matched', room };
  }

  /**
   * Instrada un `game.command` verso la `GameRoom` corrispondente.
   */
  public async handleGameCommand(
    playerId: string,
    payload: GameCommandPayload,
    sink: RoomClientSink,
  ): Promise<HandleCommandOutcome> {
    const room = this.getOrLoadRoom(payload.gameId);
    if (room === null) {
      const error = createGameErrorMessage(
        'MATCH_NOT_ACCESSIBLE',
        undefined,
        payload.commandId,
      );
      sink.send(error);
      return { ok: false, error };
    }

    const seat = room.resolveSeat(playerId);
    if (seat !== null) {
      room.attachClient(playerId, sink, {
        sendMatchFound: false,
        sendSnapshot: false,
      });
    }

    return room.handleCommand({
      playerId,
      commandId: payload.commandId,
      expectedStateVersion: payload.expectedStateVersion,
      command: payload.command,
      replySink: sink,
    });
  }

  /**
   * Instrada un `game.resync` verso la `GameRoom` corrispondente (ripristinando il sink del client).
   */
  public async handleGameResync(
    playerId: string,
    payload: GameResyncPayload,
    sink: RoomClientSink,
  ): Promise<boolean> {
    const room = this.getOrLoadRoom(payload.gameId);
    if (room === null) {
      sink.send(createGameErrorMessage('MATCH_NOT_ACCESSIBLE'));
      return false;
    }

    return room.handleResync(playerId, payload.lastEventN, sink);
  }

  /**
   * Gestisce la disconnessione di un socket client rimuovendolo dalle code d'attesa
   * e attivando il grace period nelle stanze attive a cui partecipa.
   */
  public handleClientDisconnect(
    playerId: string,
    sink?: RoomClientSink,
  ): void {
    this.removeWaitingPlayer(playerId, sink);

    for (const room of this.rooms.values()) {
      if (room.resolveSeat(playerId) !== null) {
        room.detachClient(playerId, sink);
      }
    }
  }

  /**
   * Ferma tutti i timer delle stanze attive (usato in fase di shutdown).
   */
  public dispose(): void {
    this.quickQueue.length = 0;
    this.privateRooms.clear();
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
  }

  private getOrLoadRoom(gameId: string): GameRoom | null {
    const existing = this.rooms.get(gameId);
    if (existing !== undefined) {
      return existing;
    }

    const record = this.repository.getGameById(gameId);
    if (record === null) {
      return null;
    }

    const commands = this.repository.listCommandsByGame(gameId);
    const room = new GameRoom({
      gameId: record.id,
      p1Id: record.p1Id,
      p2Id: record.p2Id,
      initialState: record.state,
      repository: this.repository,
      initialCommandIdx: commands.length,
      clock: this.clock,
      enableTimers: this.enableTimers,
      disconnectGraceMs: this.disconnectGraceMs,
    });

    this.rooms.set(gameId, room);
    return room;
  }

  private startNewMatch(params: {
    readonly p1Id: string;
    readonly p1Deck: DeckPayload;
    readonly p1Sink: RoomClientSink;
    readonly p2Id: string;
    readonly p2Deck: DeckPayload;
    readonly p2Sink: RoomClientSink;
    readonly roomCode?: string;
  }): GameRoom {
    const gameId = `game_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const seed = this.seedGenerator();
    const now = this.clock();

    const created = createGame({
      seed,
      catalog: this.catalog,
      rules: this.rulesConfig ?? DEFAULT_RULES_CONFIG,
      decks: {
        P1: params.p1Deck,
        P2: params.p2Deck,
      },
    });

    const initialHash = stateHash(created.state);
    this.repository.createGameRecord({
      id: gameId,
      seed,
      rules: created.state.rules,
      state: created.state,
      stateHash: initialHash,
      p1Id: params.p1Id,
      p2Id: params.p2Id,
      createdAt: now,
    });

    const room = new GameRoom({
      gameId,
      p1Id: params.p1Id,
      p2Id: params.p2Id,
      initialState: created.state,
      repository: this.repository,
      ...(params.roomCode !== undefined ? { roomCode: params.roomCode } : {}),
      initialCommandIdx: 0,
      clock: this.clock,
      enableTimers: this.enableTimers,
      disconnectGraceMs: this.disconnectGraceMs,
    });

    this.rooms.set(gameId, room);

    room.attachClient(params.p1Id, params.p1Sink, {
      sendMatchFound: true,
      sendSnapshot: true,
    });
    room.attachClient(params.p2Id, params.p2Sink, {
      sendMatchFound: true,
      sendSnapshot: true,
    });

    return room;
  }

  private removeWaitingPlayer(
    playerId: string,
    sink?: RoomClientSink,
  ): void {
    for (let i = this.quickQueue.length - 1; i >= 0; i--) {
      const entry = this.quickQueue[i]!;
      if (
        entry.playerId === playerId &&
        (sink === undefined || entry.sink === sink)
      ) {
        this.quickQueue.splice(i, 1);
      }
    }

    for (const [code, pending] of this.privateRooms.entries()) {
      if (
        pending.hostPlayerId === playerId &&
        (sink === undefined || pending.hostSink === sink)
      ) {
        this.privateRooms.delete(code);
      }
    }
  }

  private generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        const idx = randomInt(0, ROOM_CODE_ALPHABET.length);
        code += ROOM_CODE_ALPHABET[idx]!;
      }
      if (!this.privateRooms.has(code)) {
        return code;
      }
    }
    return randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  }
}
