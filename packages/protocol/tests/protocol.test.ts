import { describe, expect, it } from 'vitest';
import {
  apply,
  createGame,
  DEFAULT_RULES_CONFIG,
  playerView,
  projectEvent,
  stateHash,
  type CardRules,
} from '../../engine/src/index.js';
import rawRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import rawBalancedDeck from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import {
  ClientCommandSchema,
  ClientToServerMessageSchema,
  createGameErrorMessage,
  ERROR_CODE_DESCRIPTIONS_IT,
  ERROR_CODES,
  ErrorCodeSchema,
  GameCommandMessageSchema,
  GameDeadlineMessageSchema,
  GameEndedMessageSchema,
  GameErrorMessageSchema,
  GameEventSchema,
  GameEventsMessageSchema,
  GameResyncMessageSchema,
  GameSnapshotMessageSchema,
  HealthzResponseSchema,
  HelloMessageSchema,
  isRetryableErrorCode,
  MatchFoundMessageSchema,
  parseClientMessage,
  parseServerMessage,
  QueueJoinMessageSchema,
  ReplayPayloadSchema,
  RoomCreatedMessageSchema,
  RoomCreateMessageSchema,
  ServerToClientMessageSchema,
  WelcomeMessageSchema,
  type DeckPayload,
  type ErrorCode,
} from '../src/index.js';

const catalog = rawRulesJson as unknown as Record<string, CardRules>;
const validDeck = rawBalancedDeck as DeckPayload;

describe('@epochs/protocol — ErrorCode e utility di errore (§6.2)', () => {
  it('espone esattamente i 15 codici ErrorCode normativi con descrizione italiana', () => {
    const expectedCodes: readonly ErrorCode[] = [
      'UNAUTHENTICATED',
      'MATCH_NOT_ACCESSIBLE',
      'STALE_STATE_VERSION',
      'IDEMPOTENCY_KEY_REUSED',
      'INVALID_PHASE',
      'NOT_YOUR_TURN',
      'ALREADY_PASSED',
      'DECISION_ALREADY_LOCKED',
      'CARD_NOT_IN_HAND',
      'INSUFFICIENT_RESOURCES',
      'NO_LOGISTICS_SLOT',
      'NO_BUILDING_TO_SACRIFICE',
      'INVALID_DISCARD_COUNT',
      'INVALID_DECK',
      'INTERNAL_ERROR',
    ];

    expect(ERROR_CODES).toHaveLength(15);
    expect(ERROR_CODES).toEqual(expectedCodes);

    for (const code of expectedCodes) {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
      expect(ERROR_CODE_DESCRIPTIONS_IT[code].length).toBeGreaterThan(5);
      expect(isRetryableErrorCode(code)).toBe(code === 'STALE_STATE_VERSION');
    }

    expect(ErrorCodeSchema.safeParse('UNKNOWN_CODE').success).toBe(false);
  });

  it('costruisce correttamente messaggi game.error con e senza commandId/messaggio custom', () => {
    const errStale = createGameErrorMessage('STALE_STATE_VERSION');
    expect(errStale).toEqual({
      type: 'game.error',
      code: 'STALE_STATE_VERSION',
      message: ERROR_CODE_DESCRIPTIONS_IT.STALE_STATE_VERSION,
      retryable: true,
    });
    expect(GameErrorMessageSchema.safeParse(errStale).success).toBe(true);

    const errWithCmd = createGameErrorMessage(
      'NOT_YOUR_TURN',
      'Attendi il turno avversario.',
      'cmd-123',
    );
    expect(errWithCmd).toEqual({
      type: 'game.error',
      commandId: 'cmd-123',
      code: 'NOT_YOUR_TURN',
      message: 'Attendi il turno avversario.',
      retryable: false,
    });
    expect(GameErrorMessageSchema.safeParse(errWithCmd).success).toBe(true);
  });
});

describe('@epochs/protocol — Messaggi Client -> Server e controlli di sicurezza', () => {
  it('valida positivamente hello, room.create, queue.join (quick e private), game.command e game.resync', () => {
    expect(
      HelloMessageSchema.safeParse({
        type: 'hello',
        clientVersion: '1.0.0',
      }).success,
    ).toBe(true);

    expect(
      HelloMessageSchema.safeParse({
        type: 'hello',
        token: 'guest-token-abc-123',
        clientVersion: '1.0.0',
      }).success,
    ).toBe(true);

    expect(
      RoomCreateMessageSchema.safeParse({
        type: 'room.create',
        deck: validDeck,
      }).success,
    ).toBe(true);

    expect(
      QueueJoinMessageSchema.safeParse({
        type: 'queue.join',
        deck: validDeck,
        mode: 'quick',
      }).success,
    ).toBe(true);

    expect(
      QueueJoinMessageSchema.safeParse({
        type: 'queue.join',
        deck: validDeck,
        mode: 'private',
        roomCode: 'EPOCH1',
      }).success,
    ).toBe(true);

    expect(
      GameResyncMessageSchema.safeParse({
        type: 'game.resync',
        gameId: 'game-001',
        lastEventN: 0,
      }).success,
    ).toBe(true);

    const commands = [
      { type: 'SubmitMulligan', cardUids: ['u1', 'u2'] },
      { type: 'SubmitDiscard', cardUids: ['u3'] },
      { type: 'PlayCard', cardUid: 'u4' },
      { type: 'PlayConversion', cardUid: 'u5', sacrificeUid: 'b1' },
      { type: 'Pass' },
      { type: 'LockInstants', cardUids: ['i1', 'i2'] },
      { type: 'ApplyTimeout' },
      { type: 'Concede' },
    ] as const;

    for (const command of commands) {
      expect(ClientCommandSchema.safeParse(command).success).toBe(true);
      const msg = {
        type: 'game.command',
        gameId: 'game-001',
        commandId: 'cmd-001',
        expectedStateVersion: 4,
        command,
      };
      expect(GameCommandMessageSchema.safeParse(msg).success).toBe(true);
      expect(ClientToServerMessageSchema.safeParse(msg).success).toBe(true);
    }
  });

  it('rifiuta il tentativo di iniettare player dentro ClientCommand o campi extra non autorizzati', () => {
    const injectedPlayerCmd = {
      type: 'game.command',
      gameId: 'game-001',
      commandId: 'cmd-hack',
      expectedStateVersion: 1,
      command: {
        type: 'PlayCard',
        cardUid: 'c1',
        player: 'P1',
      },
    };
    expect(GameCommandMessageSchema.safeParse(injectedPlayerCmd).success).toBe(
      false,
    );
    expect(ClientToServerMessageSchema.safeParse(injectedPlayerCmd).success).toBe(
      false,
    );

    const extraTopField = {
      type: 'hello',
      clientVersion: '1.0.0',
      isAdmin: true,
    };
    expect(HelloMessageSchema.safeParse(extraTopField).success).toBe(false);
  });

  it('rifiuta expectedStateVersion negativo, lastEventN negativo, UID duplicati e incoerenze queue.join', () => {
    expect(
      GameCommandMessageSchema.safeParse({
        type: 'game.command',
        gameId: 'game-001',
        commandId: 'cmd-neg',
        expectedStateVersion: -1,
        command: { type: 'Pass' },
      }).success,
    ).toBe(false);

    expect(
      GameResyncMessageSchema.safeParse({
        type: 'game.resync',
        gameId: 'game-001',
        lastEventN: -5,
      }).success,
    ).toBe(false);

    // UID duplicati in SubmitMulligan
    expect(
      ClientCommandSchema.safeParse({
        type: 'SubmitMulligan',
        cardUids: ['c1', 'c1'],
      }).success,
    ).toBe(false);

    // Più di 8 carte in SubmitMulligan
    expect(
      ClientCommandSchema.safeParse({
        type: 'SubmitMulligan',
        cardUids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'],
      }).success,
    ).toBe(false);

    // queue.join private senza roomCode
    expect(
      QueueJoinMessageSchema.safeParse({
        type: 'queue.join',
        deck: validDeck,
        mode: 'private',
      }).success,
    ).toBe(false);

    // queue.join quick con roomCode
    expect(
      QueueJoinMessageSchema.safeParse({
        type: 'queue.join',
        deck: validDeck,
        mode: 'quick',
        roomCode: 'ROOM99',
      }).success,
    ).toBe(false);
  });

  it('parseClientMessage gestisce JSON malformato, mazzo invalido (INVALID_DECK) e riporta commandId in caso di errore', () => {
    const badJson = parseClientMessage('{not-valid-json');
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) {
      expect(badJson.error.code).toBe('INTERNAL_ERROR');
    }

    const invalidDeckMsg = parseClientMessage(
      JSON.stringify({
        type: 'room.create',
        deck: {
          name: 'Invalid',
          subdecks: { '1': ['e1_grn'], '2': [], '3': [] },
        },
      }),
    );
    expect(invalidDeckMsg.ok).toBe(false);
    if (!invalidDeckMsg.ok) {
      expect(invalidDeckMsg.error.code).toBe('INVALID_DECK');
    }

    const invalidCmdWithId = parseClientMessage({
      type: 'game.command',
      gameId: 'g1',
      commandId: 'cmd-err-42',
      expectedStateVersion: -1,
      command: { type: 'Pass' },
    });
    expect(invalidCmdWithId.ok).toBe(false);
    if (!invalidCmdWithId.ok) {
      expect(invalidCmdWithId.error.commandId).toBe('cmd-err-42');
    }

    const validHello = parseClientMessage(
      JSON.stringify({ type: 'hello', clientVersion: '1.0.0' }),
    );
    expect(validHello.ok).toBe(true);

    const validQueueJoin = parseClientMessage({
      type: 'queue.join',
      deck: validDeck,
      mode: 'quick',
    });
    expect(validQueueJoin.ok).toBe(true);

    const nonObjectClientMsg = parseClientMessage(null);
    expect(nonObjectClientMsg.ok).toBe(false);
  });
});

describe('@epochs/protocol — Messaggi Server -> Client e schemi REST', () => {
  it('valida tutti i messaggi S->C (welcome, room.created, match.found, game.snapshot, game.events, game.error, game.deadline, game.ended) e ReplayPayload', () => {
    const initial = createGame({
      seed: 'protocol-test-seed',
      catalog,
      decks: { P1: validDeck, P2: validDeck },
    });

    const step1 = apply(initial.state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;

    const p1View = playerView(step1.value.state, 'P1');
    const projectedEvents = step1.value.events
      .map((ev) => projectEvent(ev, 'P1'))
      .filter((ev) => ev !== null);
    const projectedInitialEvents = initial.events
      .map((ev) => projectEvent(ev, 'P1'))
      .filter((ev) => ev !== null);

    for (const ev of projectedInitialEvents) {
      expect(GameEventSchema.safeParse(ev).success).toBe(true);
    }

    const welcomeMsg = {
      type: 'welcome' as const,
      token: 'tok-xyz-987',
      serverTime: 1700000000000,
      playerId: 'player-1',
      nickname: 'Cartografo I',
    };
    expect(WelcomeMessageSchema.safeParse(welcomeMsg).success).toBe(true);

    const roomCreatedMsg = {
      type: 'room.created' as const,
      roomCode: 'STANZA1',
    };
    expect(RoomCreatedMessageSchema.safeParse(roomCreatedMsg).success).toBe(true);

    const matchFoundMsg = {
      type: 'match.found' as const,
      gameId: 'game-100',
      me: 'P1' as const,
      rules: DEFAULT_RULES_CONFIG,
      roomCode: 'STANZA1',
    };
    expect(MatchFoundMessageSchema.safeParse(matchFoundMsg).success).toBe(true);

    const snapshotMsg = {
      type: 'game.snapshot' as const,
      gameId: 'game-100',
      stateVersion: step1.value.state.stateVersion,
      eventN: step1.value.state.counters.event,
      view: p1View,
    };
    expect(GameSnapshotMessageSchema.safeParse(snapshotMsg).success).toBe(true);

    const eventsMsg = {
      type: 'game.events' as const,
      gameId: 'game-100',
      stateVersion: step1.value.state.stateVersion,
      fromN: projectedEvents[0]?.n ?? 1,
      events: projectedEvents,
      view: p1View,
    };
    expect(GameEventsMessageSchema.safeParse(eventsMsg).success).toBe(true);

    const deadlineMsg = {
      type: 'game.deadline' as const,
      phase: 'mulligan' as const,
      deadline: 1700000030000,
      serverTime: 1700000000000,
    };
    expect(GameDeadlineMessageSchema.safeParse(deadlineMsg).success).toBe(true);

    const endedMsg = {
      type: 'game.ended' as const,
      gameId: 'game-100',
      result: { kind: 'concession' as const, winner: 'P1' as const },
      view: p1View,
    };
    expect(GameEndedMessageSchema.safeParse(endedMsg).success).toBe(true);

    const allServerMessages = [
      welcomeMsg,
      roomCreatedMsg,
      matchFoundMsg,
      snapshotMsg,
      eventsMsg,
      createGameErrorMessage('UNAUTHENTICATED'),
      deadlineMsg,
      endedMsg,
    ];

    for (const srvMsg of allServerMessages) {
      expect(ServerToClientMessageSchema.safeParse(srvMsg).success).toBe(true);
      const parsed = parseServerMessage(JSON.stringify(srvMsg));
      expect(parsed.ok).toBe(true);
    }

    expect(parseServerMessage('{broken').ok).toBe(false);
    expect(parseServerMessage({ type: 'unknown.type' }).ok).toBe(false);

    // Verifica ReplayPayloadSchema e HealthzResponseSchema
    expect(
      HealthzResponseSchema.safeParse({
        status: 'ok',
        timestamp: 1700000000000,
        version: '1.0.0',
      }).success,
    ).toBe(true);

    expect(
      ReplayPayloadSchema.safeParse({
        gameId: 'game-100',
        perspective: 'P1',
        rules: DEFAULT_RULES_CONFIG,
        result: { kind: 'concession', winner: 'P1' },
        initialView: playerView(initial.state, 'P1'),
        initialEvents: projectedInitialEvents,
        steps: [
          {
            idx: 0,
            commandId: 'cmd-1',
            player: 'P1',
            command: { type: 'SubmitMulligan', cardUids: [] },
            expectedStateVersion: 0,
            resultingStateVersion: 1,
            stateHash: stateHash(step1.value.state),
            events: projectedEvents,
            view: p1View,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
