import type { Affiliation, CivilizationId, ContentVersion } from '../../../data/versions.js';
// GDD §1–§7, TECH-SPEC §0.3, §4.3, §11, Appendice C.4

export type PlayerId = 'P1' | 'P2';
export type EraNo = 1 | 2 | 3;
export type Resource = 'food' | 'wood' | 'metal';
export type Resources = Record<Resource, number>;
export type Line = 'front' | 'center' | 'rear';
export type CardType = 'economy' | 'unit' | 'instant' | 'conversion' | 'structure';
export type UnitCategory = 'infantry' | 'spearman' | 'cavalry' | 'archer' | 'siege';

// GDD §5.3, TECH-SPEC §4.3, §11 D1
export type Ability =
  | { kind: 'fury'; amount: number }
  | { kind: 'discipline'; amount: number }
  | { kind: 'impale'; damage: number } // vs Cavalleria; valore stampato sulla carta (D1)
  | { kind: 'volley'; bonusVsSpearman: number } // Tiro vs Lancieri; valore stampato sulla carta (D1)
  | { kind: 'flank'; bonusVsArcher: number }; // Accerchiamento vs Arcieri; valore stampato (D1)

// GDD §5.1, §7, TECH-SPEC §4.3
export type InstantEffect =
  | { kind: 'atk_mod'; target: 'own_archers' | 'own_front' | 'own_infantry'; amount: number }
  | { kind: 'walls_mod'; target: 'own' | 'enemy'; amount: number }; // amount con segno (+3, -4, -6)

// GDD §3.4, §7, TECH-SPEC §4.3
export type ConversionEffect =
  | { kind: 'gain_per_building'; perBuilding: Resources } // Gilda dei Mercanti
  | { kind: 'gain_and_dem_bonus'; gain: Resources; demBonus: number }; // Altoforno Reale

export type CardEffect = InstantEffect | ConversionEffect;

// GDD §7, TECH-SPEC §4.3
export interface CardRules {
  affiliation?: Affiliation;
  structureEffect?: { kind: 'market' } | { kind: 'era_walls'; amount: number };
  id: string; // ATTENZIONE: il prefisso NON determina il tipo
  era: EraNo; // sotto-mazzo di appartenenza (1 | 2 | 3)
  type: CardType; // determinato dal campo 'Tipo / Cat.' del GDD, mai dall'ID
  category?: UnitCategory; // presente solo per type === 'unit'
  line?: Line; // presente solo per type === 'unit' (front | center | rear)
  cost: Resources;
  atk?: number;
  dem?: number;
  hp?: number;
  isCombatant?: boolean; // false per category === 'siege', true per le altre unit
  production?: Resources; // presente solo per type === 'economy'
  abilities: Ability[];
  effect?: InstantEffect | ConversionEffect;
}

// GDD §1, §2, TECH-SPEC §4.3
export interface CardInstance {
  uid: string;
  cardId: string;
  owner: PlayerId;
  drawnOrder: number;
}

// GDD §1, §4, §5, TECH-SPEC §4.3
export interface UnitInstance extends CardInstance {
  seq: number;
  hp: number;
  line: Line;
  atkMod: number;
  revealed: boolean;
}

// GDD §2–§6, TECH-SPEC §4.3, §5.2
export interface PlayerState {
  civilizationId?: CivilizationId;
  organizationUsed?: boolean;
  structures?: CardInstance[];
  marketUsed?: boolean;
  hand: CardInstance[];
  subdecks: Record<EraNo, CardInstance[]>; // indice 0 = cima del sotto-mazzo
  discard: CardInstance[];
  publicDiscard: string[]; // cardId pubblicamente rivelati negli scarti (Riconversioni, Istantanee rivelate, Unità cadute/scartate a fine Era)
  resources: Resources;
  buildings: CardInstance[]; // edifici economici attivi (sempre coperti per l'avversario)
  units: UnitInstance[]; // coperte in 'development', rivelate in 'prebattle'
  slotsUsed: number; // nuove carte da campo giocate nell'Era corrente
  passed: boolean;
  walls: number;
  cityMax: number;
  cityDamage: number; // cityHp derivato = cityMax - cityDamage
  demBonus: number; // bonus da Altoforno Reale in Era III, cumulabile
  mulliganDone: boolean;
  consecutiveTimeouts: number; // contatore timeout consecutivi per regola di abbandono (§6.3, D2)
}

export type Phase = 'mulligan' | 'hand_limit' | 'development' | 'prebattle' | 'finished';

export type PendingWindow = 'mulligan' | 'hand_limit' | 'prebattle';

export type PendingCommit =
  | { window: 'mulligan'; cardUids: string[] }
  | { window: 'hand_limit'; cardUids: string[] }
  | { window: 'prebattle'; cardUids: string[] };

// GDD §6, TECH-SPEC §4.5, §4.9
export type GameResultKind = 'annihilation' | 'points' | 'draw' | 'concession' | 'timeout';

export interface GameResult {
  kind: GameResultKind;
  winner: PlayerId | 'DRAW';
}

// TECH-SPEC §6.3, §11, Appendice C.4
export interface TimeoutPolicyConfig {
  development: 'pass';
  mulligan: 'keep';
  prebattle: 'none';
  handLimit: 'deterministic_policy';
  seconds: {
    mulligan: number;
    handLimit: number;
    development: number;
    prebattle: number;
  };
  concedeAfterConsecutiveTimeouts: number;
}

export interface RulesConfig {
  gddVersion: ContentVersion;
  eraScalingSource: 'card' | 'current_era';
  archerMeleeUsesEffectiveAtk: boolean;
  seqAssignedAt: 'play' | 'reveal';
  autoPassWhenNoLegalPlay: boolean;
  discardVisibility: 'hidden' | 'public';
  sacrificeVisibility: 'hidden' | 'public';
  timeoutPolicy: TimeoutPolicyConfig;
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  gddVersion: '1.0',
  eraScalingSource: 'card',
  archerMeleeUsesEffectiveAtk: true,
  seqAssignedAt: 'play',
  autoPassWhenNoLegalPlay: false,
  discardVisibility: 'hidden',
  sacrificeVisibility: 'hidden',
  timeoutPolicy: {
    development: 'pass',
    mulligan: 'keep',
    prebattle: 'none',
    handLimit: 'deterministic_policy',
    seconds: {
      mulligan: 30,
      handLimit: 30,
      development: 45,
      prebattle: 30,
    },
    concedeAfterConsecutiveTimeouts: 3,
  },
};

export interface GameCounters {
  uid: number;
  drawnOrder: number;
  seq: number;
  event: number;
}

// TECH-SPEC §4.3
export interface GameState {
  schemaVersion: 1 | 2;
  rulesetVersion: ContentVersion;
  catalogVersion: ContentVersion;
  stateVersion: number; // intero monotono incrementato a ogni apply valido
  rules: RulesConfig; // sezione 11 e Appendice C.4
  catalog: Record<string, CardRules>; // dizionario data-driven delle carte per la partita
  seed: string;
  rngState: [number, number, number, number];
  era: EraNo;
  phase: Phase;
  cycle: number;
  initiative: PlayerId; // chi agisce per primo nell'Era corrente (P1 in I/III, P2 in II)
  toAct: PlayerId | null; // valorizzato solo in 'development'
  players: Record<PlayerId, PlayerState>;
  pending: Partial<Record<PlayerId, PendingCommit>>; // scelte simultanee bloccate ma non ancora rivelate
  counters: GameCounters;
  result: GameResult | null;
}
