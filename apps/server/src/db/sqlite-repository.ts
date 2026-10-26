// TECH-SPEC §6.4 — Implementazione SQLite (better-sqlite3) di GameRepository
// con persistenza ibrida (Snapshot Canonico + Event Sourcing) e transazioni atomiche.

import Database from 'better-sqlite3';
import {
  canonicalizeJson,
  stateHash,
  type ClientCommand,
  type DeckPayload,
  type GameResult,
  type GameState,
  type PlayerId,
  type RulesConfig,
} from '@epochs/engine';
import {
  DuplicateCommandIdError,
  RepositoryIntegrityError,
  type CreateGameRecordInput,
  type CreatePlayerInput,
  type DeckRecord,
  type GameCommandLogRecord,
  type GameRecord,
  type GameRepository,
  type GameStatus,
  type GameTransitionUpdate,
  type PlayerRecord,
  type UpsertDeckInput,
} from './repository.js';

interface PlayerRow {
  id: string;
  token_hash: string;
  nickname: string;
  created_at: number;
}

interface DeckRow {
  id: string;
  player_id: string;
  name: string;
  payload_json: string;
  catalog_version: string;
  updated_at: number;
}

interface GameRow {
  id: string;
  status: string;
  state_version: number;
  event_n: number;
  seed: string;
  rules_json: string;
  canonical_state_json: string;
  state_hash: string;
  p1_id: string;
  p2_id: string;
  result_json: string | null;
  created_at: number;
  updated_at: number;
}

interface GameCommandRow {
  game_id: string;
  idx: number;
  command_id: string;
  player: string;
  expected_version: number;
  resulting_version: number;
  command_json: string;
  state_hash: string;
  created_at: number;
}

export interface SqliteRepositoryOptions {
  /**
   * Percorso del file SQLite oppure `':memory:'` per database in-memory (default `':memory:'`).
   */
  filename?: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE INDEX IF NOT EXISTS idx_decks_player_id ON decks(player_id);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'FINISHED')),
  state_version INTEGER NOT NULL,
  event_n INTEGER NOT NULL,
  seed TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  canonical_state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  p1_id TEXT NOT NULL,
  p2_id TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

CREATE TABLE IF NOT EXISTS game_commands (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  command_id TEXT NOT NULL,
  player TEXT NOT NULL CHECK (player IN ('P1', 'P2')),
  expected_version INTEGER NOT NULL,
  resulting_version INTEGER NOT NULL,
  command_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, idx),
  UNIQUE (game_id, command_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);
`;

export class SqliteRepository implements GameRepository {
  private readonly db: Database.Database;
  private readonly executeSaveTransitionTx: Database.Transaction<
    (
      gameUpdate: GameTransitionUpdate,
      commandLogRecord: GameCommandLogRecord,
    ) => GameRecord
  >;

  public constructor(options: SqliteRepositoryOptions | string = ':memory:') {
    const filename =
      typeof options === 'string' ? options : (options.filename ?? ':memory:');
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);

    this.executeSaveTransitionTx = this.db.transaction(
      (
        gameUpdate: GameTransitionUpdate,
        commandLogRecord: GameCommandLogRecord,
      ): GameRecord => {
        if (gameUpdate.gameId !== commandLogRecord.gameId) {
          throw new Error(
            `Mismatch gameId tra gameUpdate ("${gameUpdate.gameId}") e commandLogRecord ("${commandLogRecord.gameId}").`,
          );
        }

        const computedHash = stateHash(gameUpdate.state);
        if (computedHash !== gameUpdate.stateHash) {
          throw new RepositoryIntegrityError(
            gameUpdate.gameId,
            gameUpdate.stateHash,
            computedHash,
          );
        }
        if (commandLogRecord.stateHash !== gameUpdate.stateHash) {
          throw new RepositoryIntegrityError(
            gameUpdate.gameId,
            commandLogRecord.stateHash,
            gameUpdate.stateHash,
          );
        }

        const existingCommand = this.getCommandByCommandId(
          commandLogRecord.gameId,
          commandLogRecord.commandId,
        );
        if (existingCommand !== null) {
          throw new DuplicateCommandIdError(
            commandLogRecord.gameId,
            commandLogRecord.commandId,
          );
        }

        const updatedAt = gameUpdate.updatedAt ?? Date.now();
        const canonicalStateJson = canonicalizeJson(gameUpdate.state);
        const resultJson =
          gameUpdate.result !== null
            ? canonicalizeJson(gameUpdate.result)
            : null;

        const updateStmt = this.db.prepare(`
          UPDATE games
          SET status = ?,
              state_version = ?,
              event_n = ?,
              canonical_state_json = ?,
              state_hash = ?,
              result_json = ?,
              updated_at = ?
          WHERE id = ?
        `);

        const updateResult = updateStmt.run(
          gameUpdate.status,
          gameUpdate.stateVersion,
          gameUpdate.eventN,
          canonicalStateJson,
          gameUpdate.stateHash,
          resultJson,
          updatedAt,
          gameUpdate.gameId,
        );

        if (updateResult.changes === 0) {
          throw new Error(
            `Partita "${gameUpdate.gameId}" non trovata durante saveTransition.`,
          );
        }

        const insertCommandStmt = this.db.prepare(`
          INSERT INTO game_commands (
            game_id,
            idx,
            command_id,
            player,
            expected_version,
            resulting_version,
            command_json,
            state_hash,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertCommandStmt.run(
          commandLogRecord.gameId,
          commandLogRecord.idx,
          commandLogRecord.commandId,
          commandLogRecord.player,
          commandLogRecord.expectedVersion,
          commandLogRecord.resultingVersion,
          canonicalizeJson(commandLogRecord.command),
          commandLogRecord.stateHash,
          commandLogRecord.createdAt,
        );

        const updatedRecord = this.getGameById(gameUpdate.gameId);
        if (updatedRecord === null) {
          throw new Error(
            `Impossibile rileggere la partita "${gameUpdate.gameId}" dopo saveTransition.`,
          );
        }
        return updatedRecord;
      },
    );
  }

  /**
   * Espone l'istanza `better-sqlite3` sottostante per diagnostica o test di corruzione controllata.
   */
  public getRawDatabase(): Database.Database {
    return this.db;
  }

  public createPlayer(input: CreatePlayerInput): PlayerRecord {
    const createdAt = input.createdAt ?? Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO players (id, token_hash, nickname, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(input.id, input.tokenHash, input.nickname, createdAt);

    return {
      id: input.id,
      tokenHash: input.tokenHash,
      nickname: input.nickname,
      createdAt,
    };
  }

  public getPlayerById(id: string): PlayerRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, token_hash, nickname, created_at
      FROM players
      WHERE id = ?
    `);
    const row = stmt.get(id) as PlayerRow | undefined;
    if (row === undefined) {
      return null;
    }
    return this.mapPlayerRow(row);
  }

  public getPlayerByTokenHash(tokenHash: string): PlayerRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, token_hash, nickname, created_at
      FROM players
      WHERE token_hash = ?
    `);
    const row = stmt.get(tokenHash) as PlayerRow | undefined;
    if (row === undefined) {
      return null;
    }
    return this.mapPlayerRow(row);
  }

  public saveDeck(input: UpsertDeckInput): DeckRecord {
    const catalogVersion = input.catalogVersion ?? '1.0';
    const updatedAt = input.updatedAt ?? Date.now();
    const payloadJson = canonicalizeJson(input.payload);

    const existing = this.getDeckById(input.id);
    if (existing !== null && existing.playerId !== input.playerId) {
      throw new Error(
        `Il mazzo "${input.id}" appartiene a un altro giocatore e non può essere sovrascritto.`,
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO decks (id, player_id, name, payload_json, catalog_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        payload_json = excluded.payload_json,
        catalog_version = excluded.catalog_version,
        updated_at = excluded.updated_at
      WHERE player_id = excluded.player_id
    `);

    stmt.run(
      input.id,
      input.playerId,
      input.name,
      payloadJson,
      catalogVersion,
      updatedAt,
    );

    return {
      id: input.id,
      playerId: input.playerId,
      name: input.name,
      payload: JSON.parse(payloadJson) as DeckPayload,
      catalogVersion,
      updatedAt,
    };
  }

  public getDeckById(id: string): DeckRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, player_id, name, payload_json, catalog_version, updated_at
      FROM decks
      WHERE id = ?
    `);
    const row = stmt.get(id) as DeckRow | undefined;
    if (row === undefined) {
      return null;
    }
    return this.mapDeckRow(row);
  }

  public listDecksByPlayer(playerId: string): DeckRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, player_id, name, payload_json, catalog_version, updated_at
      FROM decks
      WHERE player_id = ?
      ORDER BY updated_at DESC, id ASC
    `);
    const rows = stmt.all(playerId) as DeckRow[];
    return rows.map((row) => this.mapDeckRow(row));
  }

  public deleteDeck(id: string, playerId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM decks
      WHERE id = ? AND player_id = ?
    `);
    const res = stmt.run(id, playerId);
    return res.changes > 0;
  }

  public createGameRecord(input: CreateGameRecordInput): GameRecord {
    const computedHash = stateHash(input.state);
    if (computedHash !== input.stateHash) {
      throw new RepositoryIntegrityError(
        input.id,
        input.stateHash,
        computedHash,
      );
    }

    const createdAt = input.createdAt ?? Date.now();
    const status: GameStatus =
      input.state.phase === 'finished' ? 'FINISHED' : 'ACTIVE';
    const stateVersion = input.state.stateVersion;
    const eventN = input.state.counters.event;
    const result = input.state.result;

    const rulesJson = canonicalizeJson(input.rules);
    const canonicalStateJson = canonicalizeJson(input.state);
    const resultJson = result !== null ? canonicalizeJson(result) : null;

    const stmt = this.db.prepare(`
      INSERT INTO games (
        id,
        status,
        state_version,
        event_n,
        seed,
        rules_json,
        canonical_state_json,
        state_hash,
        p1_id,
        p2_id,
        result_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      status,
      stateVersion,
      eventN,
      input.seed,
      rulesJson,
      canonicalStateJson,
      input.stateHash,
      input.p1Id,
      input.p2Id,
      resultJson,
      createdAt,
      createdAt,
    );

    const record = this.getGameById(input.id);
    if (record === null) {
      throw new Error(`Impossibile rileggere la partita creata "${input.id}".`);
    }
    return record;
  }

  public getGameById(gameId: string): GameRecord | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        status,
        state_version,
        event_n,
        seed,
        rules_json,
        canonical_state_json,
        state_hash,
        p1_id,
        p2_id,
        result_json,
        created_at,
        updated_at
      FROM games
      WHERE id = ?
    `);
    const row = stmt.get(gameId) as GameRow | undefined;
    if (row === undefined) {
      return null;
    }
    return this.hydrateGameRow(row);
  }

  public listActiveGames(): GameRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        status,
        state_version,
        event_n,
        seed,
        rules_json,
        canonical_state_json,
        state_hash,
        p1_id,
        p2_id,
        result_json,
        created_at,
        updated_at
      FROM games
      WHERE status = 'ACTIVE'
      ORDER BY created_at ASC, id ASC
    `);
    const rows = stmt.all() as GameRow[];
    return rows.map((row) => this.hydrateGameRow(row));
  }

  public saveTransition(
    gameUpdate: GameTransitionUpdate,
    commandLogRecord: GameCommandLogRecord,
  ): GameRecord {
    return this.executeSaveTransitionTx(gameUpdate, commandLogRecord);
  }

  public getCommandByCommandId(
    gameId: string,
    commandId: string,
  ): GameCommandLogRecord | null {
    const stmt = this.db.prepare(`
      SELECT
        game_id,
        idx,
        command_id,
        player,
        expected_version,
        resulting_version,
        command_json,
        state_hash,
        created_at
      FROM game_commands
      WHERE game_id = ? AND command_id = ?
    `);
    const row = stmt.get(gameId, commandId) as GameCommandRow | undefined;
    if (row === undefined) {
      return null;
    }
    return this.mapGameCommandRow(row);
  }

  public listCommandsByGame(gameId: string): GameCommandLogRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        game_id,
        idx,
        command_id,
        player,
        expected_version,
        resulting_version,
        command_json,
        state_hash,
        created_at
      FROM game_commands
      WHERE game_id = ?
      ORDER BY idx ASC
    `);
    const rows = stmt.all(gameId) as GameCommandRow[];
    return rows.map((row) => this.mapGameCommandRow(row));
  }

  public close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  private mapPlayerRow(row: PlayerRow): PlayerRecord {
    return {
      id: row.id,
      tokenHash: row.token_hash,
      nickname: row.nickname,
      createdAt: row.created_at,
    };
  }

  private mapDeckRow(row: DeckRow): DeckRecord {
    return {
      id: row.id,
      playerId: row.player_id,
      name: row.name,
      payload: JSON.parse(row.payload_json) as DeckPayload,
      catalogVersion: row.catalog_version as '1.0',
      updatedAt: row.updated_at,
    };
  }

  private hydrateGameRow(row: GameRow): GameRecord {
    const state = JSON.parse(row.canonical_state_json) as GameState;
    const actualHash = stateHash(state);
    if (actualHash !== row.state_hash) {
      throw new RepositoryIntegrityError(row.id, row.state_hash, actualHash);
    }

    const rules = JSON.parse(row.rules_json) as RulesConfig;
    const result =
      row.result_json !== null
        ? (JSON.parse(row.result_json) as GameResult)
        : null;

    return {
      id: row.id,
      status: row.status as GameStatus,
      stateVersion: row.state_version,
      eventN: row.event_n,
      seed: row.seed,
      rules,
      state,
      stateHash: row.state_hash,
      p1Id: row.p1_id,
      p2Id: row.p2_id,
      result,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapGameCommandRow(row: GameCommandRow): GameCommandLogRecord {
    return {
      gameId: row.game_id,
      idx: row.idx,
      commandId: row.command_id,
      player: row.player as PlayerId,
      expectedVersion: row.expected_version,
      resultingVersion: row.resulting_version,
      command: JSON.parse(row.command_json) as ClientCommand,
      stateHash: row.state_hash,
      createdAt: row.created_at,
    };
  }
}
