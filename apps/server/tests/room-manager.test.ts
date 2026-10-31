// TECH-SPEC §6.2, §6.4, §6.5 — Test unitari per autenticazione ospite (SHA-256 token) e RoomManager
// (matchmaking rapido, stanze private, validazione mazzo INVALID_DECK e ripristino post-riavvio).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeckPayload } from '@epochs/engine';
import type { ServerToClientMessage } from '@epochs/protocol';
import aggroDeckJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import {
  authenticateOrCreateGuest,
  hashGuestToken,
  resolvePlayerFromToken,
} from '../src/auth/guest-session.js';
import { SqliteRepository } from '../src/db/sqlite-repository.js';
import type { RoomClientSink } from '../src/rooms/game-room.js';
import { RoomManager } from '../src/rooms/room-manager.js';
import { CIVILIZATION_PRESETS } from '../../../packages/content/src/presets.js';

const VALID_DECK_A: DeckPayload = {
  id: balancedDeckJson.id,
  name: balancedDeckJson.name,
  description: balancedDeckJson.description,
  subdecks: balancedDeckJson.subdecks,
};

const VALID_DECK_B: DeckPayload = {
  id: aggroDeckJson.id,
  name: aggroDeckJson.name,
  description: aggroDeckJson.description,
  subdecks: aggroDeckJson.subdecks,
};

class MockSink implements RoomClientSink {
  public readonly playerId: string;
  public readonly messages: ServerToClientMessage[] = [];

  public constructor(playerId: string) {
    this.playerId = playerId;
  }

  public send(message: ServerToClientMessage): void {
    this.messages.push(structuredClone(message));
  }

  public clear(): void {
    this.messages.length = 0;
  }
}

describe('Guest Session & RoomManager (TECH-SPEC §6.2, §6.4, §6.5)', () => {
  let repo: SqliteRepository;
  let manager: RoomManager;

  beforeEach(() => {
    repo = new SqliteRepository(':memory:');
    manager = new RoomManager({
      repository: repo,
      enableTimers: false,
      seedGenerator: () => 'fixed-matchmaking-seed-1234',
    });
  });

  afterEach(() => {
    manager.dispose();
    repo.close();
  });

  it('emette token ospite ad alta entropia salvando solo SHA-256 in players.token_hash e risolve sessioni esistenti', () => {
    const firstSession = authenticateOrCreateGuest(repo, {
      preferredNickname: 'Cartografo Reale',
      now: 1700000000000,
    });

    expect(firstSession.isNew).toBe(true);
    expect(firstSession.token.length).toBeGreaterThanOrEqual(32);
    expect(firstSession.player.nickname).toBe('Cartografo Reale');

    // Il DB non deve mai contenere il token in chiaro ma solo l'hash SHA-256
    const expectedHash = hashGuestToken(firstSession.token);
    expect(firstSession.player.tokenHash).toBe(expectedHash);
    expect(firstSession.player.tokenHash).not.toBe(firstSession.token);
    expect(repo.getPlayerByTokenHash(firstSession.token)).toBeNull();
    expect(repo.getPlayerByTokenHash(expectedHash)).toEqual(firstSession.player);

    // Riconnessione con lo stesso token -> restituisce lo stesso giocatore senza crearne uno nuovo
    const resumedSession = authenticateOrCreateGuest(repo, {
      token: firstSession.token,
    });
    expect(resumedSession.isNew).toBe(false);
    expect(resumedSession.player.id).toBe(firstSession.player.id);
    expect(resumedSession.token).toBe(firstSession.token);

    // Verifica helper resolvePlayerFromToken (sia raw sia Bearer header)
    expect(resolvePlayerFromToken(repo, firstSession.token)?.id).toBe(firstSession.player.id);
    expect(resolvePlayerFromToken(repo, `Bearer ${firstSession.token}`)?.id).toBe(
      firstSession.player.id,
    );
    expect(resolvePlayerFromToken(repo, 'invalid_token')).toBeNull();
  });

  it('rifiuta mazzi non validi con INVALID_DECK sia in coda rapida sia in stanza privata', () => {
    const p1Sink = new MockSink('plr_1');

    // Mazzo con carta di Era II inserita nel sotto-mazzo di Era I
    const invalidEraDeck: DeckPayload = {
      name: 'Mazzo Illegale',
      subdecks: {
        '1': ['e2_mill', ...VALID_DECK_A.subdecks['1'].slice(1)],
        '2': VALID_DECK_A.subdecks['2'],
        '3': VALID_DECK_A.subdecks['3'],
      },
    };

    const quickRes = manager.joinQueue('plr_1', { mode: 'quick', deck: invalidEraDeck }, p1Sink);
    expect(quickRes.ok).toBe(false);
    if (!quickRes.ok) {
      expect(quickRes.error.code).toBe('INVALID_DECK');
    }
    expect(p1Sink.messages[0]).toMatchObject({
      type: 'game.error',
      code: 'INVALID_DECK',
    });

    p1Sink.clear();
    const privateRes = manager.createPrivateRoom('plr_1', { deck: invalidEraDeck }, p1Sink);
    expect(privateRes.ok).toBe(false);
    if (!privateRes.ok) {
      expect(privateRes.error.code).toBe('INVALID_DECK');
    }
    expect(p1Sink.messages[0]).toMatchObject({
      type: 'game.error',
      code: 'INVALID_DECK',
    });
  });

  it('abbina due giocatori nella coda rapida (mode: quick) e invia match.found + game.snapshot', () => {
    const p1Sink = new MockSink('plr_1');
    const p2Sink = new MockSink('plr_2');

    const r1 = manager.joinQueue('plr_1', { mode: 'quick', deck: VALID_DECK_A }, p1Sink);
    expect(r1).toEqual({ ok: true, status: 'queued' });
    expect(manager.getQuickQueueSize()).toBe(1);

    // Se lo stesso giocatore invia di nuovo queue.join non si auto-abbina
    const r1Again = manager.joinQueue('plr_1', { mode: 'quick', deck: VALID_DECK_A }, p1Sink);
    expect(r1Again).toEqual({ ok: true, status: 'queued' });
    expect(manager.getQuickQueueSize()).toBe(1);

    // Arriva il secondo giocatore: match immediato
    const r2 = manager.joinQueue('plr_2', { mode: 'quick', deck: VALID_DECK_B }, p2Sink);
    expect(r2.ok).toBe(true);
    if (!r2.ok || r2.status !== 'matched') {
      throw new Error('Expected matched status');
    }

    expect(manager.getQuickQueueSize()).toBe(0);
    const gameId = r2.room.gameId;

    expect(p1Sink.messages.find((m) => m.type === 'match.found')).toMatchObject({
      type: 'match.found',
      gameId,
      me: 'P1',
    });
    expect(p2Sink.messages.find((m) => m.type === 'match.found')).toMatchObject({
      type: 'match.found',
      gameId,
      me: 'P2',
    });
    expect(p1Sink.messages.some((m) => m.type === 'game.snapshot')).toBe(true);
    expect(p2Sink.messages.some((m) => m.type === 'game.snapshot')).toBe(true);
  });

  it('gestisce creazione e ingresso in stanza privata tramite roomCode e rifiuta codici inesistenti', () => {
    const hostSink = new MockSink('plr_host');
    const guestSink = new MockSink('plr_guest');

    const created = manager.createPrivateRoom('plr_host', { deck: VALID_DECK_A }, hostSink);
    expect(created.ok).toBe(true);
    if (!created.ok || created.status !== 'room_created') {
      throw new Error('Expected room_created');
    }

    const roomCode = created.roomCode;
    expect(roomCode.length).toBeGreaterThanOrEqual(4);
    expect(hostSink.messages[0]).toEqual({
      type: 'room.created',
      roomCode,
    });

    // Tentativo con codice errato -> MATCH_NOT_ACCESSIBLE
    const wrongJoin = manager.joinQueue(
      'plr_guest',
      { mode: 'private', roomCode: 'ZZZZ99', deck: VALID_DECK_B },
      guestSink,
    );
    expect(wrongJoin.ok).toBe(false);
    if (!wrongJoin.ok) {
      expect(wrongJoin.error.code).toBe('MATCH_NOT_ACCESSIBLE');
    }

    // Ingresso valido con roomCode (anche minuscolo)
    guestSink.clear();
    const joined = manager.joinQueue(
      'plr_guest',
      { mode: 'private', roomCode: roomCode.toLowerCase(), deck: VALID_DECK_B },
      guestSink,
    );
    expect(joined.ok).toBe(true);
    if (!joined.ok || joined.status !== 'matched') {
      throw new Error('Expected matched status on private room join');
    }

    expect(manager.hasPendingPrivateRoom(roomCode)).toBe(false);
    expect(guestSink.messages.find((m) => m.type === 'match.found')).toMatchObject({
      type: 'match.found',
      gameId: joined.room.gameId,
      me: 'P2',
      roomCode,
    });
  });

  it.each(['1.0', '2.0'] as const)(
    'ricostruisce le partite ACTIVE %s al riavvio e gestisce resync e prosecuzione',
    async (version) => {
      const p1Sink = new MockSink('plr_1');
      const p2Sink = new MockSink('plr_2');

      manager.joinQueue(
        'plr_1',
        { mode: 'quick', deck: version === '2.0' ? CIVILIZATION_PRESETS[0]! : VALID_DECK_A },
        p1Sink,
      );
      const matchRes = manager.joinQueue(
        'plr_2',
        { mode: 'quick', deck: version === '2.0' ? CIVILIZATION_PRESETS[2]! : VALID_DECK_B },
        p2Sink,
      );
      expect(matchRes.ok && matchRes.status === 'matched').toBe(true);
      if (!matchRes.ok || matchRes.status !== 'matched') return;

      const gameId = matchRes.room.gameId;

      // P1 invia SubmitMulligan portando stateVersion a 1
      const cmd1 = await manager.handleGameCommand(
        'plr_1',
        {
          gameId,
          commandId: 'cmd_before_restart_1',
          expectedStateVersion: 0,
          command: { type: 'SubmitMulligan', cardUids: [] },
        },
        p1Sink,
      );
      expect(cmd1.ok).toBe(true);
      expect(matchRes.room.getStateVersion()).toBe(1);

      // Simuliamo lo spegnimento del processo server e la creazione di un nuovo RoomManager sullo stesso DB SQLite
      manager.dispose();

      const restartedManager = new RoomManager({
        repository: repo,
        enableTimers: false,
      });

      expect(restartedManager.listActiveRoomIds()).toContain(gameId);
      const restoredRoom = restartedManager.getRoom(gameId);
      expect(restoredRoom).not.toBeNull();
      expect(restoredRoom?.getStateVersion()).toBe(1);

      // P1 e P2 inviano game.resync dopo il riavvio e proseguono la partita
      const p1ReconnectSink = new MockSink('plr_1');
      const p2ReconnectSink = new MockSink('plr_2');

      const resync1 = await restartedManager.handleGameResync(
        'plr_1',
        { gameId, lastEventN: 0 },
        p1ReconnectSink,
      );
      const resync2 = await restartedManager.handleGameResync(
        'plr_2',
        { gameId, lastEventN: 0 },
        p2ReconnectSink,
      );
      expect(resync1).toBe(true);
      expect(resync2).toBe(true);

      expect(p1ReconnectSink.messages.find((m) => m.type === 'game.snapshot')).toMatchObject({
        type: 'game.snapshot',
        gameId,
        stateVersion: 1,
      });

      // Ora P2 completa il mulligan alla versione 1 -> la partita avanza a development (stateVersion 2)
      const cmd2 = await restartedManager.handleGameCommand(
        'plr_2',
        {
          gameId,
          commandId: 'cmd_after_restart_2',
          expectedStateVersion: 1,
          command: { type: 'SubmitMulligan', cardUids: [] },
        },
        p2ReconnectSink,
      );
      expect(cmd2.ok).toBe(true);
      expect(restoredRoom?.getStateVersion()).toBe(2);
      expect(restoredRoom?.getPhase()).toBe('development');

      restartedManager.dispose();
    },
  );
});
