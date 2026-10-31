// GDD §2.1, §2.2, §2.3, §3.4, §4.1, §5.1, TECH-SPEC §4.4, §4.6, §11 D6
// Calcolo puro delle mosse legali (legalCommands) e dei motivi esatti di non giocabilità (UnplayableReason).

import { HAND_LIMIT } from './discard-policy.js';
import { effectiveCardCost } from './civilizations.js';
import { legalMarketCommands } from './structures.js';
import { canAfford, getLogisticsCap } from './economy.js';
import type { CardInstance, CardRules, GameState, PlayerId } from './types.js';
import type { CardPlayability, LegalCommands } from './view-types.js';

function getCardRulesOrThrow(
  catalog: Readonly<Record<string, CardRules>>,
  card: Readonly<CardInstance>,
): CardRules {
  const rules = catalog[card.cardId];
  if (rules === undefined) {
    throw new Error(
      `Card "${card.cardId}" (uid "${card.uid}") not found in catalog during legalCommands calculation.`,
    );
  }
  return rules;
}

/**
 * Valuta la giocabilità di una singola carta nella mano di `player` nello stato corrente,
 * restituendo `{ playable: true }` oppure `{ playable: false, reason }` con il codice esatto.
 */
export function evaluateCardPlayability(
  state: Readonly<GameState>,
  player: PlayerId,
  card: Readonly<CardInstance>,
): CardPlayability {
  const rules = getCardRulesOrThrow(state.catalog, card);
  const playerState = state.players[player];
  const hasCommitted = state.pending[player] !== undefined;

  if (state.phase === 'mulligan') {
    if (hasCommitted || playerState.mulliganDone) {
      return { playable: false, reason: 'already_committed' };
    }
    return { playable: false, reason: 'wrong_phase' };
  }

  if (state.phase === 'hand_limit') {
    if (hasCommitted) {
      return { playable: false, reason: 'already_committed' };
    }
    return { playable: false, reason: 'wrong_phase' };
  }

  if (state.phase === 'prebattle') {
    if (hasCommitted) {
      return { playable: false, reason: 'already_committed' };
    }
    if (rules.type !== 'instant') {
      return { playable: false, reason: 'wrong_phase' };
    }
    if (
      !canAfford(playerState.resources, effectiveCardCost(rules, playerState, state.rulesetVersion))
    ) {
      return { playable: false, reason: 'insufficient_resources' };
    }
    return { playable: true };
  }

  if (state.phase === 'development') {
    if (playerState.passed) {
      return { playable: false, reason: 'already_passed' };
    }
    if (state.toAct !== player) {
      return { playable: false, reason: 'wrong_phase' };
    }

    if (rules.type === 'instant') {
      return { playable: false, reason: 'wrong_phase' };
    }

    if (rules.type === 'conversion') {
      if (state.era !== 3) {
        return { playable: false, reason: 'wrong_phase' };
      }
      if (playerState.buildings.length === 0) {
        return { playable: false, reason: 'no_building_to_sacrifice' };
      }
      if (
        !canAfford(
          playerState.resources,
          effectiveCardCost(rules, playerState, state.rulesetVersion),
        )
      ) {
        return { playable: false, reason: 'insufficient_resources' };
      }
      return { playable: true };
    }

    // Carta da campo ('economy' | 'unit'): giocabile anche se conservata da un'Era precedente
    if (playerState.slotsUsed >= getLogisticsCap(state.era)) {
      return { playable: false, reason: 'no_slot' };
    }
    if (
      !canAfford(playerState.resources, effectiveCardCost(rules, playerState, state.rulesetVersion))
    ) {
      return { playable: false, reason: 'insufficient_resources' };
    }
    return { playable: true };
  }

  // state.phase === 'finished'
  return { playable: false, reason: 'wrong_phase' };
}

/**
 * Calcola tutte le mosse valide per `player` nello stato corrente e, per ogni carta in mano,
 * restituisce lo stato di giocabilità o il motivo esatto di blocco (TECH-SPEC §4.6).
 */
export function legalCommands(state: Readonly<GameState>, player: PlayerId): LegalCommands {
  const playerState = state.players[player];
  const hasCommitted = state.pending[player] !== undefined;

  const canSubmitMulligan =
    state.phase === 'mulligan' && !hasCommitted && !playerState.mulliganDone;
  const maxMulliganCards = canSubmitMulligan
    ? Math.min(playerState.hand.length, playerState.subdecks[1].length)
    : 0;

  const excessHandCards = Math.max(0, playerState.hand.length - HAND_LIMIT);
  const canSubmitDiscard = state.phase === 'hand_limit' && !hasCommitted && excessHandCards > 0;
  const mustDiscardCount = canSubmitDiscard ? excessHandCards : 0;

  const isDevelopmentTurn =
    state.phase === 'development' && state.toAct === player && !playerState.passed;
  const canPass = isDevelopmentTurn;

  const canLockInstants = state.phase === 'prebattle' && !hasCommitted;

  const playableFieldCardUids: string[] = [];
  const playableConversionUids: string[] = [];
  const playableInstantUids: string[] = [];
  const handPlayability: Record<string, CardPlayability> = {};

  for (const card of playerState.hand) {
    const playability = evaluateCardPlayability(state, player, card);
    handPlayability[card.uid] = playability;

    if (playability.playable) {
      const rules = state.catalog[card.cardId]!;
      if (rules.type === 'economy' || rules.type === 'unit' || rules.type === 'structure') {
        playableFieldCardUids.push(card.uid);
      } else if (rules.type === 'conversion') {
        playableConversionUids.push(card.uid);
      } else if (rules.type === 'instant') {
        playableInstantUids.push(card.uid);
      }
    }
  }

  const sacrificableBuildingUids =
    playableConversionUids.length > 0 ? playerState.buildings.map((b) => b.uid) : [];

  const canAct = canSubmitMulligan || canSubmitDiscard || isDevelopmentTurn || canLockInstants;

  return {
    phase: state.phase,
    ...(state.rulesetVersion === '2.0'
      ? { marketCommands: legalMarketCommands(state, player) }
      : {}),
    canAct,
    canSubmitMulligan,
    maxMulliganCards,
    canSubmitDiscard,
    mustDiscardCount,
    canPass,
    canLockInstants,
    playableFieldCardUids,
    playableConversionUids,
    sacrificableBuildingUids,
    playableInstantUids,
    handPlayability,
  };
}
