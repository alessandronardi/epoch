// TECH-SPEC §6.1–6.3, §10.1 Livello F — Test unitari per GameRoom:
// coda sequenziale, STALE_STATE_VERSION, IDEMPOTENCY_KEY_REUSED, isolamento seat,
// anti-leak P1/P2, timer di finestra (30s/30s/45s/30s), 3 timeout consecutivi e grace period disconnessione (60s).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARDS_RULES } from '@epochs/content';
import {
  DEFAULT_RULES_CONFIG,
  createGame,
  stateHash,
  type DeckPayload,
  type GameState,
} from '@epochs/engine';
import type { ServerToClientMessage } from '@epochs/protocol';
import balancedDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import { SqliteRepository } from '../src/db/sqlite-repository.js';
import { GameRoom, type RoomClientSink } from '../src/rooms/game-room.js';

const SAMPLE_DECK: DeckPayload = {
  id: balancedDeckJson.id,
  name: balancedDeckJson.name,
  description: balancedDeckJson.description,
  subdecks: balancedDeckJson.subdecks,
};

class MockClientSink implements RoomClientSink {
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

function createPersistedRoom(
  repo: SqliteRepository,
  options: {
    gameId?: string;
    seed?: string;
    p1Id?: string;
    p2Id?: string;
    enableTimers?: boolean;
    disconnectGraceMs?: number;
  } = {},
): { room: GameRoom; initialState: GameState } {
  const gameId = options.gameId ?? 'game_room_01';
  const seed = options.seed ?? 'room-seed-fixed-01';
  const p1Id = options.p1Id ?? 'user_p1';
  const p2Id = options.p2Id ?? 'user_p2';

  const created = createGame({
    seed,
    catalog: CARDS_RULES,
    rules: DEFAULT_RULES_CONFIG,
    fixedInitiative: 'P1',
    decks: {
      P1: SAMPLE_DECK,
      P2: SAMPLE_DECK,
    },
  });

  repo.createGameRecord({
    id: gameId,
    seed,
    rules: created.state.rules,
    state: created.state,
    stateHash: stateHash(created.state),
    p1Id,
    p2Id,
  });

  const room = new GameRoom({
    gameId,
    p1Id,
    p2Id,
    initialState: created.state,
    repository: repo,
    enableTimers: options.enableTimers ?? false,
    ...(options.disconnectGraceMs !== undefined
      ? { disconnectGraceMs: options.disconnectGraceMs }
      : {}),
  });

  return { room, initialState: created.state };
}

describe('GameRoom Actor (TECH-SPEC §6.1–6.3)', () => {
  let repo: SqliteRepository;

  beforeEach(() => {
    repo = new SqliteRepository(':memory:');
  });

  afterEach(() => {
    vi.useRealTimers();
    repo.close();
  });

  it('isola le seat e rifiuta gli estranei con MATCH_NOT_ACCESSIBLE su attach, command e resync', async () => {
    const { room } = createPersistedRoom(repo);
    const intruderSink = new MockClientSink('user_intruder');

    const attachedSeat = room.attachClient('user_intruder', intruderSink);
    expect(attachedSeat).toBeNull();
    expect(intruderSink.messages).toHaveLength(1);
    expect(intruderSink.messages[0]).toMatchObject({
      type: 'game.error',
      code: 'MATCH_NOT_ACCESSIBLE',
      retryable: false,
    });

    intruderSink.clear();
    const cmdOutcome = await room.handleCommand({
      playerId: 'user_intruder',
      commandId: 'cmd_intruder_1',
      expectedStateVersion: 0,
      command: { type: 'SubmitMulligan', cardUids: [] },
      replySink: intruderSink,
    });

    expect(cmdOutcome.ok).toBe(false);
    if (!cmdOutcome.ok) {
      expect(cmdOutcome.error.code).toBe('MATCH_NOT_ACCESSIBLE');
      expect(cmdOutcome.error.commandId).toBe('cmd_intruder_1');
    }

    intruderSink.clear();
    const resyncOk = await room.handleResync('user_intruder', 0, intruderSink);
    expect(resyncOk).toBe(false);
    expect(intruderSink.messages[0]).toMatchObject({
      type: 'game.error',
      code: 'MATCH_NOT_ACCESSIBLE',
    });

    room.dispose();
  });

  it('serializza i comandi concorrenti e gestisce STALE_STATE_VERSION (retryable: true) + game.snapshot', async () => {
    const { room } = createPersistedRoom(repo);
    const p1Sink = new MockClientSink('user_p1');
    const p2Sink = new MockClientSink('user_p2');

    room.attachClient('user_p1', p1Sink);
    room.attachClient('user_p2', p2Sink);
    p1Sink.clear();
    p2Sink.clear();

    // P1 e P2 inviano simultaneamente con expectedStateVersion = 0:
    // la coda sequenziale accetta il primo (versione 0 -> 1) e rifiuta il secondo con STALE_STATE_VERSION
    const [res1, res2] = await Promise.all([
      room.handleCommand({
        playerId: 'user_p1',
        commandId: 'cmd_p1_mulligan',
        expectedStateVersion: 0,
        command: { type: 'SubmitMulligan', cardUids: [] },
      }),
      room.handleCommand({
        playerId: 'user_p2',
        commandId: 'cmd_p2_mulligan_stale',
        expectedStateVersion: 0,
        command: { type: 'SubmitMulligan', cardUids: [] },
      }),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error.code).toBe('STALE_STATE_VERSION');
      expect(res2.error.retryable).toBe(true);
      expect(res2.error.commandId).toBe('cmd_p2_mulligan_stale');
    }

    // P2 deve aver ricevuto game.error(STALE_STATE_VERSION) seguito da game.snapshot aggiornato a stateVersion 1
    const p2ErrorMsg = p2Sink.messages.find((m) => m.type === 'game.error');
    const p2SnapshotMsg = p2Sink.messages.find(
      (m) => m.type === 'game.snapshot',
    );
    expect(p2ErrorMsg).toMatchObject({
      type: 'game.error',
      code: 'STALE_STATE_VERSION',
      retryable: true,
      commandId: 'cmd_p2_mulligan_stale',
    });
    expect(p2SnapshotMsg).toMatchObject({
      type: 'game.snapshot',
      gameId: room.gameId,
      stateVersion: 1,
    });

    // Ora P2 riprova con expectedStateVersion: 1 e transiziona a development (stateVersion 2)
    const res2Retry = await room.handleCommand({
      playerId: 'user_p2',
      commandId: 'cmd_p2_mulligan_ok',
      expectedStateVersion: 1,
      command: { type: 'SubmitMulligan', cardUids: [] },
    });
    expect(res2Retry.ok).toBe(true);
    expect(room.getStateVersion()).toBe(2);
    expect(room.getPhase()).toBe('development');

    room.dispose();
  });

  it('garantisce idempotenza su commandId (retry identico -> esito confermato; payload diverso -> IDEMPOTENCY_KEY_REUSED)', async () => {
    const { room, initialState } = createPersistedRoom(repo);
    const p1Sink = new MockClientSink('user_p1');
    room.attachClient('user_p1', p1Sink);
    p1Sink.clear();

    const firstCardUid = initialState.players.P1.hand[0]!.uid;

    const firstExec = await room.handleCommand({
      playerId: 'user_p1',
      commandId: 'cmd_idemp_1',
      expectedStateVersion: 0,
      command: { type: 'SubmitMulligan', cardUids: [firstCardUid] },
    });
    expect(firstExec.ok).toBe(true);
    if (firstExec.ok) {
      expect(firstExec.idempotentRetry).toBe(false);
      expect(firstExec.stateVersion).toBe(1);
    }

    // Retry con lo stesso commandId e lo stesso identico payload (anche se expectedStateVersion è ancora 0):
    // deve restituire l'esito già confermato senza incrementare stateVersion né duplicare righe nel DB
    const duplicateRetry = await room.handleCommand({
      playerId: 'user_p1',
      commandId: 'cmd_idemp_1',
      expectedStateVersion: 0,
      command: { type: 'SubmitMulligan', cardUids: [firstCardUid] },
    });
    expect(duplicateRetry.ok).toBe(true);
    if (duplicateRetry.ok) {
      expect(duplicateRetry.idempotentRetry).toBe(true);
      expect(duplicateRetry.stateVersion).toBe(1);
    }
    expect(room.getStateVersion()).toBe(1);
    expect(repo.listCommandsByGame(room.gameId)).toHaveLength(1);

    // Riuso dello stesso commandId ma con payload differente -> IDEMPOTENCY_KEY_REUSED
    const reusedDifferentPayload = await room.handleCommand({
      playerId: 'user_p1',
      commandId: 'cmd_idemp_1',
      expectedStateVersion: 1,
      command: { type: 'SubmitMulligan', cardUids: [] },
    });
    expect(reusedDifferentPayload.ok).toBe(false);
    if (!reusedDifferentPayload.ok) {
      expect(reusedDifferentPayload.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(reusedDifferentPayload.error.retryable).toBe(false);
    }

    room.dispose();
  });

  it('filtra rigorosamente PlayerView e GameEvent senza leak di uid o cardId segreti tra P1 e P2', async () => {
    const { room } = createPersistedRoom(repo);
    const p1Sink = new MockClientSink('user_p1');
    const p2Sink = new MockClientSink('user_p2');

    room.attachClient('user_p1', p1Sink);
    room.attachClient('user_p2', p2Sink);
    p1Sink.clear();
    p2Sink.clear();

    // Entrambi confermano mulligan
    await room.handleCommand({
      playerId: 'user_p1',
      commandId: 'm1',
      expectedStateVersion: 0,
      command: { type: 'SubmitMulligan', cardUids: [] },
    });
    await room.handleCommand({
      playerId: 'user_p2',
      commandId: 'm2',
      expectedStateVersion: 1,
      command: { type: 'SubmitMulligan', cardUids: [] },
    });

    // P1 gioca una carta da campo in Ciclo 1 di development
    const p1View = room.getViewForSeat('P1');
    const playableUid = p1View.self.legal.playableFieldCardUids[0];
    expect(playableUid).toBeDefined();

    p2Sink.clear();
    await room.handleCommand({
      playerId: 'user_p1',
      commandId: 'play_p1_1',
      expectedStateVersion: 2,
      command: { type: 'PlayCard', cardUid: playableUid! },
    });

    // Verifica anti-leak sui messaggi inviati a P2:
    // non devono mai contenere l'uid della carta giocata coperta da P1 né alcun uid in mano/mazzo di P1
    const p2Serialized = JSON.stringify(p2Sink.messages);
    expect(p2Serialized).not.toContain(playableUid!);
    for (const p1HandCard of room.getViewForSeat('P1').self.hand) {
      expect(p2Serialized).not.toContain(p1HandCard.uid);
    }

    room.dispose();
  });

  it('applica i timer di finestra (30s/45s/30s) e chiude la partita dopo 3 timeout consecutivi dello stesso giocatore', async () => {
    vi.useFakeTimers();
    const { room } = createPersistedRoom(repo, {
      enableTimers: true,
    });

    const p1Sink = new MockClientSink('user_p1');
    const p2Sink = new MockClientSink('user_p2');
    room.attachClient('user_p1', p1Sink);
    room.attachClient('user_p2', p2Sink);

    // 1° Timeout di P1: finestra mulligan (30s)
    // P2 conferma subito il mulligan; P1 lascia scadere i 30s
    await room.handleCommand({
      playerId: 'user_p2',
      commandId: 'p2_mull',
      expectedStateVersion: 0,
      command: { type: 'SubmitMulligan', cardUids: [] },
    });
    expect(room.getPhase()).toBe('mulligan');

    await vi.advanceTimersByTimeAsync(30_000);
    // Ora P1 ha subito 1 timeout (keep) e la partita è passata a development (toAct = P1)
    expect(room.getPhase()).toBe('development');
    expect(room.getViewForSeat('P1').toAct).toBe('P1');

    // 2° Timeout consecutivo di P1: opportunità in development (45s) -> Pass automatico per P1
    await vi.advanceTimersByTimeAsync(45_000);
    expect(room.getViewForSeat('P1').self.passed).toBe(true);
    expect(room.getViewForSeat('P2').toAct).toBe('P2');

    // P2 dichiara Pass manualmente -> la partita entra in prebattle
    await room.handleCommand({
      playerId: 'user_p2',
      commandId: 'p2_pass_dev',
      expectedStateVersion: room.getStateVersion(),
      command: { type: 'Pass' },
    });
    expect(room.getPhase()).toBe('prebattle');

    // P2 blocca subito le Istantanee; P1 lascia scadere i 30s di prebattle (3° timeout consecutivo!)
    await room.handleCommand({
      playerId: 'user_p2',
      commandId: 'p2_lock_pre',
      expectedStateVersion: room.getStateVersion(),
      command: { type: 'LockInstants', cardUids: [] },
    });

    await vi.advanceTimersByTimeAsync(30_000);

    // Dopo 3 timeout consecutivi di P1, la partita termina per abbandono con vittoria di P2
    expect(room.isFinished()).toBe(true);
    const finalRecord = repo.getGameById(room.gameId);
    expect(finalRecord?.status).toBe('FINISHED');
    expect(finalRecord?.result).toEqual({
      kind: 'timeout',
      winner: 'P2',
    });

    const p2EndedMsg = p2Sink.messages.find((m) => m.type === 'game.ended');
    expect(p2EndedMsg).toMatchObject({
      type: 'game.ended',
      gameId: room.gameId,
      result: {
        kind: 'timeout',
        winner: 'P2',
      },
    });

    room.dispose();
  });

  it('gestisce il grace period di disconnessione (60s): riconnessione entro 60s salva la partita, oltre 60s applica Concede', async () => {
    vi.useFakeTimers();
    const { room } = createPersistedRoom(repo, {
      enableTimers: true,
      disconnectGraceMs: 60_000,
    });

    const p1Sink = new MockClientSink('user_p1');
    const p2Sink = new MockClientSink('user_p2');
    room.attachClient('user_p1', p1Sink);
    room.attachClient('user_p2', p2Sink);

    // P1 si disconnette ma si riconnette dopo 20s (< 60s grace period)
    room.detachClient('user_p1', p1Sink);
    await vi.advanceTimersByTimeAsync(20_000);

    const p1ReconnectedSink = new MockClientSink('user_p1');
    const resyncOk = await room.handleResync(
      'user_p1',
      0,
      p1ReconnectedSink,
    );
    expect(resyncOk).toBe(true);
    expect(room.isFinished()).toBe(false);
    expect(
      p1ReconnectedSink.messages.some((m) => m.type === 'game.snapshot'),
    ).toBe(true);

    // Ora P1 si disconnette definitivamente e non rientra entro 60s
    // (Usiamo una seconda stanza con disconnectGraceMs di 10s < 30s finestra per isolare il trigger del grace period)
    const { room: room2 } = createPersistedRoom(repo, {
      gameId: 'game_room_disconnect_02',
      enableTimers: true,
      disconnectGraceMs: 10_000,
    });
    const r2p1 = new MockClientSink('user_p1');
    const r2p2 = new MockClientSink('user_p2');
    room2.attachClient('user_p1', r2p1);
    room2.attachClient('user_p2', r2p2);

    room2.detachClient('user_p1', r2p1);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(room2.isFinished()).toBe(true);
    const dbGame2 = repo.getGameById('game_room_disconnect_02');
    expect(dbGame2?.status).toBe('FINISHED');
    expect(dbGame2?.result).toEqual({
      kind: 'concession',
      winner: 'P2',
    });

    room.dispose();
    room2.dispose();
  });
});
