// TECH-SPEC §6.2, §6.4, §6.5 — Test d'integrazione per Server Fastify + WebSocket,
// /api/v1/healthz, CRUD mazzi, sicurezza Origin/RateLimit/16KB e Replay deterministico.

import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientCommand, DeckPayload } from '@epochs/engine';
import {
  HealthzResponseSchema,
  ReplayPayloadSchema,
  parseServerMessage,
  type ClientToServerMessage,
  type GameEventsMessage,
  type GameSnapshotMessage,
  type MatchFoundMessage,
  type RoomCreatedMessage,
  type ServerToClientMessage,
  type WelcomeMessage,
} from '@epochs/protocol';
import pino from 'pino';
import type { WebSocket } from '@fastify/websocket';
import aggroDeckJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedDeckJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import {
  createEpochsServer,
  type EpochsServerInstance,
} from '../src/server.js';

const DECK_BALANCED: DeckPayload = {
  id: balancedDeckJson.id,
  name: balancedDeckJson.name,
  description: balancedDeckJson.description,
  subdecks: balancedDeckJson.subdecks,
};

const DECK_AGGRO: DeckPayload = {
  id: aggroDeckJson.id,
  name: aggroDeckJson.name,
  description: aggroDeckJson.description,
  subdecks: aggroDeckJson.subdecks,
};

class WsTestClient {
  public readonly socket: WebSocket;
  public readonly messages: ServerToClientMessage[] = [];
  private readonly waiters: Array<{
    predicate: (msg: ServerToClientMessage) => boolean;
    resolve: (msg: ServerToClientMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  public constructor(socket: WebSocket) {
    this.socket = socket;
    this.socket.on('message', (raw: unknown) => {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      const parsed = parseServerMessage(text);
      if (!parsed.ok) {
        return;
      }
      const msg = parsed.value;

      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i]!;
        if (waiter.predicate(msg)) {
          clearTimeout(waiter.timer);
          this.waiters.splice(i, 1);
          waiter.resolve(msg);
          return;
        }
      }

      this.messages.push(msg);
    });
  }

  public send(message: ClientToServerMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  public sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  public waitFor<T extends ServerToClientMessage = ServerToClientMessage>(
    predicate: (msg: ServerToClientMessage) => msg is T,
    timeoutMs?: number,
  ): Promise<T>;
  public waitFor(
    predicate: (msg: ServerToClientMessage) => boolean,
    timeoutMs?: number,
  ): Promise<ServerToClientMessage>;
  public waitFor(
    predicate: (msg: ServerToClientMessage) => boolean,
    timeoutMs = 5_000,
  ): Promise<ServerToClientMessage> {
    const existingIdx = this.messages.findIndex(predicate);
    if (existingIdx !== -1) {
      const [found] = this.messages.splice(existingIdx, 1);
      return Promise.resolve(found!);
    }

    return new Promise<ServerToClientMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
        reject(
          new Error(
            `Timeout (${timeoutMs}ms) in attesa di messaggio WS. Messaggi in coda: ${JSON.stringify(
              this.messages.map((m) => m.type),
            )}`,
          ),
        );
      }, timeoutMs);

      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  public close(): void {
    if (this.socket.readyState === 1) {
      this.socket.close();
    }
  }
}

async function openTestClient(
  server: EpochsServerInstance,
  headers: Record<string, string> = { origin: 'http://127.0.0.1:5173' },
): Promise<WsTestClient> {
  let client!: WsTestClient;
  await server.app.injectWS('/ws', { headers }, {
    onInit: (ws) => {
      client = new WsTestClient(ws);
    },
  });
  return client;
}

describe('Fastify Server + WebSocket Gateway, CRUD Mazzi & Replay Deterministico (M5-07)', () => {
  let server: EpochsServerInstance;

  beforeEach(async () => {
    server = await createEpochsServer({
      databasePath: ':memory:',
      enableTimers: false,
      seedGenerator: () => 'server-ws-replay-fixed-seed-2026',
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      rateLimit: {
        maxMessages: 80,
        windowMs: 10_000,
      },
      logger: false,
    });
    await server.app.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it('risponde a GET /api/v1/healthz con schema HealthzResponse valido e gestisce CORS', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5173',
    );
    const parsed = HealthzResponseSchema.parse(res.json());
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('1.0.0');

    // Richiesta da Origin non autorizzata -> 403 MATCH_NOT_ACCESSIBLE
    const forbiddenRes = await server.app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: {
        origin: 'https://malicious.example.com',
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json()).toMatchObject({
      type: 'game.error',
      code: 'MATCH_NOT_ACCESSIBLE',
    });
  });

  it('gestisce il CRUD dei mazzi utente (/api/v1/decks) con autenticazione token, validazione INVALID_DECK e isolamento proprietario', async () => {
    // 1. Richiesta senza token -> 401 UNAUTHENTICATED
    const unauthRes = await server.app.inject({
      method: 'GET',
      url: '/api/v1/decks',
    });
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    // 2. Creazione di 2 sessioni ospite tramite /api/v1/session/guest
    const guest1Res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/guest',
      payload: { nickname: 'Cartografo Uno' },
    });
    expect(guest1Res.statusCode).toBe(200);
    const guest1 = guest1Res.json() as { token: string; playerId: string };

    const guest2Res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/session/guest',
      payload: { nickname: 'Cartografo Due' },
    });
    const guest2 = guest2Res.json() as { token: string; playerId: string };

    // 3. Rifiuta mazzo invalido con 400 INVALID_DECK
    const invalidDeckRes = await server.app.inject({
      method: 'POST',
      url: '/api/v1/decks',
      headers: { authorization: `Bearer ${guest1.token}` },
      payload: {
        id: 'bad_deck',
        name: 'Mazzo Incompleto',
        subdecks: { '1': ['e1_farm'], '2': [], '3': [] },
      },
    });
    expect(invalidDeckRes.statusCode).toBe(400);
    expect(invalidDeckRes.json()).toMatchObject({
      type: 'game.error',
      code: 'INVALID_DECK',
    });

    // 4. Salvataggio mazzo valido per Guest 1
    const saveRes = await server.app.inject({
      method: 'PUT',
      url: '/api/v1/decks/custom_deck_1',
      headers: { authorization: `Bearer ${guest1.token}` },
      payload: {
        name: 'Mio Mazzo Bilanciato',
        deck: DECK_BALANCED,
      },
    });
    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json().deck).toMatchObject({
      id: 'custom_deck_1',
      playerId: guest1.playerId,
      name: 'Mio Mazzo Bilanciato',
    });

    // 5. Guest 2 tenta di sovrascrivere custom_deck_1 -> 403 MATCH_NOT_ACCESSIBLE
    const overwriteRes = await server.app.inject({
      method: 'PUT',
      url: '/api/v1/decks/custom_deck_1',
      headers: { authorization: `Bearer ${guest2.token}` },
      payload: {
        name: 'Tentativo Furto',
        deck: DECK_AGGRO,
      },
    });
    expect(overwriteRes.statusCode).toBe(403);

    // 6. Elenco mazzi per Guest 1 e cancellazione
    const listRes = await server.app.inject({
      method: 'GET',
      url: '/api/v1/decks',
      headers: { authorization: `Bearer ${guest1.token}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().decks).toHaveLength(1);

    const delRes = await server.app.inject({
      method: 'DELETE',
      url: '/api/v1/decks/custom_deck_1',
      headers: { authorization: `Bearer ${guest1.token}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ deleted: true });
  });

  it('applica i presidi di sicurezza WebSocket: UNAUTHENTICATED prima di hello, rate limiting e redazione logger pino', async () => {
    // Verifica redazione segreti su pino
    const loggedLines: string[] = [];
    const sinkStream = new Writable({
      write(chunk, _encoding, callback) {
        loggedLines.push(chunk.toString('utf8'));
        callback();
      },
    });
    const testLogger = pino(
      {
        level: 'info',
        redact: {
          paths: ['token', '*.token', 'seed', '*.seed', 'canonical_state_json'],
          censor: '[REDACTED]',
        },
      },
      sinkStream,
    );
    testLogger.info(
      {
        token: 'secret_guest_token_xyz',
        seed: 'secret_match_seed_999',
        canonical_state_json: '{"secret":true}',
      },
      'test log entry',
    );
    const combinedLogs = loggedLines.join('\n');
    expect(combinedLogs).not.toContain('secret_guest_token_xyz');
    expect(combinedLogs).not.toContain('secret_match_seed_999');
    expect(combinedLogs).toContain('[REDACTED]');

    // Connessione WS: invio comando prima di hello -> UNAUTHENTICATED
    const client = await openTestClient(server);
    client.send({
      type: 'room.create',
      deck: DECK_BALANCED,
    });
    const unauthErr = await client.waitFor((m) => m.type === 'game.error');
    expect(unauthErr).toMatchObject({
      type: 'game.error',
      code: 'UNAUTHENTICATED',
    });

    // Payload oltre 16 KB -> chiuso con codice 1009 (Message too big) dal gateway maxPayload 16 KB
    const closePromise = new Promise<number>((resolve) => {
      client.socket.once('close', (code: number) => resolve(code));
    });
    const oversizedPayload = JSON.stringify({
      type: 'hello',
      clientVersion: '1.0.0',
      token: 'x'.repeat(17 * 1024),
    });
    client.sendRaw(oversizedPayload);
    const closeCode = await closePromise;
    expect(closeCode).toBe(1009);

    // Verifica rate limiting su un server con soglia bassa (3 messaggi)
    const rateLimitedServer = await createEpochsServer({
      databasePath: ':memory:',
      enableTimers: false,
      rateLimit: { maxMessages: 3, windowMs: 60_000 },
      logger: false,
    });
    await rateLimitedServer.app.ready();

    const rlClient = await openTestClient(rateLimitedServer);
    for (let i = 0; i < 4; i++) {
      rlClient.send({ type: 'hello', clientVersion: '1.0.0' });
    }

    const rlError = await rlClient.waitFor((m) => m.type === 'game.error');
    expect(rlError).toMatchObject({
      type: 'game.error',
      code: 'INTERNAL_ERROR',
    });

    rlClient.close();
    await rateLimitedServer.close();
  });

  it('completa una partita intera via WebSocket, blocca il replay durante ACTIVE e ricostruisce il replay deterministico a partita FINISHED', async () => {
    const c1 = await openTestClient(server);
    const c2 = await openTestClient(server);

    // 1. Handshake hello -> welcome per entrambi i client
    c1.send({ type: 'hello', clientVersion: '1.0.0' });
    c2.send({ type: 'hello', clientVersion: '1.0.0' });

    const welcome1 = await c1.waitFor(
      (m): m is WelcomeMessage => m.type === 'welcome',
    );
    const welcome2 = await c2.waitFor(
      (m): m is WelcomeMessage => m.type === 'welcome',
    );
    expect(welcome1.token.length).toBeGreaterThanOrEqual(32);
    expect(welcome2.token.length).toBeGreaterThanOrEqual(32);

    // 2. Creazione stanza privata da C1 e join da C2
    c1.send({ type: 'room.create', deck: DECK_BALANCED });
    const roomCreated = await c1.waitFor(
      (m): m is RoomCreatedMessage => m.type === 'room.created',
    );
    const roomCode = roomCreated.roomCode;

    c2.send({
      type: 'queue.join',
      mode: 'private',
      roomCode,
      deck: DECK_AGGRO,
    });

    const match1 = await c1.waitFor(
      (m): m is MatchFoundMessage => m.type === 'match.found',
    );
    const match2 = await c2.waitFor(
      (m): m is MatchFoundMessage => m.type === 'match.found',
    );
    expect(match1.gameId).toBe(match2.gameId);
    expect(match1.me).toBe('P1');
    expect(match2.me).toBe('P2');

    const gameId = match1.gameId;

    const snap1 = await c1.waitFor(
      (m): m is GameSnapshotMessage => m.type === 'game.snapshot',
    );
    const snap2 = await c2.waitFor(
      (m): m is GameSnapshotMessage => m.type === 'game.snapshot',
    );

    let viewP1 = snap1.view;
    let viewP2 = snap2.view;

    // 3. Verifica che durante una partita ACTIVE il replay sia RIGOROSAMENTE BLOCCATO (403)
    for (const perspective of ['P1', 'P2', 'public'] as const) {
      const activeReplayRes = await server.app.inject({
        method: 'GET',
        url: `/api/v1/games/${gameId}/replay?as=${perspective}`,
      });
      expect(activeReplayRes.statusCode).toBe(403);
      const bodyText = activeReplayRes.body;
      expect(bodyText).not.toContain('server-ws-replay-fixed-seed-2026');
      expect(activeReplayRes.json()).toMatchObject({
        type: 'game.error',
        code: 'MATCH_NOT_ACCESSIBLE',
      });
    }

    // Helper per inviare un comando e sincronizzare le viste di entrambi i client via WS
    let commandCounter = 0;
    const sendStepAndSync = async (
      sender: 'P1' | 'P2',
      command: ClientCommand,
    ) => {
      const client = sender === 'P1' ? c1 : c2;
      const expectedVersion = viewP1.stateVersion;
      const commandId = `ws_cmd_${++commandCounter}`;

      client.send({
        type: 'game.command',
        gameId,
        commandId,
        expectedStateVersion: expectedVersion,
        command,
      });

      const [ev1, ev2] = await Promise.all([
        c1.waitFor(
          (m): m is GameEventsMessage =>
            m.type === 'game.events' && m.stateVersion === expectedVersion + 1,
        ),
        c2.waitFor(
          (m): m is GameEventsMessage =>
            m.type === 'game.events' && m.stateVersion === expectedVersion + 1,
        ),
      ]);

      viewP1 = ev1.view;
      viewP2 = ev2.view;
    };

    // 4. Mulligan Era I (P1 cambia 1 carta, P2 mantiene)
    const p1FirstCardUid = viewP1.self.hand[0]!.uid;
    await sendStepAndSync('P1', {
      type: 'SubmitMulligan',
      cardUids: [p1FirstCardUid],
    });
    await sendStepAndSync('P2', {
      type: 'SubmitMulligan',
      cardUids: [],
    });

    expect(viewP1.phase).toBe('development');

    // 5. Avanziamo lungo le 3 Ere giocando almeno una carta da campo e passando fino a `finished`
    let safetySteps = 0;
    let playedCardUid: string | null = null;

    while (viewP1.phase !== 'finished' && safetySteps < 60) {
      safetySteps += 1;

      if (viewP1.phase === 'hand_limit') {
        if (viewP1.self.legal.canSubmitDiscard) {
          const count = viewP1.self.legal.mustDiscardCount;
          const uids = viewP1.self.hand.slice(0, count).map((c) => c.uid);
          await sendStepAndSync('P1', { type: 'SubmitDiscard', cardUids: uids });
          continue;
        }
        if (viewP2.self.legal.canSubmitDiscard) {
          const count = viewP2.self.legal.mustDiscardCount;
          const uids = viewP2.self.hand.slice(0, count).map((c) => c.uid);
          await sendStepAndSync('P2', { type: 'SubmitDiscard', cardUids: uids });
          continue;
        }
      }

      if (viewP1.phase === 'development') {
        const actor = viewP1.toAct;
        expect(actor).not.toBeNull();
        const actorView = actor === 'P1' ? viewP1 : viewP2;

        if (
          playedCardUid === null &&
          actor === 'P1' &&
          actorView.self.legal.playableFieldCardUids.length > 0
        ) {
          const cardToPlay = actorView.self.legal.playableFieldCardUids[0]!;
          const handCard = actorView.self.hand.find((c) => c.uid === cardToPlay);
          if (handCard?.cardId.startsWith('e')) {
            playedCardUid = cardToPlay;
          }
          await sendStepAndSync('P1', {
            type: 'PlayCard',
            cardUid: cardToPlay,
          });
          if (playedCardUid === null) {
            playedCardUid = cardToPlay;
          }
          continue;
        }

        await sendStepAndSync(actor!, { type: 'Pass' });
        continue;
      }

      if (viewP1.phase === 'prebattle') {
        if (viewP1.self.legal.canLockInstants) {
          await sendStepAndSync('P1', { type: 'LockInstants', cardUids: [] });
          continue;
        }
        if (viewP2.self.legal.canLockInstants) {
          await sendStepAndSync('P2', { type: 'LockInstants', cardUids: [] });
          continue;
        }
      }
    }

    expect(viewP1.phase).toBe('finished');
    expect(viewP1.result).not.toBeNull();

    // Entrambi i client devono aver ricevuto game.ended
    const ended1 = await c1.waitFor((m) => m.type === 'game.ended');
    const ended2 = await c2.waitFor((m) => m.type === 'game.ended');
    expect(ended1).toMatchObject({
      type: 'game.ended',
      gameId,
      result: viewP1.result,
    });
    expect(ended2).toMatchObject({
      type: 'game.ended',
      gameId,
      result: viewP2.result,
    });

    // 6. Ora la partita è FINISHED: verifichiamo la ricostruzione deterministica del replay per P1, P2 e public
    const replayP1Res = await server.app.inject({
      method: 'GET',
      url: `/api/v1/games/${gameId}/replay?as=P1`,
    });
    expect(replayP1Res.statusCode).toBe(200);
    const replayP1 = ReplayPayloadSchema.parse(replayP1Res.json());
    expect(replayP1.gameId).toBe(gameId);
    expect(replayP1.perspective).toBe('P1');
    expect(replayP1.result).toEqual(viewP1.result);
    expect(replayP1.steps.length).toBe(commandCounter);
    expect(
      replayP1.steps[replayP1.steps.length - 1]?.resultingStateVersion,
    ).toBe(viewP1.stateVersion);

    // Verifica che il seed non compaia mai nel JSON di risposta
    expect(replayP1Res.body).not.toContain('server-ws-replay-fixed-seed-2026');

    const replayP2Res = await server.app.inject({
      method: 'GET',
      url: `/api/v1/games/${gameId}/replay?as=P2`,
    });
    expect(replayP2Res.statusCode).toBe(200);
    const replayP2 = ReplayPayloadSchema.parse(replayP2Res.json());
    expect(replayP2.perspective).toBe('P2');
    expect(replayP2.initialView.me).toBe('P2');

    // Nella vista iniziale (mulligan), P1 vede le proprie 8 carte ma non le carte in mano di P2
    expect(replayP1.initialView.self.hand).toHaveLength(8);
    for (const p2Card of replayP2.initialView.self.hand) {
      expect(JSON.stringify(replayP1.initialView)).not.toContain(p2Card.uid);
    }

    // Verifica prospettiva 'public': nessuna mano privata e nessun edificio economico coperto esposto
    const replayPublicRes = await server.app.inject({
      method: 'GET',
      url: `/api/v1/games/${gameId}/replay?as=public`,
    });
    expect(replayPublicRes.statusCode).toBe(200);
    const replayPublic = ReplayPayloadSchema.parse(replayPublicRes.json());
    expect(replayPublic.perspective).toBe('public');
    expect(replayPublic.initialView.self.hand).toEqual([]);
    expect(replayPublic.initialView.self.buildings).toEqual([]);

    c1.close();
    c2.close();
  });
});
