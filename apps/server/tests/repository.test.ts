// TECH-SPEC §6.4, §10.1 Livello F — Test di persistenza ibrida, transazioni atomiche e integrità stateHash per SqliteRepository

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CARDS_RULES } from '@epochs/content';
import {
  DEFAULT_RULES_CONFIG,
  apply,
  createGame,
  stateHash,
  type DeckPayload,
} from '@epochs/engine';
import balancedDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import {
  DuplicateCommandIdError,
  RepositoryIntegrityError,
} from '../src/db/repository.js';
import { SqliteRepository } from '../src/db/sqlite-repository.js';

const SAMPLE_DECK: DeckPayload = {
  id: balancedDeckJson.id,
  name: balancedDeckJson.name,
  description: balancedDeckJson.description,
  subdecks: balancedDeckJson.subdecks,
};

describe('SqliteRepository (TECH-SPEC §6.4)', () => {
  let repo: SqliteRepository;

  beforeEach(() => {
    repo = new SqliteRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('gestisce creazione e lookup di players e applica il vincolo UNIQUE su token_hash', () => {
    const p1 = repo.createPlayer({
      id: 'player_1',
      tokenHash: 'hash_token_1',
      nickname: 'Stratega Alfa',
      createdAt: 1700000000000,
    });

    expect(p1).toEqual({
      id: 'player_1',
      tokenHash: 'hash_token_1',
      nickname: 'Stratega Alfa',
      createdAt: 1700000000000,
    });

    expect(repo.getPlayerById('player_1')).toEqual(p1);
    expect(repo.getPlayerByTokenHash('hash_token_1')).toEqual(p1);
    expect(repo.getPlayerById('unknown')).toBeNull();
    expect(repo.getPlayerByTokenHash('unknown_hash')).toBeNull();

    // Vincolo UNIQUE su token_hash
    expect(() =>
      repo.createPlayer({
        id: 'player_2',
        tokenHash: 'hash_token_1',
        nickname: 'Clone',
      }),
    ).toThrow();
  });

  it('gestisce salvataggio, aggiornamento, elenco ed eliminazione dei mazzi in decks', () => {
    repo.createPlayer({
      id: 'p1',
      tokenHash: 'th_1',
      nickname: 'P1',
    });
    repo.createPlayer({
      id: 'p2',
      tokenHash: 'th_2',
      nickname: 'P2',
    });

    const saved = repo.saveDeck({
      id: 'deck_1',
      playerId: 'p1',
      name: 'Mazzo Tattico',
      payload: SAMPLE_DECK,
      updatedAt: 1000,
    });

    expect(saved.id).toBe('deck_1');
    expect(saved.playerId).toBe('p1');
    expect(saved.name).toBe('Mazzo Tattico');
    expect(saved.catalogVersion).toBe('1.0');
    expect(saved.payload.subdecks['1']).toHaveLength(20);

    // Upsert dallo stesso proprietario
    const updated = repo.saveDeck({
      id: 'deck_1',
      playerId: 'p1',
      name: 'Mazzo Tattico v2',
      payload: SAMPLE_DECK,
      updatedAt: 2000,
    });
    expect(updated.name).toBe('Mazzo Tattico v2');
    expect(updated.updatedAt).toBe(2000);

    // Un altro giocatore non può sovrascrivere il mazzo altrui
    expect(() =>
      repo.saveDeck({
        id: 'deck_1',
        playerId: 'p2',
        name: 'Furto',
        payload: SAMPLE_DECK,
      }),
    ).toThrow(/appartiene a un altro giocatore/);

    const listP1 = repo.listDecksByPlayer('p1');
    expect(listP1).toHaveLength(1);
    expect(listP1[0]?.name).toBe('Mazzo Tattico v2');

    // Solo il proprietario può eliminare il mazzo
    expect(repo.deleteDeck('deck_1', 'p2')).toBe(false);
    expect(repo.deleteDeck('deck_1', 'p1')).toBe(true);
    expect(repo.getDeckById('deck_1')).toBeNull();
  });

  it('esegue saveTransition in modo transazionale atomico e rispetta UNIQUE (game_id, command_id)', () => {
    const initial = createGame({
      seed: 'repo-test-seed-01',
      catalog: CARDS_RULES,
      rules: DEFAULT_RULES_CONFIG,
      decks: {
        P1: SAMPLE_DECK,
        P2: SAMPLE_DECK,
      },
    });

    const initialHash = stateHash(initial.state);
    const createdRecord = repo.createGameRecord({
      id: 'game_01',
      seed: 'repo-test-seed-01',
      rules: initial.state.rules,
      state: initial.state,
      stateHash: initialHash,
      p1Id: 'p1_user',
      p2Id: 'p2_user',
      createdAt: 1000,
    });

    expect(createdRecord.status).toBe('ACTIVE');
    expect(createdRecord.stateVersion).toBe(0);
    expect(createdRecord.stateHash).toBe(initialHash);

    // Transizione 1: P1 conferma Mulligan con 0 carte
    const step1 = apply(initial.state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;

    const hash1 = stateHash(step1.value.state);
    const updated1 = repo.saveTransition(
      {
        gameId: 'game_01',
        status: 'ACTIVE',
        stateVersion: step1.value.state.stateVersion,
        eventN: step1.value.state.counters.event,
        state: step1.value.state,
        stateHash: hash1,
        result: step1.value.state.result,
        updatedAt: 2000,
      },
      {
        gameId: 'game_01',
        idx: 0,
        commandId: 'cmd_mulligan_p1',
        player: 'P1',
        expectedVersion: 0,
        resultingVersion: 1,
        command: { type: 'SubmitMulligan', cardUids: [] },
        stateHash: hash1,
        createdAt: 2000,
      },
    );

    expect(updated1.stateVersion).toBe(1);
    expect(updated1.stateHash).toBe(hash1);

    const savedCmd = repo.getCommandByCommandId('game_01', 'cmd_mulligan_p1');
    expect(savedCmd).not.toBeNull();
    expect(savedCmd?.resultingVersion).toBe(1);
    expect(savedCmd?.command).toEqual({ type: 'SubmitMulligan', cardUids: [] });

    // Tentativo di riutilizzare lo stesso command_id: deve sollevare DuplicateCommandIdError
    // e fare rollback dell'aggiornamento di games
    const step2 = apply(step1.value.state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    const hash2 = stateHash(step2.value.state);

    expect(() =>
      repo.saveTransition(
        {
          gameId: 'game_01',
          status: 'ACTIVE',
          stateVersion: step2.value.state.stateVersion,
          eventN: step2.value.state.counters.event,
          state: step2.value.state,
          stateHash: hash2,
          result: null,
          updatedAt: 3000,
        },
        {
          gameId: 'game_01',
          idx: 1,
          commandId: 'cmd_mulligan_p1', // DUPLICATO!
          player: 'P2',
          expectedVersion: 1,
          resultingVersion: 2,
          command: { type: 'SubmitMulligan', cardUids: [] },
          stateHash: hash2,
          createdAt: 3000,
        },
      ),
    ).toThrow(DuplicateCommandIdError);

    // Verifica che lo stato in `games` sia rimasto alla versione 1 (rollback atomico)
    const afterFailedDuplicate = repo.getGameById('game_01');
    expect(afterFailedDuplicate?.stateVersion).toBe(1);
    expect(afterFailedDuplicate?.stateHash).toBe(hash1);
    expect(repo.listCommandsByGame('game_01')).toHaveLength(1);

    // Tentativo con idx duplicato (PRIMARY KEY (game_id, idx)): deve fallire e fare rollback dell'UPDATE su games
    expect(() =>
      repo.saveTransition(
        {
          gameId: 'game_01',
          status: 'ACTIVE',
          stateVersion: step2.value.state.stateVersion,
          eventN: step2.value.state.counters.event,
          state: step2.value.state,
          stateHash: hash2,
          result: null,
          updatedAt: 3500,
        },
        {
          gameId: 'game_01',
          idx: 0, // IDX GIA' USATO!
          commandId: 'cmd_mulligan_p2_unique',
          player: 'P2',
          expectedVersion: 1,
          resultingVersion: 2,
          command: { type: 'SubmitMulligan', cardUids: [] },
          stateHash: hash2,
          createdAt: 3500,
        },
      ),
    ).toThrow();

    const afterFailedIdx = repo.getGameById('game_01');
    expect(afterFailedIdx?.stateVersion).toBe(1);
    expect(afterFailedIdx?.stateHash).toBe(hash1);
    expect(repo.listCommandsByGame('game_01')).toHaveLength(1);
  });

  it('carica le partite ACTIVE con listActiveGames e rileva corruzioni di stateHash tramite RepositoryIntegrityError', () => {
    const g1 = createGame({
      seed: 'active-seed-1',
      catalog: CARDS_RULES,
      rules: DEFAULT_RULES_CONFIG,
      decks: { P1: SAMPLE_DECK, P2: SAMPLE_DECK },
    });
    const g2 = createGame({
      seed: 'finished-seed-2',
      catalog: CARDS_RULES,
      rules: DEFAULT_RULES_CONFIG,
      decks: { P1: SAMPLE_DECK, P2: SAMPLE_DECK },
    });

    repo.createGameRecord({
      id: 'game_active',
      seed: 'active-seed-1',
      rules: g1.state.rules,
      state: g1.state,
      stateHash: stateHash(g1.state),
      p1Id: 'p1',
      p2Id: 'p2',
      createdAt: 100,
    });

    repo.createGameRecord({
      id: 'game_to_finish',
      seed: 'finished-seed-2',
      rules: g2.state.rules,
      state: g2.state,
      stateHash: stateHash(g2.state),
      p1Id: 'p3',
      p2Id: 'p4',
      createdAt: 200,
    });

    // Chiudiamo la seconda partita con Concede
    const conceded = apply(g2.state, { type: 'Concede', player: 'P1' });
    expect(conceded.ok).toBe(true);
    if (!conceded.ok) return;

    const concededHash = stateHash(conceded.value.state);
    repo.saveTransition(
      {
        gameId: 'game_to_finish',
        status: 'FINISHED',
        stateVersion: conceded.value.state.stateVersion,
        eventN: conceded.value.state.counters.event,
        state: conceded.value.state,
        stateHash: concededHash,
        result: conceded.value.state.result,
      },
      {
        gameId: 'game_to_finish',
        idx: 0,
        commandId: 'cmd_concede',
        player: 'P1',
        expectedVersion: 0,
        resultingVersion: 1,
        command: { type: 'Concede' },
        stateHash: concededHash,
        createdAt: 250,
      },
    );

    const activeGames = repo.listActiveGames();
    expect(activeGames).toHaveLength(1);
    expect(activeGames[0]?.id).toBe('game_active');

    // Rifiuta createGameRecord se stateHash fornito non corrisponde allo stato
    expect(() =>
      repo.createGameRecord({
        id: 'game_bad_hash',
        seed: 'active-seed-1',
        rules: g1.state.rules,
        state: g1.state,
        stateHash: '0'.repeat(64),
        p1Id: 'p1',
        p2Id: 'p2',
      }),
    ).toThrow(RepositoryIntegrityError);

    // Manomettiamo direttamente state_hash nel DB per verificare il controllo all'avvio / lettura
    repo
      .getRawDatabase()
      .prepare('UPDATE games SET state_hash = ? WHERE id = ?')
      .run('f'.repeat(64), 'game_active');

    expect(() => repo.getGameById('game_active')).toThrow(
      RepositoryIntegrityError,
    );
    expect(() => repo.listActiveGames()).toThrow(RepositoryIntegrityError);
  });
});
