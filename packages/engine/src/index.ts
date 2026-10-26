// TECH-SPEC §4.6 — API pubblica del package @epochs/engine e riesportazione completa dei tipi e moduli.

export {
  DEFAULT_RULES_CONFIG,
  type Ability,
  type CardEffect,
  type CardInstance,
  type CardRules,
  type CardType,
  type ConversionEffect,
  type EraNo,
  type GameCounters,
  type GameResult,
  type GameResultKind,
  type GameState,
  type InstantEffect,
  type Line,
  type PendingCommit,
  type PendingWindow,
  type Phase,
  type PlayerId,
  type PlayerState,
  type Resource,
  type Resources,
  type RulesConfig,
  type TimeoutPolicyConfig,
  type UnitCategory,
  type UnitInstance,
} from './types.js';

export {
  type ApplyTimeoutClientCommand,
  type ApplyTimeoutCommand,
  type ClientCommand,
  type Command,
  type ConcedeClientCommand,
  type ConcedeCommand,
  type ErrorCode,
  type LockInstantsClientCommand,
  type LockInstantsCommand,
  type PassClientCommand,
  type PassCommand,
  type PlayCardClientCommand,
  type PlayCardCommand,
  type PlayConversionClientCommand,
  type PlayConversionCommand,
  type Result,
  type RuleError,
  type SubmitDiscardClientCommand,
  type SubmitDiscardCommand,
  type SubmitMulliganClientCommand,
  type SubmitMulliganCommand,
} from './commands.js';

export {
  type BattleOutcomeEvent,
  type BattleOutcomeKind,
  type BattlePhaseId,
  type BattlePhaseResolvedEvent,
  type BattleStartedEvent,
  type CardPlayedEvent,
  type CardsDrawnEvent,
  type ConversionActivatedEvent,
  type CycleStartedEvent,
  type DamageAssignment,
  type DevelopmentEndedEvent,
  type EraEndedEvent,
  type EraStartedEvent,
  type GameEndedEvent,
  type GameEvent,
  type GameStartedEvent,
  type HandLimitDiscardedEvent,
  type InitiativeAssignedEvent,
  type InstantsRevealedEvent,
  type MulliganResolvedEvent,
  type PassReason,
  type PlayerCommittedEvent,
  type PlayerPassedEvent,
  type RaidResolvedEvent,
  type ResourceChangeReason,
  type ResourceOverflowReason,
  type ResourcesChangedEvent,
  type ResourcesOverflowedEvent,
  type SiegeResolvedEvent,
  type UnitsRevealedEvent,
  type WallsModifiedEvent,
} from './events.js';

export {
  type CardPlayability,
  type DeckPayload,
  type DeckSubdecks,
  type DeckValidationErrorCode,
  type LegalCommands,
  type NewGameConfig,
  type PlayerView,
  type PublicUnitView,
  type UnplayableReason,
  type ValidationIssue,
} from './view-types.js';

export {
  createSfc32,
  nextInt,
  nextRandom,
  seedToRngState,
  shuffle,
  xmur3,
  type RngState,
} from './rng.js';

export { canonicalizeJson, sha256Hex, stateHash } from './hash.js';

export {
  MAX_COPIES_PER_CARD,
  SUBDECK_SIZE,
  validateDeck,
} from './deck.js';

export {
  HAND_LIMIT,
  autoDiscard,
  getTotalCardCost,
} from './discard-policy.js';

export {
  INITIAL_RESOURCES,
  LOGISTICS_CAP_BY_ERA,
  PLAYERS_ORDER,
  RESOURCE_KEYS,
  STORAGE_CAP_BY_ERA,
  ZERO_RESOURCES,
  addResources,
  applyOpeningHarvest,
  applyPeriodicRent,
  calculateOpeningHarvest,
  calculatePeriodicRent,
  canAfford,
  cloneResources,
  creditPlayerResources,
  creditResourcesWithCap,
  getLogisticsCap,
  getStorageCap,
  hasNonZeroResources,
  scaleResources,
  spendPlayerResources,
  sumBuildingsProduction,
  type CreditResourcesResult,
} from './economy.js';

export {
  ERA_BASE_WALLS,
  ERA_CITY_MAX,
  ERA_DRAW_COUNT,
  INITIAL_CITY_MAX,
  INITIAL_WALLS,
  createGame,
  drawCardsFromSubdeck,
  getOpponent,
  mergeRulesConfig,
  mutateSubmitMulligan,
  startEraDevelopment,
  submitMulligan,
  validateSubmitMulligan,
} from './setup.js';

export { evaluateCardPlayability, legalCommands } from './legal.js';

export {
  advanceDevelopmentTurn,
  autoPassIfConfigured,
  calculateTotalEffectiveDem,
  enterEraHandLimitOrDevelopment,
  enterPrebattle,
  getEffectiveUnitDem,
  getInitiativeForEra,
  mutatePass,
  mutatePlayCard,
  mutatePlayConversion,
  mutateSubmitDiscard,
  passTurn,
  playCard,
  playConversion,
  startNextEra,
  submitDiscard,
  validatePass,
  validatePlayCard,
  validatePlayConversion,
  validateSubmitDiscard,
} from './development.js';

export {
  FLANK_LINE_PRIORITY,
  MAX_MELEE_CYCLES,
  STANDARD_LINE_PRIORITY,
  assignDamage,
  countLivingCombatants,
  evaluateBattleGuard,
  getEffectiveUnitAtk,
  getMeleeUnitAtk,
  isCombatantUnit,
  orderTargets,
  resolveFieldBattle,
  type BattleResult,
} from './battle.js';

export {
  calculateCityHp,
  calculateRaidTransfer,
  calculateSiege,
  calculateWallCarryover,
  lockInstants,
  mutateLockInstants,
  resolveEndOfEra,
  resolveSiegeAndRaid,
  validateLockInstants,
  type RaidCalculation,
  type SiegeCalculation,
} from './siege-and-era.js';

export { isPublicBattleStage, playerView, projectEvent } from './projection.js';

export {
  apply,
  mutateApplyTimeout,
  mutateConcede,
  validateApplyTimeout,
  validateCommand,
  validateConcede,
} from './apply.js';
