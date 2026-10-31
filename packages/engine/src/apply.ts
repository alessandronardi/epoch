// GDD §2–§6, TECH-SPEC §4.1, §4.4–4.6, §6.3, §11 D2
// Orchestratore puro e immutabile `apply(state, cmd)` basato su Immer.

import { produce } from 'immer';
import { mutateMarket, validateMarket } from './structures.js';
import { advanceDevelopmentTurn } from './development.js';
import type {
  ApplyTimeoutCommand,
  Command,
  ConcedeCommand,
  Result,
  RuleError,
} from './commands.js';
import {
  autoPassIfConfigured,
  mutatePass,
  mutatePlayCard,
  mutatePlayConversion,
  mutateSubmitDiscard,
  validatePass,
  validatePlayCard,
  validatePlayConversion,
  validateSubmitDiscard,
} from './development.js';
import { HAND_LIMIT, autoDiscard } from './discard-policy.js';
import type { GameEvent } from './events.js';
import { getOpponent, mutateSubmitMulligan, validateSubmitMulligan } from './setup.js';
import { mutateLockInstants, validateLockInstants } from './siege-and-era.js';
import type { GameState } from './types.js';

/**
 * Valida in modo puro il comando `Concede` (consentito in qualsiasi fase tranne `finished` — TECH-SPEC §4.5).
 */
export function validateConcede(
  state: Readonly<GameState>,
  _cmd: ConcedeCommand,
): RuleError | null {
  if (state.phase === 'finished') {
    return {
      code: 'INVALID_PHASE',
      message: 'Cannot concede a game that has already finished.',
    };
  }
  return null;
}

/**
 * Applica in-place su un draft `GameState` la resa del giocatore (`Concede`).
 */
export function mutateConcede(
  draft: GameState,
  cmd: ConcedeCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validateConcede(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const winner = getOpponent(cmd.player);
  draft.phase = 'finished';
  draft.toAct = null;
  draft.pending = {};
  draft.result = {
    kind: 'concession',
    winner,
  };

  events.push({
    n: ++draft.counters.event,
    type: 'GameEnded',
    kind: 'concession',
    winner,
  });

  return { ok: true, value: undefined };
}

/**
 * Valida in modo puro il comando `ApplyTimeout` nella finestra di attesa attiva (TECH-SPEC §6.3, §11 D2).
 */
export function validateApplyTimeout(
  state: Readonly<GameState>,
  cmd: ApplyTimeoutCommand,
): RuleError | null {
  if (state.phase === 'finished') {
    return {
      code: 'INVALID_PHASE',
      message: 'Cannot apply timeout in phase "finished".',
    };
  }

  const playerState = state.players[cmd.player];

  if (state.phase === 'mulligan') {
    if (state.pending[cmd.player] !== undefined || playerState.mulliganDone) {
      return {
        code: 'DECISION_ALREADY_LOCKED',
        message: `Player ${cmd.player} has already locked their mulligan decision.`,
      };
    }
    return null;
  }

  if (state.phase === 'hand_limit') {
    if (state.pending[cmd.player] !== undefined) {
      return {
        code: 'DECISION_ALREADY_LOCKED',
        message: `Player ${cmd.player} has already locked their hand_limit discard decision.`,
      };
    }
    if (playerState.hand.length <= HAND_LIMIT) {
      return {
        code: 'NOT_YOUR_TURN',
        message: `Player ${cmd.player} does not exceed hand limit ${HAND_LIMIT} and has no pending discard action.`,
      };
    }
    return null;
  }

  if (state.phase === 'development') {
    if (playerState.passed) {
      return {
        code: 'ALREADY_PASSED',
        message: `Player ${cmd.player} has already passed in Era ${state.era}.`,
      };
    }
    if (state.toAct !== cmd.player) {
      return {
        code: 'NOT_YOUR_TURN',
        message: `It is not ${cmd.player}'s turn to act in development.`,
      };
    }
    return null;
  }

  // state.phase === 'prebattle'
  if (state.pending[cmd.player] !== undefined) {
    return {
      code: 'DECISION_ALREADY_LOCKED',
      message: `Player ${cmd.player} has already locked their prebattle instants decision.`,
    };
  }
  return null;
}

/**
 * Applica in-place su un draft `GameState` la politica deterministica `ApplyTimeout` (TECH-SPEC §6.3, §11 D2):
 * - Incrementa `consecutiveTimeouts` del giocatore;
 * - Se raggiunge `rules.timeoutPolicy.concedeAfterConsecutiveTimeouts` (default 3), chiude la partita
 *   per abbandono (`kind: 'timeout'`, vittoria all'avversario);
 * - Altrimenti applica l'azione automatica della finestra corrente:
 *   - `mulligan`: nessun cambio (`cardUids: []`);
 *   - `hand_limit`: scarto deterministico FIFO tramite `autoDiscard`;
 *   - `development`: dichiarazione automatica di `Pass` con `reason: 'timeout'`;
 *   - `prebattle`: nessuna Istantanea giocata (`cardUids: []`).
 */
export function mutateApplyTimeout(
  draft: GameState,
  cmd: ApplyTimeoutCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validateApplyTimeout(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const playerState = draft.players[cmd.player];
  playerState.consecutiveTimeouts += 1;

  const threshold = draft.rules.timeoutPolicy.concedeAfterConsecutiveTimeouts;
  if (threshold > 0 && playerState.consecutiveTimeouts >= threshold) {
    const winner = getOpponent(cmd.player);
    draft.phase = 'finished';
    draft.toAct = null;
    draft.pending = {};
    draft.result = {
      kind: 'timeout',
      winner,
    };

    events.push({
      n: ++draft.counters.event,
      type: 'GameEnded',
      kind: 'timeout',
      winner,
    });

    return { ok: true, value: undefined };
  }

  if (draft.phase === 'mulligan') {
    const res = mutateSubmitMulligan(
      draft,
      { type: 'SubmitMulligan', player: cmd.player, cardUids: [] },
      events,
    );
    if (res.ok) {
      autoPassIfConfigured(draft, events);
    }
    return res;
  }

  if (draft.phase === 'hand_limit') {
    const excess = playerState.hand.length - HAND_LIMIT;
    const discardUids = autoDiscard(playerState.hand, draft.catalog, excess);
    return mutateSubmitDiscard(
      draft,
      { type: 'SubmitDiscard', player: cmd.player, cardUids: discardUids },
      events,
    );
  }

  if (draft.phase === 'development') {
    return mutatePass(draft, { type: 'Pass', player: cmd.player }, events, 'timeout');
  }

  // draft.phase === 'prebattle'
  return mutateLockInstants(
    draft,
    { type: 'LockInstants', player: cmd.player, cardUids: [] },
    events,
  );
}

/**
 * Valida preventivamente qualsiasi comando `Command` sullo stato corrente senza mutarlo.
 */
export function validateCommand(state: Readonly<GameState>, cmd: Command): RuleError | null {
  switch (cmd.type) {
    case 'SubmitMulligan':
      return validateSubmitMulligan(state, cmd);
    case 'SubmitDiscard':
      return validateSubmitDiscard(state, cmd);
    case 'ActivateMarket':
      return validateMarket(state, cmd);
    case 'PlayCard':
      return validatePlayCard(state, cmd);
    case 'PlayConversion':
      return validatePlayConversion(state, cmd);
    case 'Pass':
      return validatePass(state, cmd);
    case 'LockInstants':
      return validateLockInstants(state, cmd);
    case 'ApplyTimeout':
      return validateApplyTimeout(state, cmd);
    case 'Concede':
      return validateConcede(state, cmd);
  }
}

/**
 * Funzione pura e immutabile di transizione dello stato della partita (TECH-SPEC §4.1, §4.6).
 * - Non muta mai `state` in ingresso (nemmeno se congelato con `Object.freeze`);
 * - Se il comando non è valido, restituisce `{ ok: false, error: RuleError }`;
 * - Se il comando è valido, incrementa `stateVersion` di 1 e restituisce `{ ok: true, value: { state, events } }`.
 */
export function apply(
  state: GameState,
  cmd: Command,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validateCommand(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];

  const nextState = produce(state, (draft) => {
    switch (cmd.type) {
      case 'ActivateMarket':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutateMarket(draft, cmd, events);
        advanceDevelopmentTurn(draft, events, cmd.player);
        autoPassIfConfigured(draft, events);
        break;
      case 'SubmitMulligan':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutateSubmitMulligan(draft, cmd, events);
        autoPassIfConfigured(draft, events);
        break;

      case 'SubmitDiscard':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutateSubmitDiscard(draft, cmd, events);
        break;

      case 'PlayCard':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutatePlayCard(draft, cmd, events);
        break;

      case 'PlayConversion':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutatePlayConversion(draft, cmd, events);
        break;

      case 'Pass':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutatePass(draft, cmd, events, 'chosen');
        break;

      case 'LockInstants':
        draft.players[cmd.player].consecutiveTimeouts = 0;
        mutateLockInstants(draft, cmd, events);
        break;

      case 'ApplyTimeout':
        mutateApplyTimeout(draft, cmd, events);
        break;

      case 'Concede':
        mutateConcede(draft, cmd, events);
        break;
    }

    draft.stateVersion += 1;
  });

  return {
    ok: true,
    value: {
      state: nextState,
      events,
    },
  };
}
