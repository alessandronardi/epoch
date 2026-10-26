// TECH-SPEC §6.2, §6.4, §6.5 — Endpoint REST:
// - GET /api/v1/healthz
// - CRUD mazzi utente (/api/v1/decks)
// - Replay deterministico GET /api/v1/games/:id/replay?as=P1|P2|public (solo per partite FINISHED)

import { randomUUID } from 'node:crypto';
import { CARDS_RULES } from '@epochs/content';
import {
  PLAYERS_ORDER,
  apply,
  createGame,
  isPublicBattleStage,
  playerView,
  projectEvent,
  stateHash,
  validateDeck,
  type CardInstance,
  type CardRules,
  type Command,
  type DeckPayload,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
} from '@epochs/engine';
import {
  DeckPayloadSchema,
  ReplayPayloadSchema,
  ReplayPerspectiveSchema,
  createGameErrorMessage,
  type ReplayPayload,
  type ReplayPerspective,
  type ReplayStep,
} from '@epochs/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  authenticateOrCreateGuest,
  resolvePlayerFromToken,
} from '../auth/guest-session.js';
import {
  RepositoryIntegrityError,
  type GameCommandLogRecord,
  type GameRecord,
  type GameRepository,
  type PlayerRecord,
} from '../db/repository.js';

export const SERVER_VERSION = '1.0.0';

const SaveDeckBodySchema = z.union([
  z
    .object({
      id: z.string().trim().min(1).max(128).optional(),
      name: z.string().trim().min(1).max(60).optional(),
      deck: DeckPayloadSchema,
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).max(128).optional(),
      name: z.string().trim().min(1).max(60).optional(),
      payload: DeckPayloadSchema,
    })
    .strict(),
  DeckPayloadSchema,
]);

const GuestSessionBodySchema = z
  .object({
    token: z.string().trim().min(1).max(512).optional(),
    nickname: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export interface ReplayAndDecksRouteOptions {
  readonly repository: GameRepository;
  readonly catalog?: Readonly<Record<string, CardRules>>;
  readonly clock?: () => number;
  readonly version?: string;
}

function parseUidNumericSuffix(uid: string): number {
  const parts = uid.split('_');
  const last = parts[parts.length - 1];
  const parsed = last !== undefined ? Number.parseInt(last, 10) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Estrae i 2 mazzi iniziali (`DeckPayload` per `P1` e `P2`) dallo stato persistito della partita
 * sfruttando la Legge di Conservazione delle 60 carte (Invariante 4 §10.2) e l'ordine monotono degli `uid`.
 */
export function extractInitialDecksFromGameState(
  state: Readonly<GameState>,
  catalog: Readonly<Record<string, CardRules>>,
): Record<PlayerId, DeckPayload> {
  const result = {} as Record<PlayerId, DeckPayload>;

  for (const player of PLAYERS_ORDER) {
    const pState = state.players[player];
    const allCards: CardInstance[] = [
      ...pState.hand,
      ...pState.subdecks[1],
      ...pState.subdecks[2],
      ...pState.subdecks[3],
      ...pState.buildings,
      ...pState.units,
      ...pState.discard,
    ];

    allCards.sort(
      (a, b) => parseUidNumericSuffix(a.uid) - parseUidNumericSuffix(b.uid),
    );

    const subdecks: { '1': string[]; '2': string[]; '3': string[] } = {
      '1': [],
      '2': [],
      '3': [],
    };

    for (const card of allCards) {
      const rules = catalog[card.cardId];
      const era = rules?.era ?? 1;
      const key = String(era) as '1' | '2' | '3';
      subdecks[key].push(card.cardId);
    }

    result[player] = {
      id: `reconstructed_${player.toLowerCase()}`,
      name: `Mazzo ${player}`,
      subdecks,
    };
  }

  return result;
}

/**
 * Proietta lo stato canonico nella `PlayerView` per la prospettiva del replay (`P1`, `P2` o `public`).
 * Nella prospettiva `'public'` anche i campi privati di `self` vengono oscurati secondo la matrice §5.3 e D3.
 */
export function projectViewForReplayPerspective(
  state: Readonly<GameState>,
  perspective: ReplayPerspective,
): PlayerView {
  if (perspective === 'P1' || perspective === 'P2') {
    return playerView(state, perspective);
  }

  const base = playerView(state, 'P1');
  const revealedStage = isPublicBattleStage(state);
  const publicDiscardIds = new Set(state.players.P1.publicDiscard);

  return {
    ...base,
    self: {
      ...base.self,
      hand: [],
      resources: revealedStage
        ? base.self.resources
        : { food: 0, wood: 0, metal: 0 },
      buildings: [],
      units: revealedStage
        ? base.self.units.filter((u) => u.revealed)
        : [],
      discard: base.self.discard.filter((c) => publicDiscardIds.has(c.cardId)),
      legal: {
        phase: state.phase,
        canAct: false,
        canSubmitMulligan: false,
        maxMulliganCards: 0,
        canSubmitDiscard: false,
        mustDiscardCount: 0,
        canPass: false,
        canLockInstants: false,
        playableFieldCardUids: [],
        playableConversionUids: [],
        sacrificableBuildingUids: [],
        playableInstantUids: [],
        handPlayability: {},
      },
    },
  };
}

/**
 * Proietta una sequenza di eventi canonici per la prospettiva del replay (`P1`, `P2` o `public`).
 * Nella prospettiva `'public'` ogni evento viene filtrato attraverso sia `P1` sia `P2`,
 * mantenendo solo le informazioni pubblicamente visibili a entrambi.
 */
export function projectEventsForReplayPerspective(
  events: readonly GameEvent[],
  perspective: ReplayPerspective,
): GameEvent[] {
  if (perspective === 'P1' || perspective === 'P2') {
    return events
      .map((ev) => projectEvent(ev, perspective))
      .filter((ev): ev is GameEvent => ev !== null);
  }

  const projectedPublic: GameEvent[] = [];
  for (const ev of events) {
    const forP1 = projectEvent(ev, 'P1');
    if (forP1 === null) {
      continue;
    }
    const forBoth = projectEvent(forP1, 'P2');
    if (forBoth !== null) {
      projectedPublic.push(forBoth);
    }
  }
  return projectedPublic;
}

function buildInitialReplayState(
  record: GameRecord,
  commands: readonly GameCommandLogRecord[],
  catalog: Readonly<Record<string, CardRules>>,
): { state: GameState; events: GameEvent[] } {
  const decks = extractInitialDecksFromGameState(record.state, catalog);

  const candidates: Array<PlayerId | undefined> = [undefined, 'P1', 'P2'];
  for (const fixedInit of candidates) {
    const created = createGame({
      seed: record.seed,
      catalog,
      rules: record.rules,
      decks,
      ...(fixedInit !== undefined ? { fixedInitiative: fixedInit } : {}),
    });

    if (commands.length === 0) {
      if (stateHash(created.state) === record.stateHash) {
        return created;
      }
      continue;
    }

    const firstCmd = commands[0]!;
    const engineCmd: Command = {
      ...firstCmd.command,
      player: firstCmd.player,
    };
    const applied = apply(created.state, engineCmd);
    if (
      applied.ok &&
      stateHash(applied.value.state) === firstCmd.stateHash
    ) {
      return created;
    }
  }

  return createGame({
    seed: record.seed,
    catalog,
    rules: record.rules,
    decks,
  });
}

/**
 * Ricostruisce deterministicamente una partita conclusa (`FINISHED`) a partire da
 * `seed` + `rules_json` + `game_commands`, verificando `stateHash` ad ogni passo e sullo stato finale (§6.4).
 */
export function reconstructGameReplay(
  record: GameRecord,
  commands: readonly GameCommandLogRecord[],
  perspective: ReplayPerspective,
  catalog: Readonly<Record<string, CardRules>> = CARDS_RULES,
): ReplayPayload {
  const initial = buildInitialReplayState(record, commands, catalog);
  let currentState = initial.state;

  const initialView = projectViewForReplayPerspective(currentState, perspective);
  const initialEvents = projectEventsForReplayPerspective(
    initial.events,
    perspective,
  );

  const steps: ReplayStep[] = [];

  for (const cmdLog of commands) {
    if (currentState.stateVersion !== cmdLog.expectedVersion) {
      throw new Error(
        `Mismatch expectedVersion durante il replay della partita "${record.id}" al passo idx=${cmdLog.idx}: atteso ${cmdLog.expectedVersion}, trovato ${currentState.stateVersion}.`,
      );
    }

    const engineCommand: Command = {
      ...cmdLog.command,
      player: cmdLog.player,
    };

    const transition = apply(currentState, engineCommand);
    if (!transition.ok) {
      throw new Error(
        `Comando non valido durante la ricostruzione replay di "${record.id}" (idx=${cmdLog.idx}, cmd=${cmdLog.command.type}): ${transition.error.code} - ${transition.error.message}`,
      );
    }

    const nextState = transition.value.state;
    const computedStepHash = stateHash(nextState);
    if (computedStepHash !== cmdLog.stateHash) {
      throw new RepositoryIntegrityError(
        record.id,
        cmdLog.stateHash,
        computedStepHash,
      );
    }

    if (nextState.stateVersion !== cmdLog.resultingVersion) {
      throw new Error(
        `Mismatch resultingVersion durante il replay di "${record.id}" (idx=${cmdLog.idx}): atteso ${cmdLog.resultingVersion}, calcolato ${nextState.stateVersion}.`,
      );
    }

    const stepEvents = projectEventsForReplayPerspective(
      transition.value.events,
      perspective,
    );
    const stepView = projectViewForReplayPerspective(nextState, perspective);

    steps.push({
      idx: cmdLog.idx,
      commandId: cmdLog.commandId,
      player: cmdLog.player,
      command: structuredClone(cmdLog.command),
      expectedStateVersion: cmdLog.expectedVersion,
      resultingStateVersion: cmdLog.resultingVersion,
      stateHash: computedStepHash,
      events: stepEvents,
      view: stepView,
    });

    currentState = nextState;
  }

  const finalComputedHash = stateHash(currentState);
  if (finalComputedHash !== record.stateHash) {
    throw new RepositoryIntegrityError(
      record.id,
      record.stateHash,
      finalComputedHash,
    );
  }

  const finalResult = currentState.result ?? record.result;
  if (finalResult === null) {
    throw new Error(
      `La partita "${record.id}" non presenta un GameResult finale valido al termine del replay.`,
    );
  }

  const payload: ReplayPayload = {
    gameId: record.id,
    perspective,
    rules: structuredClone(record.rules),
    result: structuredClone(finalResult),
    initialView,
    initialEvents,
    steps,
  };

  return ReplayPayloadSchema.parse(payload);
}

function extractRequestPlayer(
  request: FastifyRequest,
  repository: GameRepository,
): PlayerRecord | null {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const resolved = resolvePlayerFromToken(repository, authHeader);
    if (resolved !== null) {
      return resolved;
    }
  }

  const guestTokenHeader = request.headers['x-guest-token'];
  if (
    typeof guestTokenHeader === 'string' &&
    guestTokenHeader.trim().length > 0
  ) {
    return resolvePlayerFromToken(repository, guestTokenHeader);
  }

  return null;
}

/**
 * Registra le route REST `/api/v1/healthz`, `/api/v1/session/guest`, `/api/v1/decks` e `/api/v1/games/:id/replay`.
 */
export function registerReplayAndDecksRoutes(
  app: FastifyInstance,
  options: ReplayAndDecksRouteOptions,
): void {
  const { repository } = options;
  const catalog = options.catalog ?? CARDS_RULES;
  const clock = options.clock ?? (() => Date.now());
  const version = options.version ?? SERVER_VERSION;

  // 1. Healthcheck endpoint (§6.5 riga 603)
  app.get('/api/v1/healthz', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok' as const,
      timestamp: clock(),
      version,
    });
  });

  // 2. Endpoint di supporto per creare/rinnovare sessione ospite via REST
  app.post('/api/v1/session/guest', async (request, reply) => {
    const parsedBody = GuestSessionBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply
        .status(400)
        .send(
          createGameErrorMessage(
            'INTERNAL_ERROR',
            parsedBody.error.issues[0]?.message ?? 'Richiesta non valida.',
          ),
        );
    }

    const session = authenticateOrCreateGuest(repository, {
      token: parsedBody.data.token,
      preferredNickname: parsedBody.data.nickname,
      now: clock(),
    });

    return reply.status(200).send({
      token: session.token,
      serverTime: clock(),
      playerId: session.player.id,
      nickname: session.player.nickname,
    });
  });

  // 3. Elenco dei mazzi salvati dall'utente autenticato
  app.get('/api/v1/decks', async (request, reply) => {
    const player = extractRequestPlayer(request, repository);
    if (player === null) {
      return reply
        .status(401)
        .send(createGameErrorMessage('UNAUTHENTICATED'));
    }

    const decks = repository.listDecksByPlayer(player.id);
    return reply.status(200).send({ decks });
  });

  // Helper condiviso per POST /api/v1/decks e PUT /api/v1/decks/:id
  const handleUpsertDeck = async (
    request: FastifyRequest,
    reply: FastifyReply,
    explicitDeckId?: string,
  ) => {
    const player = extractRequestPlayer(request, repository);
    if (player === null) {
      return reply
        .status(401)
        .send(createGameErrorMessage('UNAUTHENTICATED'));
    }

    const parsedBody = SaveDeckBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply
        .status(400)
        .send(
          createGameErrorMessage(
            'INVALID_DECK',
            parsedBody.error.issues[0]?.message ?? 'Formato mazzo non valido.',
          ),
        );
    }

    const bodyData = parsedBody.data;
    const deckPayload: DeckPayload =
      'deck' in bodyData
        ? bodyData.deck
        : 'payload' in bodyData
          ? bodyData.payload
          : bodyData;

    const validationIssues = validateDeck(deckPayload, catalog);
    if (validationIssues.length > 0) {
      return reply
        .status(400)
        .send(
          createGameErrorMessage(
            'INVALID_DECK',
            validationIssues[0]!.message,
          ),
        );
    }

    const deckId =
      explicitDeckId ??
      ('id' in bodyData && typeof bodyData.id === 'string'
        ? bodyData.id
        : undefined) ??
      deckPayload.id ??
      `deck_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const deckName =
      ('name' in bodyData && typeof bodyData.name === 'string'
        ? bodyData.name
        : undefined) ?? deckPayload.name;

    try {
      const saved = repository.saveDeck({
        id: deckId,
        playerId: player.id,
        name: deckName,
        payload: {
          ...deckPayload,
          id: deckId,
          name: deckName,
        },
        catalogVersion: '1.0',
        updatedAt: clock(),
      });

      return reply.status(explicitDeckId ? 200 : 201).send({ deck: saved });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Impossibile salvare il mazzo richiesto.';
      return reply
        .status(403)
        .send(createGameErrorMessage('MATCH_NOT_ACCESSIBLE', message));
    }
  };

  app.post('/api/v1/decks', async (request, reply) => {
    return handleUpsertDeck(request, reply);
  });

  app.put<{ Params: { id: string } }>(
    '/api/v1/decks/:id',
    async (request, reply) => {
      const id = request.params.id.trim();
      if (id.length === 0) {
        return reply
          .status(400)
          .send(createGameErrorMessage('INVALID_DECK', 'ID mazzo mancante.'));
      }
      return handleUpsertDeck(request, reply, id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/decks/:id',
    async (request, reply) => {
      const player = extractRequestPlayer(request, repository);
      if (player === null) {
        return reply
          .status(401)
          .send(createGameErrorMessage('UNAUTHENTICATED'));
      }

      const deleted = repository.deleteDeck(request.params.id, player.id);
      if (!deleted) {
        return reply
          .status(404)
          .send(
            createGameErrorMessage(
              'MATCH_NOT_ACCESSIBLE',
              'Mazzo non trovato o non appartenente al giocatore.',
            ),
          );
      }

      return reply.status(200).send({ deleted: true });
    },
  );

  // 4. Replay deterministico GET /api/v1/games/:id/replay?as=P1|P2|public (§6.4 riga 596, §6.5 riga 602)
  app.get<{
    Params: { id: string };
    Querystring: { as?: string };
  }>('/api/v1/games/:id/replay', async (request, reply) => {
    const gameId = request.params.id.trim();
    const rawAs = request.query.as ?? 'public';
    const perspectiveParse = ReplayPerspectiveSchema.safeParse(rawAs);

    if (!perspectiveParse.success) {
      return reply
        .status(400)
        .send(
          createGameErrorMessage(
            'INTERNAL_ERROR',
            'Parametro query "as" non valido. Valori ammessi: P1, P2, public.',
          ),
        );
    }

    const perspective = perspectiveParse.data;
    const gameRecord = repository.getGameById(gameId);

    if (gameRecord === null) {
      return reply
        .status(404)
        .send(
          createGameErrorMessage(
            'MATCH_NOT_ACCESSIBLE',
            `Partita "${gameId}" non trovata.`,
          ),
        );
    }

    // Regola bloccante §6.4 / §6.5: durante una partita ACTIVE nessuno può interrogare il replay
    // e né seed né canonical_state_json vengono mai esposti.
    if (gameRecord.status !== 'FINISHED') {
      return reply
        .status(403)
        .send(
          createGameErrorMessage(
            'MATCH_NOT_ACCESSIBLE',
            'Il replay deterministico è accessibile esclusivamente a partita conclusa (FINISHED).',
          ),
        );
    }

    const commands = repository.listCommandsByGame(gameId);
    const replayPayload = reconstructGameReplay(
      gameRecord,
      commands,
      perspective,
      catalog,
    );

    return reply.status(200).send(replayPayload);
  });
}
