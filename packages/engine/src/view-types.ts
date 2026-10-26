// GDD §2.1, §4.2, TECH-SPEC §4.6, §5.2, §5.3

import type {
  CardInstance,
  CardRules,
  EraNo,
  GameResult,
  Line,
  Phase,
  PlayerId,
  Resources,
  RulesConfig,
  UnitInstance,
} from './types.js';

// TECH-SPEC §4.6 (riga 331) — motivo esatto di non giocabilità di una carta in mano
export type UnplayableReason =
  | 'no_slot'
  | 'insufficient_resources'
  | 'no_building_to_sacrifice'
  | 'wrong_phase'
  | 'already_passed'
  | 'already_committed';

export interface CardPlayability {
  playable: boolean;
  reason?: UnplayableReason;
}

// TECH-SPEC §4.6 — mosse legali calcolate per il giocatore nello stato corrente
export interface LegalCommands {
  phase: Phase;
  canAct: boolean;
  canSubmitMulligan: boolean;
  maxMulliganCards: number;
  canSubmitDiscard: boolean;
  mustDiscardCount: number;
  canPass: boolean;
  canLockInstants: boolean;
  playableFieldCardUids: string[];
  playableConversionUids: string[];
  sacrificableBuildingUids: string[];
  playableInstantUids: string[];
  handPlayability: Record<string, CardPlayability>;
}

// TECH-SPEC §5.2 — vista pubblica di un'unità avversaria rivelata (da 'prebattle' a fine Era)
export interface PublicUnitView {
  uid: string;
  cardId: string;
  owner: PlayerId;
  seq: number;
  hp: number;
  line: Line;
  atkMod: number;
  revealed: boolean;
}

// TECH-SPEC §5.2 — contratto PlayerView filtrato per singolo giocatore
export interface PlayerView {
  me: PlayerId;
  stateVersion: number;
  era: EraNo;
  phase: Phase;
  cycle: number;
  initiative: PlayerId;
  toAct: PlayerId | null;
  deadline: number | null; // epoch ms del server, null in locale
  self: {
    hand: CardInstance[];
    resources: Resources;
    buildings: CardInstance[];
    units: UnitInstance[];
    discard: CardInstance[]; // il proprietario vede sempre i propri scarti
    walls: number;
    cityHp: number;
    cityMax: number;
    cityDamage: number;
    demBonus: number;
    slotsUsed: number;
    passed: boolean;
    committed: boolean;
    subdeckCounts: Record<EraNo, number>;
    legal: LegalCommands;
  };
  opponent: {
    handCount: number;
    resources: Resources | null; // null in 'mulligan'/'hand_limit'/'development', visibile da 'prebattle'
    coveredCount: number; // carte coperte nella città avversaria (vedi 5.3)
    units: PublicUnitView[] | null; // null prima di 'prebattle', lista rivelata da 'prebattle' a fine Era
    walls: number;
    cityHp: number;
    cityMax: number;
    cityDamage: number;
    demBonus: number; // pubblico perché derivato da Altoforno Reale (pubblico)
    slotsUsed: number;
    passed: boolean;
    committed: boolean; // true se l'avversario ha bloccato la scelta nella finestra simultanea
    discardCount: number; // numero totale carte nello scarto avversario
    publicDiscard: string[]; // cardId pubblici negli scarti avversari (Riconversioni, Istantanee rivelate, Unità cadute/scartate a fine Era)
    subdeckCounts: Record<EraNo, number>;
  };
  result: GameResult | null;
}

// GDD §2.1, TECH-SPEC §4.6 — payload mazzo (3 sotto-mazzi da 20 carte)
export interface DeckSubdecks {
  '1': string[];
  '2': string[];
  '3': string[];
}

export interface DeckPayload {
  id?: string;
  name: string;
  description?: string;
  subdecks: DeckSubdecks;
}

export type DeckValidationErrorCode =
  | 'INVALID_SUBDECK_LENGTH'
  | 'UNKNOWN_CARD_ID'
  | 'WRONG_CARD_ERA'
  | 'MAX_COPIES_EXCEEDED';

export interface ValidationIssue {
  code: DeckValidationErrorCode;
  path: string;
  message: string;
  cardId?: string;
  era?: EraNo;
}

// TECH-SPEC §4.6, Appendice A — configurazione di avvio partita per createGame
export interface NewGameConfig {
  seed: string;
  catalog: Record<string, CardRules>;
  decks?: Record<PlayerId, DeckPayload>;
  fixedDecks?: Record<PlayerId, Record<EraNo, string[]>>;
  fixedInitiative?: PlayerId;
  rules?: Partial<RulesConfig>;
}
