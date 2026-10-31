// TECH-SPEC §6.4 — Contratto astratto GameRepository per persistenza ibrida (Snapshot Canonico + Event Sourcing)

import type {
  ClientCommand,
  DeckPayload,
  GameResult,
  GameState,
  PlayerId,
  RulesConfig,
} from '@epochs/engine';

export type GameStatus = 'ACTIVE' | 'FINISHED';

export interface PlayerRecord {
  id: string;
  tokenHash: string;
  nickname: string;
  createdAt: number;
}

export interface CreatePlayerInput {
  id: string;
  tokenHash: string;
  nickname: string;
  createdAt?: number;
}

export interface DeckRecord {
  id: string;
  playerId: string;
  name: string;
  payload: DeckPayload;
  catalogVersion: '1.0' | '2.0';
  updatedAt: number;
}

export interface UpsertDeckInput {
  id: string;
  playerId: string;
  name: string;
  payload: DeckPayload;
  catalogVersion?: '1.0' | '2.0';
  updatedAt?: number;
}

export interface GameRecord {
  id: string;
  status: GameStatus;
  stateVersion: number;
  eventN: number;
  seed: string;
  rules: RulesConfig;
  state: GameState;
  stateHash: string;
  p1Id: string;
  p2Id: string;
  result: GameResult | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateGameRecordInput {
  id: string;
  seed: string;
  rules: RulesConfig;
  state: GameState;
  stateHash: string;
  p1Id: string;
  p2Id: string;
  createdAt?: number;
}

export interface GameTransitionUpdate {
  gameId: string;
  status: GameStatus;
  stateVersion: number;
  eventN: number;
  state: GameState;
  stateHash: string;
  result: GameResult | null;
  updatedAt?: number;
}

export interface GameCommandLogRecord {
  gameId: string;
  idx: number;
  commandId: string;
  player: PlayerId;
  expectedVersion: number;
  resultingVersion: number;
  command: ClientCommand;
  stateHash: string;
  createdAt: number;
}

export class RepositoryIntegrityError extends Error {
  public readonly gameId: string;
  public readonly expectedHash: string;
  public readonly actualHash: string;

  public constructor(gameId: string, expectedHash: string, actualHash: string) {
    super(
      `Violazione di integrità stateHash per la partita "${gameId}": atteso "${expectedHash}", calcolato "${actualHash}".`,
    );
    this.name = 'RepositoryIntegrityError';
    this.gameId = gameId;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

export class DuplicateCommandIdError extends Error {
  public readonly gameId: string;
  public readonly commandId: string;

  public constructor(gameId: string, commandId: string) {
    super(
      `Violazione vincolo UNIQUE (game_id, command_id) per partita "${gameId}" e commandId "${commandId}".`,
    );
    this.name = 'DuplicateCommandIdError';
    this.gameId = gameId;
    this.commandId = commandId;
  }
}

/**
 * Interfaccia astratta del repository di persistenza (TECH-SPEC §2, §6.4).
 * Separa completamente il dominio del server dal motore SQL sottostante (SQLite / PostgreSQL).
 */
export interface GameRepository {
  // Gestione giocatori (tabella `players`)
  createPlayer(input: CreatePlayerInput): PlayerRecord;
  getPlayerById(id: string): PlayerRecord | null;
  getPlayerByTokenHash(tokenHash: string): PlayerRecord | null;

  // Gestione mazzi salvati (tabella `decks`)
  saveDeck(input: UpsertDeckInput): DeckRecord;
  getDeckById(id: string): DeckRecord | null;
  listDecksByPlayer(playerId: string): DeckRecord[];
  deleteDeck(id: string, playerId: string): boolean;

  // Gestione partite e persistenza ibrida (tabelle `games` e `game_commands`)
  createGameRecord(input: CreateGameRecordInput): GameRecord;
  getGameById(gameId: string): GameRecord | null;
  listActiveGames(): GameRecord[];

  /**
   * Operazione transazionale atomica (§6.4):
   * aggiorna `games` (`status`, `state_version`, `event_n`, `canonical_state_json`, `state_hash`, `result_json`, `updated_at`)
   * e accoda il comando in `game_commands` (`PRIMARY KEY (game_id, idx)`, `UNIQUE (game_id, command_id)`).
   */
  saveTransition(
    gameUpdate: GameTransitionUpdate,
    commandLogRecord: GameCommandLogRecord,
  ): GameRecord;

  getCommandByCommandId(gameId: string, commandId: string): GameCommandLogRecord | null;

  listCommandsByGame(gameId: string): GameCommandLogRecord[];

  close(): void;
}
