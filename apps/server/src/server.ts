// TECH-SPEC §6.1–6.5 — Server Fastify + Gateway WebSocket autoritativo:
// - Limite payload WebSocket 16 KB
// - Controllo Origin e CORS per il client web
// - Rate limiting per connessione
// - Logger pino con redazione dei segreti (token, seed, stato canonico)
// - Graceful shutdown con chiusura ordinata di RoomManager, Fastify e SQLite

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS_RULES } from '@epochs/content';
import type { CardRules, RulesConfig } from '@epochs/engine';
import {
  createGameErrorMessage,
  parseClientMessage,
  type ServerToClientMessage,
  type WelcomeMessage,
} from '@epochs/protocol';
import fastifyWebsocket, { type WebSocket } from '@fastify/websocket';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import pino from 'pino';
import { authenticateOrCreateGuest } from './auth/guest-session.js';
import type { GameRepository } from './db/repository.js';
import { SqliteRepository } from './db/sqlite-repository.js';
import type { RoomClientSink } from './rooms/game-room.js';
import { RoomManager } from './rooms/room-manager.js';
import { registerReplayAndDecksRoutes } from './routes/replay-and-decks.js';

export const MAX_WS_PAYLOAD_BYTES = 16 * 1024; // 16 KB (TECH-SPEC §6.5 riga 601)

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export interface RateLimitConfig {
  readonly maxMessages: number;
  readonly windowMs: number;
}

export const DEFAULT_WS_RATE_LIMIT: RateLimitConfig = Object.freeze({
  maxMessages: 120,
  windowMs: 10_000,
});

export interface CreateServerOptions {
  readonly repository?: GameRepository;
  readonly databasePath?: string;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly rulesConfig?: Partial<RulesConfig>;
  readonly clock?: () => number;
  readonly enableTimers?: boolean;
  readonly disconnectGraceMs?: number;
  readonly seedGenerator?: () => string;
  readonly roomCodeGenerator?: () => string;
  readonly allowedOrigins?: readonly string[];
  readonly maxPayloadBytes?: number;
  readonly rateLimit?: RateLimitConfig;
  readonly logLevel?: string;
  readonly logger?: FastifyBaseLogger | boolean;
}

export interface EpochsServerInstance {
  readonly app: FastifyInstance;
  readonly repository: GameRepository;
  readonly roomManager: RoomManager;
  start(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Crea un logger `pino` configurato per non registrare mai in chiaro token, seed o stati segreti (§6.5).
 */
export function createSafeLogger(level = 'info'): pino.Logger {
  return pino({
    level,
    redact: {
      paths: [
        'token',
        '*.token',
        'req.headers.authorization',
        'req.headers["x-guest-token"]',
        'seed',
        '*.seed',
        'canonical_state_json',
        '*.canonical_state_json',
        'deck',
        '*.deck',
        'cardUids',
        '*.cardUids',
        'cardUid',
        '*.cardUid',
        'sacrificeUid',
        '*.sacrificeUid',
      ],
      censor: '[REDACTED]',
    },
  });
}

export function parseAllowedOriginsEnv(
  envValue: string | undefined,
): readonly string[] {
  if (envValue === undefined || envValue.trim().length === 0) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return envValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isOriginAllowed(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (originHeader === undefined || originHeader.trim().length === 0) {
    return true;
  }
  if (allowedOrigins.includes('*')) {
    return true;
  }
  const normalized = originHeader.trim().replace(/\/+$/, '');
  return allowedOrigins.some(
    (allowed) => allowed.replace(/\/+$/, '') === normalized,
  );
}

function rawDataToByteLength(raw: unknown): number {
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw, 'utf8');
  }
  if (Buffer.isBuffer(raw)) {
    return raw.byteLength;
  }
  if (Array.isArray(raw)) {
    let total = 0;
    for (const chunk of raw) {
      if (Buffer.isBuffer(chunk)) {
        total += chunk.byteLength;
      }
    }
    return total;
  }
  if (raw instanceof ArrayBuffer) {
    return raw.byteLength;
  }
  return 0;
}

function rawDataToString(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(
      raw.filter((chunk): chunk is Buffer => Buffer.isBuffer(chunk)),
    ).toString('utf8');
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString('utf8');
  }
  return String(raw);
}

/**
 * Costruisce l'istanza completa del server Fastify + WebSocket per The Epochs.
 */
export async function createEpochsServer(
  options: CreateServerOptions = {},
): Promise<EpochsServerInstance> {
  const clock = options.clock ?? (() => Date.now());
  const catalog = options.catalog ?? CARDS_RULES;
  const maxPayloadBytes = options.maxPayloadBytes ?? MAX_WS_PAYLOAD_BYTES;
  const allowedOrigins =
    options.allowedOrigins ??
    parseAllowedOriginsEnv(process.env['ALLOWED_ORIGINS']);
  const rateLimit = options.rateLimit ?? DEFAULT_WS_RATE_LIMIT;

  const ownsRepository = options.repository === undefined;
  const repository: GameRepository =
    options.repository ??
    new SqliteRepository(
      options.databasePath ?? process.env['DATABASE_PATH'] ?? ':memory:',
    );

  const roomManager = new RoomManager({
    repository,
    catalog,
    ...(options.rulesConfig !== undefined
      ? { rulesConfig: options.rulesConfig }
      : {}),
    clock,
    ...(options.enableTimers !== undefined
      ? { enableTimers: options.enableTimers }
      : {}),
    ...(options.disconnectGraceMs !== undefined
      ? { disconnectGraceMs: options.disconnectGraceMs }
      : {}),
    ...(options.seedGenerator !== undefined
      ? { seedGenerator: options.seedGenerator }
      : {}),
    ...(options.roomCodeGenerator !== undefined
      ? { roomCodeGenerator: options.roomCodeGenerator }
      : {}),
  });

  const logLevel = options.logLevel ?? process.env['LOG_LEVEL'] ?? 'warn';
  const loggerOption =
    options.logger !== undefined
      ? options.logger
      : createSafeLogger(logLevel);

  const app: FastifyInstance =
    typeof loggerOption === 'boolean'
      ? Fastify({
          logger: loggerOption,
          bodyLimit: maxPayloadBytes,
        })
      : Fastify({
          loggerInstance: loggerOption as FastifyBaseLogger,
          bodyLimit: maxPayloadBytes,
        });

  // Controllo Origin e supporto CORS per le chiamate REST dal browser
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return reply
        .status(403)
        .send(
          createGameErrorMessage(
            'MATCH_NOT_ACCESSIBLE',
            'Origin non autorizzata.',
          ),
        );
    }

    if (typeof origin === 'string' && origin.length > 0) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      reply.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Guest-Token',
      );
    }

    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: maxPayloadBytes,
    },
  });

  // Registra endpoint REST (/api/v1/healthz, /api/v1/decks, /api/v1/games/:id/replay)
  registerReplayAndDecksRoutes(app, {
    repository,
    catalog,
    clock,
  });

  const handleWsConnection = (
    socket: WebSocket,
    request: FastifyRequest,
  ): void => {
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin, allowedOrigins)) {
      const errorMsg = createGameErrorMessage(
        'MATCH_NOT_ACCESSIBLE',
        'Origin WebSocket non autorizzata.',
      );
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(errorMsg));
      }
      socket.close(1008, 'Origin not allowed');
      return;
    }

    let authenticatedPlayerId: string | null = null;
    let windowStartMs = clock();
    let messagesInWindow = 0;
    let processingChain: Promise<void> = Promise.resolve();

    const sink: RoomClientSink = {
      get playerId(): string {
        return authenticatedPlayerId ?? 'unauthenticated';
      },
      send(message: ServerToClientMessage): void {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(message));
        }
      },
    };

    const checkRateLimit = (): boolean => {
      const now = clock();
      if (now - windowStartMs >= rateLimit.windowMs) {
        windowStartMs = now;
        messagesInWindow = 0;
      }
      messagesInWindow += 1;
      return messagesInWindow <= rateLimit.maxMessages;
    };

    const processRawMessage = async (rawData: unknown): Promise<void> => {
      if (!checkRateLimit()) {
        sink.send(
          createGameErrorMessage(
            'INTERNAL_ERROR',
            'Rate limit superato sulla connessione WebSocket.',
          ),
        );
        return;
      }

      const byteLen = rawDataToByteLength(rawData);
      if (byteLen > maxPayloadBytes) {
        sink.send(
          createGameErrorMessage(
            'INTERNAL_ERROR',
            `Payload WebSocket superiore al limite consentito (${maxPayloadBytes} byte).`,
          ),
        );
        socket.close(1009, 'Message too big');
        return;
      }

      const rawText = rawDataToString(rawData);
      const parsed = parseClientMessage(rawText);
      if (!parsed.ok) {
        sink.send(parsed.error);
        return;
      }

      const message = parsed.value;

      if (message.type === 'hello') {
        const session = authenticateOrCreateGuest(repository, {
          token: message.token,
          now: clock(),
        });
        authenticatedPlayerId = session.player.id;

        const welcome: WelcomeMessage = {
          type: 'welcome',
          token: session.token,
          serverTime: clock(),
          playerId: session.player.id,
          nickname: session.player.nickname,
        };
        sink.send(welcome);
        return;
      }

      if (authenticatedPlayerId === null) {
        const cmdId =
          message.type === 'game.command' ? message.commandId : undefined;
        sink.send(createGameErrorMessage('UNAUTHENTICATED', undefined, cmdId));
        return;
      }

      switch (message.type) {
        case 'room.create':
          roomManager.createPrivateRoom(authenticatedPlayerId, message, sink);
          return;

        case 'queue.join':
          roomManager.joinQueue(authenticatedPlayerId, message, sink);
          return;

        case 'game.command':
          await roomManager.handleGameCommand(
            authenticatedPlayerId,
            message,
            sink,
          );
          return;

        case 'game.resync':
          await roomManager.handleGameResync(
            authenticatedPlayerId,
            message,
            sink,
          );
          return;
      }
    };

    socket.on('message', (rawData: unknown) => {
      processingChain = processingChain
        .then(() => processRawMessage(rawData))
        .catch((err: unknown) => {
          app.log.error(
            { err: err instanceof Error ? err.message : 'Unknown WS error' },
            'Errore interno durante elaborazione messaggio WebSocket',
          );
          sink.send(createGameErrorMessage('INTERNAL_ERROR'));
        });
    });

    socket.on('error', (err: Error) => {
      app.log.warn({ err: err.message }, 'Errore socket client WebSocket');
    });

    socket.on('close', () => {
      if (authenticatedPlayerId !== null) {
        roomManager.handleClientDisconnect(authenticatedPlayerId, sink);
      }
    });
  };

  app.get('/ws', { websocket: true }, handleWsConnection);

  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;

    roomManager.dispose();

    if (app.websocketServer) {
      for (const client of app.websocketServer.clients) {
        try {
          client.close(1001, 'Server shutting down');
        } catch {
          // Ignora errori su socket già chiusi
        }
      }
    }

    await app.close();

    if (ownsRepository) {
      repository.close();
    }
  };

  const start = async (
    port = Number(process.env['PORT'] ?? 3000),
    host = '0.0.0.0',
  ): Promise<string> => {
    const address = await app.listen({ port, host });
    return address;
  };

  return {
    app,
    repository,
    roomManager,
    start,
    close,
  };
}

// Avvio standalone quando eseguito direttamente (`pnpm --filter @epochs/server start`)
const isMainModule = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) {
    return false;
  }
  try {
    return (
      path.resolve(process.argv[1]) ===
      path.resolve(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';

  createEpochsServer()
    .then(async (server) => {
      const shutdown = async (signal: string) => {
        server.app.log.info(
          { signal },
          'Ricevuto segnale di terminazione, avvio graceful shutdown...',
        );
        await server.close();
        process.exit(0);
      };

      process.once('SIGINT', () => void shutdown('SIGINT'));
      process.once('SIGTERM', () => void shutdown('SIGTERM'));

      const addr = await server.start(port, host);
      server.app.log.info({ address: addr }, 'Server The Epochs avviato');
    })
    .catch((err: unknown) => {
      console.error('Errore fatale avvio server:', err);
      process.exit(1);
    });
}
