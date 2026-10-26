// TECH-SPEC §6.2 — Schemi Zod dei messaggi WebSocket/REST e ErrorCode per @epochs/protocol

import { z } from 'zod';
import type {
  ApplyTimeoutClientCommand,
  BattleOutcomeKind,
  BattlePhaseId,
  CardInstance,
  CardPlayability,
  ClientCommand,
  ConcedeClientCommand,
  DamageAssignment,
  DeckPayload,
  DeckSubdecks,
  EraNo,
  ErrorCode,
  GameEvent,
  GameResult,
  GameResultKind,
  LegalCommands,
  Line,
  LockInstantsClientCommand,
  PassClientCommand,
  PassReason,
  PendingWindow,
  Phase,
  PlayCardClientCommand,
  PlayConversionClientCommand,
  PlayerId,
  PlayerView,
  PublicUnitView,
  ResourceChangeReason,
  ResourceOverflowReason,
  Resources,
  Result,
  RulesConfig,
  SubmitDiscardClientCommand,
  SubmitMulliganClientCommand,
  TimeoutPolicyConfig,
  UnitInstance,
  UnplayableReason,
} from '../../engine/src/index.js';
import { DeckPayloadSchema } from '../../../data/schema/deck.schema.js';

export {
  DeckPayloadSchema,
  type ApplyTimeoutClientCommand,
  type BattleOutcomeKind,
  type BattlePhaseId,
  type CardInstance,
  type CardPlayability,
  type ClientCommand,
  type ConcedeClientCommand,
  type DamageAssignment,
  type DeckPayload,
  type DeckSubdecks,
  type EraNo,
  type ErrorCode,
  type GameEvent,
  type GameResult,
  type GameResultKind,
  type LegalCommands,
  type Line,
  type LockInstantsClientCommand,
  type PassClientCommand,
  type PassReason,
  type PendingWindow,
  type Phase,
  type PlayCardClientCommand,
  type PlayConversionClientCommand,
  type PlayerId,
  type PlayerView,
  type PublicUnitView,
  type ResourceChangeReason,
  type ResourceOverflowReason,
  type Resources,
  type Result,
  type RulesConfig,
  type SubmitDiscardClientCommand,
  type SubmitMulliganClientCommand,
  type TimeoutPolicyConfig,
  type UnitInstance,
  type UnplayableReason,
};

// ============================================================================
// 1. Codici errore strutturati normativi (TECH-SPEC §6.2, riga 568)
// ============================================================================

export const ERROR_CODES = [
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
] as const satisfies readonly ErrorCode[];

export const ErrorCodeSchema: z.ZodType<ErrorCode> = z.enum(ERROR_CODES);

export const ERROR_CODE_DESCRIPTIONS_IT: Readonly<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: 'Sessione non autenticata o token non valido.',
  MATCH_NOT_ACCESSIBLE: 'Partita non trovata o non autorizzata per questa sessione.',
  STALE_STATE_VERSION: 'Versione dello stato non allineata con il server.',
  IDEMPOTENCY_KEY_REUSED: 'Chiave di idempotenza commandId riutilizzata con un comando diverso.',
  INVALID_PHASE: 'Azione non consentita nella fase corrente della partita.',
  NOT_YOUR_TURN: 'Non è il tuo turno di azione.',
  ALREADY_PASSED: 'Hai già dichiarato Passo in questa Era.',
  DECISION_ALREADY_LOCKED: 'Hai già confermato la scelta per questa finestra simultanea.',
  CARD_NOT_IN_HAND: 'La carta selezionata non si trova nella tua mano.',
  INSUFFICIENT_RESOURCES: 'Risorse in magazzino insufficienti per coprire il costo.',
  NO_LOGISTICS_SLOT: 'Nessuno slot logistico disponibile in questa Era.',
  NO_BUILDING_TO_SACRIFICE: 'Edificio da sacrificare non valido o assente.',
  INVALID_DISCARD_COUNT: 'Il numero di carte selezionate per lo scarto non è valido.',
  INVALID_DECK: 'Il mazzo selezionato non rispetta i requisiti regolamentari (3x20 carte, max 3 copie).',
  INTERNAL_ERROR: 'Errore interno o messaggio di protocollo non valido.',
};

export function isRetryableErrorCode(code: ErrorCode): boolean {
  return code === 'STALE_STATE_VERSION';
}

// ============================================================================
// 2. Schemi primitivi e tipi condivisi con @epochs/engine
// ============================================================================

export const NonEmptyIdSchema = z.string().trim().min(1).max(128);

export const PlayerIdSchema: z.ZodType<PlayerId> = z.enum(['P1', 'P2']);

export const EraNoSchema: z.ZodType<EraNo> = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const LineSchema: z.ZodType<Line> = z.enum(['front', 'center', 'rear']);

export const PhaseSchema: z.ZodType<Phase> = z.enum([
  'mulligan',
  'hand_limit',
  'development',
  'prebattle',
  'finished',
]);

export const PendingWindowSchema: z.ZodType<PendingWindow> = z.enum([
  'mulligan',
  'hand_limit',
  'prebattle',
]);

export const ResourcesSchema: z.ZodType<Resources> = z
  .object({
    food: z.number().int().min(0),
    wood: z.number().int().min(0),
    metal: z.number().int().min(0),
  })
  .strict();

export const SignedResourcesDeltaSchema: z.ZodType<Resources> = z
  .object({
    food: z.number().int(),
    wood: z.number().int(),
    metal: z.number().int(),
  })
  .strict();

export const GameResultKindSchema: z.ZodType<GameResultKind> = z.enum([
  'annihilation',
  'points',
  'draw',
  'concession',
  'timeout',
]);

export const GameResultSchema: z.ZodType<GameResult> = z
  .object({
    kind: GameResultKindSchema,
    winner: z.union([PlayerIdSchema, z.literal('DRAW')]),
  })
  .strict();

export const TimeoutPolicyConfigSchema: z.ZodType<TimeoutPolicyConfig> = z
  .object({
    development: z.literal('pass'),
    mulligan: z.literal('keep'),
    prebattle: z.literal('none'),
    handLimit: z.literal('deterministic_policy'),
    seconds: z
      .object({
        mulligan: z.number().int().min(1),
        handLimit: z.number().int().min(1),
        development: z.number().int().min(1),
        prebattle: z.number().int().min(1),
      })
      .strict(),
    concedeAfterConsecutiveTimeouts: z.number().int().min(1),
  })
  .strict();

export const RulesConfigSchema: z.ZodType<RulesConfig> = z
  .object({
    gddVersion: z.literal('1.0'),
    eraScalingSource: z.enum(['card', 'current_era']),
    archerMeleeUsesEffectiveAtk: z.boolean(),
    seqAssignedAt: z.enum(['play', 'reveal']),
    autoPassWhenNoLegalPlay: z.boolean(),
    discardVisibility: z.enum(['hidden', 'public']),
    sacrificeVisibility: z.enum(['hidden', 'public']),
    timeoutPolicy: TimeoutPolicyConfigSchema,
  })
  .strict();

// ============================================================================
// 3. Schemi ClientCommand (senza campo 'player' — TECH-SPEC §6.2 regola 1)
// ============================================================================

function hasUniqueItems(items: readonly string[]): boolean {
  return new Set(items).size === items.length;
}

const UniqueCardUidsArraySchema = z
  .array(NonEmptyIdSchema)
  .max(15)
  .refine(hasUniqueItems, {
    message: 'cardUids non può contenere UID duplicati.',
  });

export const SubmitMulliganClientCommandSchema: z.ZodType<SubmitMulliganClientCommand> =
  z
    .object({
      type: z.literal('SubmitMulligan'),
      cardUids: UniqueCardUidsArraySchema.refine((arr) => arr.length <= 8, {
        message: 'SubmitMulligan accetta al massimo 8 carte.',
      }),
    })
    .strict();

export const SubmitDiscardClientCommandSchema: z.ZodType<SubmitDiscardClientCommand> =
  z
    .object({
      type: z.literal('SubmitDiscard'),
      cardUids: UniqueCardUidsArraySchema,
    })
    .strict();

export const PlayCardClientCommandSchema: z.ZodType<PlayCardClientCommand> = z
  .object({
    type: z.literal('PlayCard'),
    cardUid: NonEmptyIdSchema,
  })
  .strict();

export const PlayConversionClientCommandSchema: z.ZodType<PlayConversionClientCommand> =
  z
    .object({
      type: z.literal('PlayConversion'),
      cardUid: NonEmptyIdSchema,
      sacrificeUid: NonEmptyIdSchema,
    })
    .strict();

export const PassClientCommandSchema: z.ZodType<PassClientCommand> = z
  .object({
    type: z.literal('Pass'),
  })
  .strict();

export const LockInstantsClientCommandSchema: z.ZodType<LockInstantsClientCommand> =
  z
    .object({
      type: z.literal('LockInstants'),
      cardUids: UniqueCardUidsArraySchema,
    })
    .strict();

export const ApplyTimeoutClientCommandSchema: z.ZodType<ApplyTimeoutClientCommand> =
  z
    .object({
      type: z.literal('ApplyTimeout'),
    })
    .strict();

export const ConcedeClientCommandSchema: z.ZodType<ConcedeClientCommand> = z
  .object({
    type: z.literal('Concede'),
  })
  .strict();

export const ClientCommandSchema: z.ZodType<ClientCommand> = z.discriminatedUnion(
  'type',
  [
    SubmitMulliganClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'SubmitMulligan'>;
      cardUids: z.ZodType<string[]>;
    }>,
    SubmitDiscardClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'SubmitDiscard'>;
      cardUids: z.ZodType<string[]>;
    }>,
    PlayCardClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'PlayCard'>;
      cardUid: z.ZodType<string>;
    }>,
    PlayConversionClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'PlayConversion'>;
      cardUid: z.ZodType<string>;
      sacrificeUid: z.ZodType<string>;
    }>,
    PassClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'Pass'>;
    }>,
    LockInstantsClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'LockInstants'>;
      cardUids: z.ZodType<string[]>;
    }>,
    ApplyTimeoutClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'ApplyTimeout'>;
    }>,
    ConcedeClientCommandSchema as z.ZodObject<{
      type: z.ZodLiteral<'Concede'>;
    }>,
  ],
);

// ============================================================================
// 4. Schemi PlayerView e GameEvent per messaggi Server -> Client
// ============================================================================

export const CardInstanceSchema: z.ZodType<CardInstance> = z
  .object({
    uid: NonEmptyIdSchema,
    cardId: NonEmptyIdSchema,
    owner: PlayerIdSchema,
    drawnOrder: z.number().int().min(1),
  })
  .strict();

export const UnitInstanceSchema: z.ZodType<UnitInstance> = z
  .object({
    uid: NonEmptyIdSchema,
    cardId: NonEmptyIdSchema,
    owner: PlayerIdSchema,
    drawnOrder: z.number().int().min(1),
    seq: z.number().int().min(1),
    hp: z.number().int().min(0),
    line: LineSchema,
    atkMod: z.number().int(),
    revealed: z.boolean(),
  })
  .strict();

export const PublicUnitViewSchema: z.ZodType<PublicUnitView> = z
  .object({
    uid: NonEmptyIdSchema,
    cardId: NonEmptyIdSchema,
    owner: PlayerIdSchema,
    seq: z.number().int().min(1),
    hp: z.number().int().min(0),
    line: LineSchema,
    atkMod: z.number().int(),
    revealed: z.boolean(),
  })
  .strict();

export const UnplayableReasonSchema: z.ZodType<UnplayableReason> = z.enum([
  'no_slot',
  'insufficient_resources',
  'no_building_to_sacrifice',
  'wrong_phase',
  'already_passed',
  'already_committed',
]);

export const CardPlayabilitySchema: z.ZodType<CardPlayability> = z
  .object({
    playable: z.boolean(),
    reason: UnplayableReasonSchema.optional(),
  })
  .strict() as unknown as z.ZodType<CardPlayability>;

export const LegalCommandsSchema: z.ZodType<LegalCommands> = z
  .object({
    phase: PhaseSchema,
    canAct: z.boolean(),
    canSubmitMulligan: z.boolean(),
    maxMulliganCards: z.number().int().min(0),
    canSubmitDiscard: z.boolean(),
    mustDiscardCount: z.number().int().min(0),
    canPass: z.boolean(),
    canLockInstants: z.boolean(),
    playableFieldCardUids: z.array(NonEmptyIdSchema),
    playableConversionUids: z.array(NonEmptyIdSchema),
    sacrificableBuildingUids: z.array(NonEmptyIdSchema),
    playableInstantUids: z.array(NonEmptyIdSchema),
    handPlayability: z.record(NonEmptyIdSchema, CardPlayabilitySchema),
  })
  .strict();

const SubdeckCountsSchema: z.ZodType<Record<EraNo, number>> = z
  .object({
    '1': z.number().int().min(0),
    '2': z.number().int().min(0),
    '3': z.number().int().min(0),
  })
  .strict() as unknown as z.ZodType<Record<EraNo, number>>;

export const PlayerViewSchema: z.ZodType<PlayerView> = z
  .object({
    me: PlayerIdSchema,
    stateVersion: z.number().int().min(0),
    era: EraNoSchema,
    phase: PhaseSchema,
    cycle: z.number().int().min(0),
    initiative: PlayerIdSchema,
    toAct: PlayerIdSchema.nullable(),
    deadline: z.number().int().min(0).nullable(),
    self: z
      .object({
        hand: z.array(CardInstanceSchema),
        resources: ResourcesSchema,
        buildings: z.array(CardInstanceSchema),
        units: z.array(UnitInstanceSchema),
        discard: z.array(CardInstanceSchema),
        walls: z.number().int().min(0),
        cityHp: z.number().int(),
        cityMax: z.number().int().min(1),
        cityDamage: z.number().int().min(0),
        demBonus: z.number().int().min(0),
        slotsUsed: z.number().int().min(0),
        passed: z.boolean(),
        committed: z.boolean(),
        subdeckCounts: SubdeckCountsSchema,
        legal: LegalCommandsSchema,
      })
      .strict(),
    opponent: z
      .object({
        handCount: z.number().int().min(0),
        resources: ResourcesSchema.nullable(),
        coveredCount: z.number().int().min(0),
        units: z.array(PublicUnitViewSchema).nullable(),
        walls: z.number().int().min(0),
        cityHp: z.number().int(),
        cityMax: z.number().int().min(1),
        cityDamage: z.number().int().min(0),
        demBonus: z.number().int().min(0),
        slotsUsed: z.number().int().min(0),
        passed: z.boolean(),
        committed: z.boolean(),
        discardCount: z.number().int().min(0),
        publicDiscard: z.array(NonEmptyIdSchema),
        subdeckCounts: SubdeckCountsSchema,
      })
      .strict(),
    result: GameResultSchema.nullable(),
  })
  .strict();

export const ResourceChangeReasonSchema: z.ZodType<ResourceChangeReason> = z.enum([
  'initial',
  'harvest',
  'rent',
  'cost',
  'conversion',
  'raid',
]);

export const ResourceOverflowReasonSchema: z.ZodType<ResourceOverflowReason> =
  z.enum(['harvest', 'rent', 'conversion', 'raid']);

export const PassReasonSchema: z.ZodType<PassReason> = z.enum([
  'chosen',
  'no_legal_play',
  'timeout',
]);

export const BattlePhaseIdSchema: z.ZodType<BattlePhaseId> = z.enum([
  'phase1_volley',
  'phase2a_impale',
  'phase2b_impact',
  'phase3_melee',
]);

export const BattleOutcomeKindSchema: z.ZodType<BattleOutcomeKind> = z.enum([
  'winner',
  'mutual_annihilation',
  'stalemate',
]);

export const DamageAssignmentSchema: z.ZodType<DamageAssignment> = z
  .object({
    uid: NonEmptyIdSchema,
    damage: z.number().int().min(0),
  })
  .strict();

const PlayerNumberMapSchema = z
  .object({
    P1: z.number().int(),
    P2: z.number().int(),
  })
  .strict();

export const GameEventSchema: z.ZodType<GameEvent> = z.discriminatedUnion('type', [
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('GameStarted'),
      era: EraNoSchema,
      rulesetVersion: z.literal('1.0'),
      catalogVersion: z.literal('1.0'),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('InitiativeAssigned'),
      era: EraNoSchema,
      initiative: PlayerIdSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('CardsDrawn'),
      player: PlayerIdSchema,
      era: EraNoSchema,
      count: z.number().int().min(0),
      cards: z.array(CardInstanceSchema).optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('PlayerCommitted'),
      player: PlayerIdSchema,
      window: PendingWindowSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('MulliganResolved'),
      player: PlayerIdSchema,
      count: z.number().int().min(0),
      returnedCardUids: z.array(NonEmptyIdSchema).optional(),
      drawnCards: z.array(CardInstanceSchema).optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('EraStarted'),
      era: EraNoSchema,
      initiative: PlayerIdSchema,
      walls: PlayerNumberMapSchema,
      cityHp: PlayerNumberMapSchema,
      cityMax: PlayerNumberMapSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('HandLimitDiscarded'),
      player: PlayerIdSchema,
      count: z.number().int().min(0),
      cardUids: z.array(NonEmptyIdSchema).optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('ResourcesChanged'),
      player: PlayerIdSchema,
      reason: ResourceChangeReasonSchema,
      delta: SignedResourcesDeltaSchema,
      resources: ResourcesSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('ResourcesOverflowed'),
      player: PlayerIdSchema,
      reason: ResourceOverflowReasonSchema,
      overflow: ResourcesSchema,
      cap: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('CycleStarted'),
      era: EraNoSchema,
      cycle: z.number().int().min(1),
      toAct: PlayerIdSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('CardPlayed'),
      player: PlayerIdSchema,
      slotsUsed: z.number().int().min(0),
      coveredCount: z.number().int().min(0),
      uid: NonEmptyIdSchema.optional(),
      cardId: NonEmptyIdSchema.optional(),
      cardType: z.enum(['economy', 'unit']).optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('ConversionActivated'),
      player: PlayerIdSchema,
      uid: NonEmptyIdSchema,
      cardId: NonEmptyIdSchema,
      gain: ResourcesSchema,
      demBonusGained: z.number().int().min(0),
      coveredCount: z.number().int().min(0),
      sacrificeUid: NonEmptyIdSchema.optional(),
      sacrificeCardId: NonEmptyIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('PlayerPassed'),
      player: PlayerIdSchema,
      era: EraNoSchema,
      cycle: z.number().int().min(1),
      reason: PassReasonSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('DevelopmentEnded'),
      era: EraNoSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('UnitsRevealed'),
      era: EraNoSchema,
      units: z
        .object({
          P1: z.array(UnitInstanceSchema),
          P2: z.array(UnitInstanceSchema),
        })
        .strict(),
      resources: z
        .object({
          P1: ResourcesSchema,
          P2: ResourcesSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('InstantsRevealed'),
      era: EraNoSchema,
      played: z
        .object({
          P1: z.array(
            z.object({ uid: NonEmptyIdSchema, cardId: NonEmptyIdSchema }).strict(),
          ),
          P2: z.array(
            z.object({ uid: NonEmptyIdSchema, cardId: NonEmptyIdSchema }).strict(),
          ),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('WallsModified'),
      era: EraNoSchema,
      wallsBefore: PlayerNumberMapSchema,
      deltaOwn: PlayerNumberMapSchema,
      deltaEnemy: PlayerNumberMapSchema,
      wallsAfter: PlayerNumberMapSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('BattleStarted'),
      era: EraNoSchema,
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('BattlePhaseResolved'),
      era: EraNoSchema,
      phase: BattlePhaseIdSchema,
      meleeCycle: z.number().int().min(1).max(6).optional(),
      damageDealt: PlayerNumberMapSchema,
      assignments: z
        .object({
          P1: z.array(DamageAssignmentSchema),
          P2: z.array(DamageAssignmentSchema),
        })
        .strict(),
      casualties: z
        .object({
          P1: z.array(NonEmptyIdSchema),
          P2: z.array(NonEmptyIdSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('BattleOutcome'),
      era: EraNoSchema,
      kind: BattleOutcomeKindSchema,
      winner: PlayerIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('SiegeResolved'),
      era: EraNoSchema,
      attacker: PlayerIdSchema,
      defender: PlayerIdSchema,
      D: z.number().int().min(0),
      W: z.number().int().min(0),
      breach: z.boolean(),
      wallsAfter: z.number().int().min(0),
      directDamage: z.number().int().min(0),
      cityHpAfter: z.number().int(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('RaidResolved'),
      era: EraNoSchema,
      attacker: PlayerIdSchema,
      defender: PlayerIdSchema,
      foodTransferred: z.number().int().min(0),
      woodTransferred: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('EraEnded'),
      era: EraNoSchema,
      discardedUnitUids: z
        .object({
          P1: z.array(NonEmptyIdSchema),
          P2: z.array(NonEmptyIdSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      n: z.number().int().min(1),
      type: z.literal('GameEnded'),
      kind: GameResultKindSchema,
      winner: z.union([PlayerIdSchema, z.literal('DRAW')]),
    })
    .strict(),
]) as unknown as z.ZodType<GameEvent>;

// ============================================================================
// 5. Messaggi Client -> Server (TECH-SPEC §6.2)
// ============================================================================

export type QueueMode = 'quick' | 'private';
export const QueueModeSchema: z.ZodType<QueueMode> = z.enum(['quick', 'private']);

export interface HelloPayload {
  token?: string;
  clientVersion: string;
}

export interface HelloMessage extends HelloPayload {
  type: 'hello';
}

export const HelloPayloadSchema: z.ZodType<HelloPayload> = z
  .object({
    token: z.string().trim().min(1).max(512).optional(),
    clientVersion: z.string().trim().min(1).max(64),
  })
  .strict() as unknown as z.ZodType<HelloPayload>;

export const HelloMessageSchema: z.ZodType<HelloMessage> = z
  .object({
    type: z.literal('hello'),
    token: z.string().trim().min(1).max(512).optional(),
    clientVersion: z.string().trim().min(1).max(64),
  })
  .strict() as unknown as z.ZodType<HelloMessage>;

export interface QueueJoinPayload {
  deck: DeckPayload;
  mode: QueueMode;
  roomCode?: string;
}

export interface QueueJoinMessage extends QueueJoinPayload {
  type: 'queue.join';
}

function validateQueueJoinRoomCode(
  payload: { mode: QueueMode; roomCode?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (payload.mode === 'private' && payload.roomCode === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['roomCode'],
      message: 'roomCode è obbligatorio quando mode === "private".',
    });
  }
  if (payload.mode === 'quick' && payload.roomCode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['roomCode'],
      message: 'roomCode non deve essere specificato quando mode === "quick".',
    });
  }
}

const BaseQueueJoinPayloadSchema = z
  .object({
    deck: DeckPayloadSchema,
    mode: QueueModeSchema,
    roomCode: z.string().trim().min(4).max(32).optional(),
  })
  .strict();

export const QueueJoinPayloadSchema: z.ZodType<QueueJoinPayload> =
  BaseQueueJoinPayloadSchema.superRefine(
    validateQueueJoinRoomCode,
  ) as unknown as z.ZodType<QueueJoinPayload>;

const BaseQueueJoinMessageSchema = z
  .object({
    type: z.literal('queue.join'),
    deck: DeckPayloadSchema,
    mode: QueueModeSchema,
    roomCode: z.string().trim().min(4).max(32).optional(),
  })
  .strict();

export const QueueJoinMessageSchema: z.ZodType<QueueJoinMessage> =
  BaseQueueJoinMessageSchema.superRefine(
    validateQueueJoinRoomCode,
  ) as unknown as z.ZodType<QueueJoinMessage>;

export interface RoomCreatePayload {
  deck: DeckPayload;
}

export interface RoomCreateMessage extends RoomCreatePayload {
  type: 'room.create';
}

export const RoomCreatePayloadSchema: z.ZodType<RoomCreatePayload> = z
  .object({
    deck: DeckPayloadSchema,
  })
  .strict();

export const RoomCreateMessageSchema: z.ZodType<RoomCreateMessage> = z
  .object({
    type: z.literal('room.create'),
    deck: DeckPayloadSchema,
  })
  .strict();

export interface GameCommandPayload {
  gameId: string;
  commandId: string;
  expectedStateVersion: number;
  command: ClientCommand;
}

export interface GameCommandMessage extends GameCommandPayload {
  type: 'game.command';
}

export const GameCommandPayloadSchema: z.ZodType<GameCommandPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    commandId: NonEmptyIdSchema,
    expectedStateVersion: z.number().int().min(0),
    command: ClientCommandSchema,
  })
  .strict();

export const GameCommandMessageSchema: z.ZodType<GameCommandMessage> = z
  .object({
    type: z.literal('game.command'),
    gameId: NonEmptyIdSchema,
    commandId: NonEmptyIdSchema,
    expectedStateVersion: z.number().int().min(0),
    command: ClientCommandSchema,
  })
  .strict();

export interface GameResyncPayload {
  gameId: string;
  lastEventN: number;
}

export interface GameResyncMessage extends GameResyncPayload {
  type: 'game.resync';
}

export const GameResyncPayloadSchema: z.ZodType<GameResyncPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    lastEventN: z.number().int().min(0),
  })
  .strict();

export const GameResyncMessageSchema: z.ZodType<GameResyncMessage> = z
  .object({
    type: z.literal('game.resync'),
    gameId: NonEmptyIdSchema,
    lastEventN: z.number().int().min(0),
  })
  .strict();

export type ClientToServerMessage =
  | HelloMessage
  | QueueJoinMessage
  | RoomCreateMessage
  | GameCommandMessage
  | GameResyncMessage;

export type ClientMessage = ClientToServerMessage;

export const ClientToServerMessageSchema: z.ZodType<ClientToServerMessage> = z
  .union([
    HelloMessageSchema,
    QueueJoinMessageSchema,
    RoomCreateMessageSchema,
    GameCommandMessageSchema,
    GameResyncMessageSchema,
  ]);

export const ClientMessageSchema = ClientToServerMessageSchema;

// ============================================================================
// 6. Messaggi Server -> Client (TECH-SPEC §6.2)
// ============================================================================

export interface WelcomePayload {
  token: string;
  serverTime: number;
  playerId: string;
  nickname: string;
}

export interface WelcomeMessage extends WelcomePayload {
  type: 'welcome';
}

export const WelcomePayloadSchema: z.ZodType<WelcomePayload> = z
  .object({
    token: z.string().trim().min(1).max(512),
    serverTime: z.number().int().min(0),
    playerId: NonEmptyIdSchema,
    nickname: z.string().trim().min(1).max(40),
  })
  .strict();

export const WelcomeMessageSchema: z.ZodType<WelcomeMessage> = z
  .object({
    type: z.literal('welcome'),
    token: z.string().trim().min(1).max(512),
    serverTime: z.number().int().min(0),
    playerId: NonEmptyIdSchema,
    nickname: z.string().trim().min(1).max(40),
  })
  .strict();

export interface RoomCreatedPayload {
  roomCode: string;
}

export interface RoomCreatedMessage extends RoomCreatedPayload {
  type: 'room.created';
}

export const RoomCreatedPayloadSchema: z.ZodType<RoomCreatedPayload> = z
  .object({
    roomCode: z.string().trim().min(4).max(32),
  })
  .strict();

export const RoomCreatedMessageSchema: z.ZodType<RoomCreatedMessage> = z
  .object({
    type: z.literal('room.created'),
    roomCode: z.string().trim().min(4).max(32),
  })
  .strict();

export interface MatchFoundPayload {
  gameId: string;
  me: PlayerId;
  rules: RulesConfig;
  roomCode?: string;
}

export interface MatchFoundMessage extends MatchFoundPayload {
  type: 'match.found';
}

export const MatchFoundPayloadSchema: z.ZodType<MatchFoundPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    me: PlayerIdSchema,
    rules: RulesConfigSchema,
    roomCode: z.string().trim().min(4).max(32).optional(),
  })
  .strict() as unknown as z.ZodType<MatchFoundPayload>;

export const MatchFoundMessageSchema: z.ZodType<MatchFoundMessage> = z
  .object({
    type: z.literal('match.found'),
    gameId: NonEmptyIdSchema,
    me: PlayerIdSchema,
    rules: RulesConfigSchema,
    roomCode: z.string().trim().min(4).max(32).optional(),
  })
  .strict() as unknown as z.ZodType<MatchFoundMessage>;

export interface GameSnapshotPayload {
  gameId: string;
  stateVersion: number;
  eventN: number;
  view: PlayerView;
}

export interface GameSnapshotMessage extends GameSnapshotPayload {
  type: 'game.snapshot';
}

export const GameSnapshotPayloadSchema: z.ZodType<GameSnapshotPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    stateVersion: z.number().int().min(0),
    eventN: z.number().int().min(0),
    view: PlayerViewSchema,
  })
  .strict();

export const GameSnapshotMessageSchema: z.ZodType<GameSnapshotMessage> = z
  .object({
    type: z.literal('game.snapshot'),
    gameId: NonEmptyIdSchema,
    stateVersion: z.number().int().min(0),
    eventN: z.number().int().min(0),
    view: PlayerViewSchema,
  })
  .strict();

export interface GameEventsPayload {
  gameId: string;
  stateVersion: number;
  fromN: number;
  events: GameEvent[];
  view: PlayerView;
}

export interface GameEventsMessage extends GameEventsPayload {
  type: 'game.events';
}

export const GameEventsPayloadSchema: z.ZodType<GameEventsPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    stateVersion: z.number().int().min(0),
    fromN: z.number().int().min(0),
    events: z.array(GameEventSchema),
    view: PlayerViewSchema,
  })
  .strict();

export const GameEventsMessageSchema: z.ZodType<GameEventsMessage> = z
  .object({
    type: z.literal('game.events'),
    gameId: NonEmptyIdSchema,
    stateVersion: z.number().int().min(0),
    fromN: z.number().int().min(0),
    events: z.array(GameEventSchema),
    view: PlayerViewSchema,
  })
  .strict();

export interface GameErrorPayload {
  commandId?: string;
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface GameErrorMessage extends GameErrorPayload {
  type: 'game.error';
}

export const GameErrorPayloadSchema: z.ZodType<GameErrorPayload> = z
  .object({
    commandId: NonEmptyIdSchema.optional(),
    code: ErrorCodeSchema,
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict() as unknown as z.ZodType<GameErrorPayload>;

export const GameErrorMessageSchema: z.ZodType<GameErrorMessage> = z
  .object({
    type: z.literal('game.error'),
    commandId: NonEmptyIdSchema.optional(),
    code: ErrorCodeSchema,
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict() as unknown as z.ZodType<GameErrorMessage>;

export interface GameDeadlinePayload {
  phase: Phase;
  deadline: number;
  serverTime: number;
}

export interface GameDeadlineMessage extends GameDeadlinePayload {
  type: 'game.deadline';
}

export const GameDeadlinePayloadSchema: z.ZodType<GameDeadlinePayload> = z
  .object({
    phase: PhaseSchema,
    deadline: z.number().int().min(0),
    serverTime: z.number().int().min(0),
  })
  .strict();

export const GameDeadlineMessageSchema: z.ZodType<GameDeadlineMessage> = z
  .object({
    type: z.literal('game.deadline'),
    phase: PhaseSchema,
    deadline: z.number().int().min(0),
    serverTime: z.number().int().min(0),
  })
  .strict();

export interface GameEndedPayload {
  gameId: string;
  result: GameResult;
  view: PlayerView;
}

export interface GameEndedMessage extends GameEndedPayload {
  type: 'game.ended';
}

export const GameEndedPayloadSchema: z.ZodType<GameEndedPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    result: GameResultSchema,
    view: PlayerViewSchema,
  })
  .strict();

export const GameEndedMessageSchema: z.ZodType<GameEndedMessage> = z
  .object({
    type: z.literal('game.ended'),
    gameId: NonEmptyIdSchema,
    result: GameResultSchema,
    view: PlayerViewSchema,
  })
  .strict();

export type ServerToClientMessage =
  | WelcomeMessage
  | RoomCreatedMessage
  | MatchFoundMessage
  | GameSnapshotMessage
  | GameEventsMessage
  | GameErrorMessage
  | GameDeadlineMessage
  | GameEndedMessage;

export type ServerMessage = ServerToClientMessage;

export const ServerToClientMessageSchema: z.ZodType<ServerToClientMessage> = z
  .union([
    WelcomeMessageSchema,
    RoomCreatedMessageSchema,
    MatchFoundMessageSchema,
    GameSnapshotMessageSchema,
    GameEventsMessageSchema,
    GameErrorMessageSchema,
    GameDeadlineMessageSchema,
    GameEndedMessageSchema,
  ]);

export const ServerMessageSchema = ServerToClientMessageSchema;

// ============================================================================
// 7. Schemi REST di supporto (TECH-SPEC §6.4, §6.5) e helper di parsing
// ============================================================================

export type ReplayPerspective = 'P1' | 'P2' | 'public';
export const ReplayPerspectiveSchema: z.ZodType<ReplayPerspective> = z.enum([
  'P1',
  'P2',
  'public',
]);

export interface ReplayStep {
  idx: number;
  commandId: string;
  player: PlayerId;
  command: ClientCommand;
  expectedStateVersion: number;
  resultingStateVersion: number;
  stateHash: string;
  events: GameEvent[];
  view: PlayerView;
}

export interface ReplayPayload {
  gameId: string;
  perspective: ReplayPerspective;
  rules: RulesConfig;
  result: GameResult;
  initialView: PlayerView;
  initialEvents: GameEvent[];
  steps: ReplayStep[];
}

export const ReplayStepSchema: z.ZodType<ReplayStep> = z
  .object({
    idx: z.number().int().min(0),
    commandId: NonEmptyIdSchema,
    player: PlayerIdSchema,
    command: ClientCommandSchema,
    expectedStateVersion: z.number().int().min(0),
    resultingStateVersion: z.number().int().min(1),
    stateHash: z.string().regex(/^[0-9a-f]{64}$/),
    events: z.array(GameEventSchema),
    view: PlayerViewSchema,
  })
  .strict();

export const ReplayPayloadSchema: z.ZodType<ReplayPayload> = z
  .object({
    gameId: NonEmptyIdSchema,
    perspective: ReplayPerspectiveSchema,
    rules: RulesConfigSchema,
    result: GameResultSchema,
    initialView: PlayerViewSchema,
    initialEvents: z.array(GameEventSchema),
    steps: z.array(ReplayStepSchema),
  })
  .strict();

export interface HealthzResponse {
  status: 'ok';
  timestamp: number;
  version: string;
}

export const HealthzResponseSchema: z.ZodType<HealthzResponse> = z
  .object({
    status: z.literal('ok'),
    timestamp: z.number().int().min(0),
    version: z.string().min(1),
  })
  .strict();

export function createGameErrorMessage(
  code: ErrorCode,
  message?: string,
  commandId?: string,
): GameErrorMessage {
  const base: GameErrorMessage = {
    type: 'game.error',
    code,
    message: message ?? ERROR_CODE_DESCRIPTIONS_IT[code],
    retryable: isRetryableErrorCode(code),
  };
  if (commandId !== undefined) {
    base.commandId = commandId;
  }
  return base;
}

export function parseClientMessage(
  raw: string | unknown,
): Result<ClientToServerMessage, GameErrorMessage> {
  let parsedJson: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: createGameErrorMessage(
          'INTERNAL_ERROR',
          'Payload JSON WebSocket malformato.',
        ),
      };
    }
  }

  // Se è un queue.join o room.create con mazzo non valido, restituisce INVALID_DECK
  if (
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    'type' in parsedJson &&
    (parsedJson.type === 'queue.join' || parsedJson.type === 'room.create') &&
    'deck' in parsedJson
  ) {
    const deckCheck = DeckPayloadSchema.safeParse(parsedJson.deck);
    if (!deckCheck.success) {
      return {
        ok: false,
        error: createGameErrorMessage('INVALID_DECK', deckCheck.error.message),
      };
    }
  }

  const result = ClientToServerMessageSchema.safeParse(parsedJson);
  if (!result.success) {
    const commandId =
      typeof parsedJson === 'object' &&
      parsedJson !== null &&
      'commandId' in parsedJson &&
      typeof parsedJson.commandId === 'string' &&
      parsedJson.commandId.trim().length > 0
        ? parsedJson.commandId
        : undefined;
    return {
      ok: false,
      error: createGameErrorMessage(
        'INTERNAL_ERROR',
        result.error.message,
        commandId,
      ),
    };
  }

  return { ok: true, value: result.data };
}

export function parseServerMessage(
  raw: string | unknown,
): Result<ServerToClientMessage, string> {
  let parsedJson: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: 'Payload JSON del server malformato.',
      };
    }
  }

  const result = ServerToClientMessageSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.message,
    };
  }

  return { ok: true, value: result.data };
}
