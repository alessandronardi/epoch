// GDD §4.2, TECH-SPEC §5.1–5.5, §11 D3, Appendice A TV-25
// Proiezione di visibilità dello stato per singolo giocatore (playerView)
// e redazione deterministica degli eventi (projectEvent).

import { cloneResources } from './economy.js';
import type { GameEvent } from './events.js';
import { legalCommands } from './legal.js';
import { getOpponent } from './setup.js';
import type { GameState, PlayerId } from './types.js';
import type { PlayerView, PublicUnitView } from './view-types.js';

/**
 * Determina se nell'Era corrente sono già state rivelate pubblicamente le unità e le risorse
 * (ovvero dalla finestra `prebattle` fino a fine Era — GDD §4.2, TECH-SPEC §5.3).
 */
export function isPublicBattleStage(state: Readonly<GameState>): boolean {
  if (state.phase === 'prebattle') {
    return true;
  }
  if (state.phase === 'finished') {
    if (
      state.result?.kind === 'annihilation' ||
      state.result?.kind === 'points' ||
      state.result?.kind === 'draw'
    ) {
      return true;
    }
    return state.players.P1.passed && state.players.P2.passed;
  }
  return false;
}

/**
 * Proietta lo stato canonico `GameState` nella vista filtrata `PlayerView` per `viewer`,
 * oscurando tutte le informazioni nascoste dell'avversario secondo la Matrice §5.3 e la Decisione `D3`.
 */
export function playerView(state: Readonly<GameState>, viewer: PlayerId): PlayerView {
  const opponentId = getOpponent(viewer);
  const selfState = state.players[viewer];
  const oppState = state.players[opponentId];

  const revealedStage = isPublicBattleStage(state);

  const opponentUnits: PublicUnitView[] | null = revealedStage
    ? oppState.units
        .filter((u) => u.revealed)
        .map((u) => ({
          uid: u.uid,
          cardId: u.cardId,
          owner: u.owner,
          seq: u.seq,
          hp: u.hp,
          line: u.line,
          atkMod: u.atkMod,
          revealed: u.revealed,
        }))
    : null;

  const opponentCoveredCount = revealedStage
    ? oppState.buildings.length + oppState.units.filter((u) => !u.revealed).length
    : oppState.units.length + oppState.buildings.length;

  return {
    me: viewer,
    stateVersion: state.stateVersion,
    era: state.era,
    phase: state.phase,
    cycle: state.cycle,
    initiative: state.initiative,
    toAct: state.toAct,
    deadline: null,
    self: {
      hand: selfState.hand.map((c) => ({ ...c })),
      resources: cloneResources(selfState.resources),
      buildings: selfState.buildings.map((b) => ({ ...b })),
      units: selfState.units.map((u) => ({ ...u })),
      discard: selfState.discard.map((d) => ({ ...d })),
      walls: selfState.walls,
      cityHp: selfState.cityMax - selfState.cityDamage,
      cityMax: selfState.cityMax,
      cityDamage: selfState.cityDamage,
      demBonus: selfState.demBonus,
      slotsUsed: selfState.slotsUsed,
      passed: selfState.passed,
      committed: state.pending[viewer] !== undefined,
      subdeckCounts: {
        1: selfState.subdecks[1].length,
        2: selfState.subdecks[2].length,
        3: selfState.subdecks[3].length,
      },
      legal: legalCommands(state, viewer),
    },
    opponent: {
      handCount: oppState.hand.length,
      resources: revealedStage ? cloneResources(oppState.resources) : null,
      coveredCount: opponentCoveredCount,
      units: opponentUnits,
      walls: oppState.walls,
      cityHp: oppState.cityMax - oppState.cityDamage,
      cityMax: oppState.cityMax,
      cityDamage: oppState.cityDamage,
      demBonus: oppState.demBonus,
      slotsUsed: oppState.slotsUsed,
      passed: oppState.passed,
      committed: state.pending[opponentId] !== undefined,
      discardCount: oppState.discard.length,
      publicDiscard: oppState.publicDiscard.slice(),
      subdeckCounts: {
        1: oppState.subdecks[1].length,
        2: oppState.subdecks[2].length,
        3: oppState.subdecks[3].length,
      },
    },
    result: state.result !== null ? { ...state.result } : null,
  };
}

/**
 * Restituisce una copia redatta dell'evento `event` autorizzata per `viewer`,
 * oppure `null` se `viewer` non deve ricevere alcuna notifica per quell'evento interno
 * (TECH-SPEC §5.4, Decisione `D3`).
 */
export function projectEvent(event: GameEvent, viewer: PlayerId): GameEvent | null {
  switch (event.type) {
    case 'GameStarted':
    case 'InitiativeAssigned':
    case 'PlayerCommitted':
    case 'CycleStarted':
    case 'PlayerPassed':
    case 'DevelopmentEnded':
    case 'BattleOutcome':
    case 'SiegeResolved':
    case 'RaidResolved':
    case 'GameEnded':
      return { ...event };

    case 'EraStarted':
    case 'BattleStarted':
    case 'UnitsRevealed':
    case 'InstantsRevealed':
    case 'WallsModified':
    case 'BattlePhaseResolved':
    case 'EraEnded':
      return structuredClone(event);

    case 'CardsDrawn':
      if (event.player === viewer) {
        return structuredClone(event);
      }
      return {
        n: event.n,
        type: 'CardsDrawn',
        player: event.player,
        era: event.era,
        count: event.count,
      };

    case 'MulliganResolved':
      if (event.player === viewer) {
        return structuredClone(event);
      }
      return {
        n: event.n,
        type: 'MulliganResolved',
        player: event.player,
        count: event.count,
      };

    case 'HandLimitDiscarded':
      if (event.player === viewer) {
        return structuredClone(event);
      }
      // D3: l'avversario vede solo il conteggio delle carte scartate, mai le identità
      return {
        n: event.n,
        type: 'HandLimitDiscarded',
        player: event.player,
        count: event.count,
      };

    case 'ResourcesChanged':
      if (event.player === viewer || event.reason === 'conversion' || event.reason === 'raid') {
        return structuredClone(event);
      }
      return null;

    case 'ResourcesOverflowed':
      if (event.player === viewer || event.reason === 'conversion' || event.reason === 'raid') {
        return structuredClone(event);
      }
      return null;

    case 'CardPlayed':
      if (event.player === viewer) {
        return structuredClone(event);
      }
      // Per l'avversario: solo player, slotsUsed e coveredCount (nessun uid, cardId né cardType)
      return {
        n: event.n,
        type: 'CardPlayed',
        player: event.player,
        slotsUsed: event.slotsUsed,
        coveredCount: event.coveredCount,
      };

    case 'ConversionActivated':
      if (event.player === viewer) {
        return structuredClone(event);
      }
      // D3: la Riconversione è pubblica, ma l'edificio sacrificato resta nascosto
      return {
        n: event.n,
        type: 'ConversionActivated',
        player: event.player,
        uid: event.uid,
        cardId: event.cardId,
        gain: cloneResources(event.gain),
        demBonusGained: event.demBonusGained,
        coveredCount: event.coveredCount,
      };
  }
}
