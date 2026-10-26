// GDD §2–§6, TECH-SPEC §4.5, §5.4

import type {
  CardInstance,
  EraNo,
  GameResultKind,
  PendingWindow,
  PlayerId,
  Resources,
  UnitInstance,
} from './types.js';

export type ResourceChangeReason =
  | 'initial'
  | 'harvest'
  | 'rent'
  | 'cost'
  | 'conversion'
  | 'raid';

export type ResourceOverflowReason =
  | 'harvest'
  | 'rent'
  | 'conversion'
  | 'raid';

export type PassReason = 'chosen' | 'no_legal_play' | 'timeout';

export type BattlePhaseId =
  | 'phase1_volley'
  | 'phase2a_impale'
  | 'phase2b_impact'
  | 'phase3_melee';

export type BattleOutcomeKind =
  | 'winner'
  | 'mutual_annihilation'
  | 'stalemate';

export interface DamageAssignment {
  uid: string;
  damage: number;
}

export interface GameStartedEvent {
  n: number;
  type: 'GameStarted';
  era: EraNo;
  rulesetVersion: '1.0';
  catalogVersion: '1.0';
}

export interface InitiativeAssignedEvent {
  n: number;
  type: 'InitiativeAssigned';
  era: EraNo;
  initiative: PlayerId;
}

export interface CardsDrawnEvent {
  n: number;
  type: 'CardsDrawn';
  player: PlayerId;
  era: EraNo;
  count: number;
  cards?: CardInstance[];
}

export interface PlayerCommittedEvent {
  n: number;
  type: 'PlayerCommitted';
  player: PlayerId;
  window: PendingWindow;
}

export interface MulliganResolvedEvent {
  n: number;
  type: 'MulliganResolved';
  player: PlayerId;
  count: number;
  returnedCardUids?: string[];
  drawnCards?: CardInstance[];
}

export interface EraStartedEvent {
  n: number;
  type: 'EraStarted';
  era: EraNo;
  initiative: PlayerId;
  walls: Record<PlayerId, number>;
  cityHp: Record<PlayerId, number>;
  cityMax: Record<PlayerId, number>;
}

export interface HandLimitDiscardedEvent {
  n: number;
  type: 'HandLimitDiscarded';
  player: PlayerId;
  count: number;
  cardUids?: string[];
}

export interface ResourcesChangedEvent {
  n: number;
  type: 'ResourcesChanged';
  player: PlayerId;
  reason: ResourceChangeReason;
  delta: Resources;
  resources: Resources;
}

export interface ResourcesOverflowedEvent {
  n: number;
  type: 'ResourcesOverflowed';
  player: PlayerId;
  reason: ResourceOverflowReason;
  overflow: Resources;
  cap: number;
}

export interface CycleStartedEvent {
  n: number;
  type: 'CycleStarted';
  era: EraNo;
  cycle: number;
  toAct: PlayerId;
}

export interface CardPlayedEvent {
  n: number;
  type: 'CardPlayed';
  player: PlayerId;
  slotsUsed: number;
  coveredCount: number;
  uid?: string;
  cardId?: string;
  cardType?: 'economy' | 'unit';
}

export interface ConversionActivatedEvent {
  n: number;
  type: 'ConversionActivated';
  player: PlayerId;
  uid: string;
  cardId: string;
  gain: Resources;
  demBonusGained: number;
  coveredCount: number;
  sacrificeUid?: string;
  sacrificeCardId?: string;
}

export interface PlayerPassedEvent {
  n: number;
  type: 'PlayerPassed';
  player: PlayerId;
  era: EraNo;
  cycle: number;
  reason: PassReason;
}

export interface DevelopmentEndedEvent {
  n: number;
  type: 'DevelopmentEnded';
  era: EraNo;
}

export interface UnitsRevealedEvent {
  n: number;
  type: 'UnitsRevealed';
  era: EraNo;
  units: Record<PlayerId, UnitInstance[]>;
  resources: Record<PlayerId, Resources>;
}

export interface InstantsRevealedEvent {
  n: number;
  type: 'InstantsRevealed';
  era: EraNo;
  played: Record<PlayerId, Array<{ uid: string; cardId: string }>>;
}

export interface WallsModifiedEvent {
  n: number;
  type: 'WallsModified';
  era: EraNo;
  wallsBefore: Record<PlayerId, number>;
  deltaOwn: Record<PlayerId, number>;
  deltaEnemy: Record<PlayerId, number>;
  wallsAfter: Record<PlayerId, number>;
}

export interface BattleStartedEvent {
  n: number;
  type: 'BattleStarted';
  era: EraNo;
}

export interface BattlePhaseResolvedEvent {
  n: number;
  type: 'BattlePhaseResolved';
  era: EraNo;
  phase: BattlePhaseId;
  meleeCycle?: number;
  damageDealt: Record<PlayerId, number>;
  assignments: Record<PlayerId, DamageAssignment[]>;
  casualties: Record<PlayerId, string[]>;
}

export interface BattleOutcomeEvent {
  n: number;
  type: 'BattleOutcome';
  era: EraNo;
  kind: BattleOutcomeKind;
  winner?: PlayerId;
}

export interface SiegeResolvedEvent {
  n: number;
  type: 'SiegeResolved';
  era: EraNo;
  attacker: PlayerId;
  defender: PlayerId;
  D: number;
  W: number;
  breach: boolean;
  wallsAfter: number;
  directDamage: number;
  cityHpAfter: number;
}

export interface RaidResolvedEvent {
  n: number;
  type: 'RaidResolved';
  era: EraNo;
  attacker: PlayerId;
  defender: PlayerId;
  foodTransferred: number;
  woodTransferred: number;
}

export interface EraEndedEvent {
  n: number;
  type: 'EraEnded';
  era: EraNo;
  discardedUnitUids: Record<PlayerId, string[]>;
}

export interface GameEndedEvent {
  n: number;
  type: 'GameEnded';
  kind: GameResultKind;
  winner: PlayerId | 'DRAW';
}

// TECH-SPEC §4.5 — unione discriminata di tutti gli eventi con indice monotono n
export type GameEvent =
  | GameStartedEvent
  | InitiativeAssignedEvent
  | CardsDrawnEvent
  | PlayerCommittedEvent
  | MulliganResolvedEvent
  | EraStartedEvent
  | HandLimitDiscardedEvent
  | ResourcesChangedEvent
  | ResourcesOverflowedEvent
  | CycleStartedEvent
  | CardPlayedEvent
  | ConversionActivatedEvent
  | PlayerPassedEvent
  | DevelopmentEndedEvent
  | UnitsRevealedEvent
  | InstantsRevealedEvent
  | WallsModifiedEvent
  | BattleStartedEvent
  | BattlePhaseResolvedEvent
  | BattleOutcomeEvent
  | SiegeResolvedEvent
  | RaidResolvedEvent
  | EraEndedEvent
  | GameEndedEvent;
