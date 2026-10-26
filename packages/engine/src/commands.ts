// GDD §2.2, §2.3, §3.4, §4.1, §5.1, TECH-SPEC §4.5, §4.6, §6.2

import type { PlayerId } from './types.js';

export interface SubmitMulliganClientCommand {
  type: 'SubmitMulligan';
  cardUids: string[];
}

export interface SubmitDiscardClientCommand {
  type: 'SubmitDiscard';
  cardUids: string[];
}

export interface PlayCardClientCommand {
  type: 'PlayCard';
  cardUid: string;
}

export interface PlayConversionClientCommand {
  type: 'PlayConversion';
  cardUid: string;
  sacrificeUid: string;
}

export interface PassClientCommand {
  type: 'Pass';
}

export interface LockInstantsClientCommand {
  type: 'LockInstants';
  cardUids: string[];
}

export interface ApplyTimeoutClientCommand {
  type: 'ApplyTimeout';
}

export interface ConcedeClientCommand {
  type: 'Concede';
}

// TECH-SPEC §6.2 — comando inviato dal client/bot senza il campo player
export type ClientCommand =
  | SubmitMulliganClientCommand
  | SubmitDiscardClientCommand
  | PlayCardClientCommand
  | PlayConversionClientCommand
  | PassClientCommand
  | LockInstantsClientCommand
  | ApplyTimeoutClientCommand
  | ConcedeClientCommand;

export interface SubmitMulliganCommand extends SubmitMulliganClientCommand {
  player: PlayerId;
}

export interface SubmitDiscardCommand extends SubmitDiscardClientCommand {
  player: PlayerId;
}

export interface PlayCardCommand extends PlayCardClientCommand {
  player: PlayerId;
}

export interface PlayConversionCommand extends PlayConversionClientCommand {
  player: PlayerId;
}

export interface PassCommand extends PassClientCommand {
  player: PlayerId;
}

export interface LockInstantsCommand extends LockInstantsClientCommand {
  player: PlayerId;
}

export interface ApplyTimeoutCommand extends ApplyTimeoutClientCommand {
  player: PlayerId;
}

export interface ConcedeCommand extends ConcedeClientCommand {
  player: PlayerId;
}

// TECH-SPEC §4.5 — unione discriminata di tutti i comandi del motore
export type Command =
  | SubmitMulliganCommand
  | SubmitDiscardCommand
  | PlayCardCommand
  | PlayConversionCommand
  | PassCommand
  | LockInstantsCommand
  | ApplyTimeoutCommand
  | ConcedeCommand;

// TECH-SPEC §6.2 (riga 568) — codici errore strutturati
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'MATCH_NOT_ACCESSIBLE'
  | 'STALE_STATE_VERSION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_PASSED'
  | 'DECISION_ALREADY_LOCKED'
  | 'CARD_NOT_IN_HAND'
  | 'INSUFFICIENT_RESOURCES'
  | 'NO_LOGISTICS_SLOT'
  | 'NO_BUILDING_TO_SACRIFICE'
  | 'INVALID_DISCARD_COUNT'
  | 'INVALID_DECK'
  | 'INTERNAL_ERROR';

export interface RuleError {
  code: ErrorCode;
  message: string;
}

// TECH-SPEC §4.1, §4.6 — errori di dominio restituiti come valori
export type Result<T, E = RuleError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
