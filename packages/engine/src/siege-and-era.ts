// GDD §5.1, §5.3 Fase 4, §6, TECH-SPEC §4.7, §4.8 Fase 4, §4.9, §11.2 R1–R3, Appendice A TV-04..TV-07c, TV-14, TV-23
// Gestione di LockInstants in prebattle, esecuzione automatica della Battaglia Campale,
// Fase 4 (Demolizione, Breccia, Razzia) e Transizione d'Era / Condizioni di Vittoria.

import { produce } from 'immer';
import { resolveFieldBattle } from './battle.js';
import type { LockInstantsCommand, Result, RuleError } from './commands.js';
import {
  calculateTotalEffectiveDem,
  startNextEra,
} from './development.js';
import {
  PLAYERS_ORDER,
  ZERO_RESOURCES,
  addResources,
  canAfford,
  cloneResources,
  getStorageCap,
  spendPlayerResources,
} from './economy.js';
import type { GameEvent } from './events.js';
import { ERA_BASE_WALLS, ERA_CITY_MAX, getOpponent } from './setup.js';
import type {
  CardInstance,
  EraNo,
  GameState,
  PlayerId,
  Resources,
} from './types.js';

export interface SiegeCalculation {
  D: number;
  W: number;
  breach: boolean;
  wallsAfter: number;
  directDamage: number;
}

export interface RaidCalculation {
  foodTransferred: number;
  woodTransferred: number;
}

/**
 * Calcola gli HP delle Mura all'inizio di una nuova Era (Era II o Era III) con la formula
 * `Base_nuovaEra + floor(walls_residui / 2)` (GDD §6, TECH-SPEC §4.9, TV-04, TV-04b).
 */
export function calculateWallCarryover(
  nextEra: 2 | 3,
  remainingWalls: number,
): number {
  return ERA_BASE_WALLS[nextEra] + Math.floor(remainingWalls / 2);
}

/**
 * Calcola gli HP correnti e massimi del Centro Città nell'Era indicata dato il danno diretto accumulato
 * (`cityHp = Max_Era - cityDamage` — GDD §6, TECH-SPEC §4.9, TV-05).
 */
export function calculateCityHp(
  era: EraNo,
  cityDamage: number,
): { cityHp: number; cityMax: number } {
  const cityMax = ERA_CITY_MAX[era];
  return {
    cityHp: cityMax - cityDamage,
    cityMax,
  };
}

/**
 * Calcola in modo puro l'esito matematico dell'Assedio (Fase 4) dati `D` (DEM totale superstiti attaccante)
 * e `W` (HP Mura correnti difensore) secondo GDD §5.3 Fase 4 e TECH-SPEC §4.8 (TV-06):
 * 1. `breach = (D > 0) && (D >= W)`
 * 2. `wallsAfter = max(0, W - D)`
 * 3. `directDamage = max(0, D - W)`
 */
export function calculateSiege(D: number, W: number): SiegeCalculation {
  const breach = D > 0 && D >= W;
  const wallsAfter = Math.max(0, W - D);
  const directDamage = Math.max(0, D - W);

  return {
    D,
    W,
    breach,
    wallsAfter,
    directDamage,
  };
}

/**
 * Calcola le risorse trasferite nella Razzia post-breccia (GDD §5.3 Fase 4, TECH-SPEC §4.8, TV-07, TV-07b):
 * per Cibo e Legno trasferisce `min(1, risorsa_difensore, cap_Era - risorsa_attaccante)`.
 * Il Metallo non viene mai razziato.
 */
export function calculateRaidTransfer(
  attackerResources: Readonly<Resources>,
  defenderResources: Readonly<Resources>,
  era: EraNo,
): RaidCalculation {
  const cap = getStorageCap(era);
  const foodTransferred = Math.min(
    1,
    defenderResources.food,
    Math.max(0, cap - attackerResources.food),
  );
  const woodTransferred = Math.min(
    1,
    defenderResources.wood,
    Math.max(0, cap - attackerResources.wood),
  );

  return {
    foodTransferred,
    woodTransferred,
  };
}

/**
 * Esegue la Fase 4 (Demolizione, Breccia e Razzia) quando `attacker` ha ottenuto la vittoria campale.
 * Restituisce `true` se la partita è terminata immediatamente per `annihilation` (`cityHp <= 0`),
 * altrimenti `false` (GDD §5.3 Fase 4, TECH-SPEC §4.8, TV-06, TV-07, TV-07b, TV-07c).
 */
export function resolveSiegeAndRaid(
  draft: GameState,
  events: GameEvent[],
  attacker: PlayerId,
): boolean {
  const defender = getOpponent(attacker);
  const attackerState = draft.players[attacker];
  const defenderState = draft.players[defender];

  const D = calculateTotalEffectiveDem(attackerState, draft.catalog);
  const W = defenderState.walls;
  const { breach, wallsAfter, directDamage } = calculateSiege(D, W);

  defenderState.walls = wallsAfter;
  defenderState.cityDamage += directDamage;
  const cityHpAfter = defenderState.cityMax - defenderState.cityDamage;

  events.push({
    n: ++draft.counters.event,
    type: 'SiegeResolved',
    era: draft.era,
    attacker,
    defender,
    D,
    W,
    breach,
    wallsAfter,
    directDamage,
    cityHpAfter,
  });

  // Se HP Centro Città <= 0: vittoria immediata per annihilation senza razzia (TV-07c)
  if (cityHpAfter <= 0) {
    draft.phase = 'finished';
    draft.toAct = null;
    draft.result = {
      kind: 'annihilation',
      winner: attacker,
    };

    events.push({
      n: ++draft.counters.event,
      type: 'GameEnded',
      kind: 'annihilation',
      winner: attacker,
    });

    return true;
  }

  // Altrimenti, se breach === true: esegui la razzia di max 1 Cibo e 1 Legno (TV-07, TV-07b)
  if (breach) {
    const { foodTransferred, woodTransferred } = calculateRaidTransfer(
      attackerState.resources,
      defenderState.resources,
      draft.era,
    );

    if (foodTransferred > 0 || woodTransferred > 0) {
      defenderState.resources.food -= foodTransferred;
      defenderState.resources.wood -= woodTransferred;

      events.push({
        n: ++draft.counters.event,
        type: 'ResourcesChanged',
        player: defender,
        reason: 'raid',
        delta: {
          food: -foodTransferred || 0,
          wood: -woodTransferred || 0,
          metal: 0,
        },
        resources: cloneResources(defenderState.resources),
      });

      attackerState.resources.food += foodTransferred;
      attackerState.resources.wood += woodTransferred;

      events.push({
        n: ++draft.counters.event,
        type: 'ResourcesChanged',
        player: attacker,
        reason: 'raid',
        delta: {
          food: foodTransferred,
          wood: woodTransferred,
          metal: 0,
        },
        resources: cloneResources(attackerState.resources),
      });
    }

    events.push({
      n: ++draft.counters.event,
      type: 'RaidResolved',
      era: draft.era,
      attacker,
      defender,
      foodTransferred,
      woodTransferred,
    });
  }

  return false;
}

/**
 * Esegue la transizione di Fine Era (GDD §6, TECH-SPEC §4.9, TV-23):
 * - Scarta tutte le unità superstiti (combattenti e d'Assedio) di entrambi i giocatori in `discard` e `publicDiscard`;
 * - Emette `EraEnded`;
 * - Se siamo in Era I o II, avvia l'Era successiva (`startNextEra`);
 * - Se siamo in Era III, determina il vincitore ai punti (`points`) o il pareggio (`draw`) confrontando `cityHp`.
 */
export function resolveEndOfEra(draft: GameState, events: GameEvent[]): void {
  const discardedUnitUids: Record<PlayerId, string[]> = {
    P1: [],
    P2: [],
  };

  for (const player of PLAYERS_ORDER) {
    const playerState = draft.players[player];
    for (const unit of playerState.units) {
      discardedUnitUids[player].push(unit.uid);
      const discardedCard: CardInstance = {
        uid: unit.uid,
        cardId: unit.cardId,
        owner: unit.owner,
        drawnOrder: unit.drawnOrder,
      };
      playerState.discard.push(discardedCard);
      playerState.publicDiscard.push(unit.cardId);
    }
    playerState.units = [];
  }

  events.push({
    n: ++draft.counters.event,
    type: 'EraEnded',
    era: draft.era,
    discardedUnitUids,
  });

  if (draft.era === 1) {
    startNextEra(draft, events, 2);
    return;
  }

  if (draft.era === 2) {
    startNextEra(draft, events, 3);
    return;
  }

  // Fine Era III: confronto HP residui dei due Centri Città (TV-23)
  const p1CityHp = draft.players.P1.cityMax - draft.players.P1.cityDamage;
  const p2CityHp = draft.players.P2.cityMax - draft.players.P2.cityDamage;

  draft.phase = 'finished';
  draft.toAct = null;

  if (p1CityHp > p2CityHp) {
    draft.result = { kind: 'points', winner: 'P1' };
  } else if (p2CityHp > p1CityHp) {
    draft.result = { kind: 'points', winner: 'P2' };
  } else {
    draft.result = { kind: 'draw', winner: 'DRAW' };
  }

  events.push({
    n: ++draft.counters.event,
    type: 'GameEnded',
    kind: draft.result.kind,
    winner: draft.result.winner,
  });
}

/**
 * Valida in modo puro il comando `LockInstants` nella finestra simultanea `prebattle` (TECH-SPEC §4.7.2).
 */
export function validateLockInstants(
  state: Readonly<GameState>,
  cmd: LockInstantsCommand,
): RuleError | null {
  if (state.phase !== 'prebattle') {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot lock instants in phase "${state.phase}" (expected "prebattle").`,
    };
  }

  if (state.pending[cmd.player] !== undefined) {
    return {
      code: 'DECISION_ALREADY_LOCKED',
      message: `Player ${cmd.player} has already locked their prebattle instants decision.`,
    };
  }

  const playerState = state.players[cmd.player];
  const handByUid = new Map(playerState.hand.map((c) => [c.uid, c]));
  const seenUids = new Set<string>();
  let totalCost: Resources = { ...ZERO_RESOURCES };

  for (const uid of cmd.cardUids) {
    if (seenUids.has(uid) || !handByUid.has(uid)) {
      return {
        code: 'CARD_NOT_IN_HAND',
        message: `Card "${uid}" is not a distinct card in ${cmd.player}'s hand.`,
      };
    }
    seenUids.add(uid);

    const card = handByUid.get(uid)!;
    const rules = state.catalog[card.cardId];
    if (rules === undefined || rules.type !== 'instant') {
      return {
        code: 'INVALID_PHASE',
        message: `Card "${card.cardId}" (uid "${uid}") is not an instant card and cannot be played in prebattle.`,
      };
    }

    totalCost = addResources(totalCost, rules.cost);
  }

  if (!canAfford(playerState.resources, totalCost)) {
    return {
      code: 'INSUFFICIENT_RESOURCES',
      message: `Player ${cmd.player} cannot afford the aggregate cost of selected instants.`,
    };
  }

  return null;
}

/**
 * Applica in-place su un draft `GameState` il comando `LockInstants`.
 * Quando entrambi i giocatori hanno confermato:
 * 1. Rimuove le Istantanee scelte dalla mano, le sposta in `discard` e `publicDiscard`, emette `InstantsRevealed` e scala i costi;
 * 2. Applica i modificatori `atk_mod` alle unità bersaglio (`R2`) e i modificatori `walls_mod` con somma algebrica e clamp finale a `0` (`R3`, `TV-14`), emettendo `WallsModified`;
 * 3. Esegue la battaglia campale (`resolveFieldBattle`), l'eventuale Fase 4 (`resolveSiegeAndRaid`) e la transizione di Fine Era (`resolveEndOfEra`).
 */
export function mutateLockInstants(
  draft: GameState,
  cmd: LockInstantsCommand,
  events: GameEvent[],
): Result<void, RuleError> {
  const validationError = validateLockInstants(draft, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  draft.pending[cmd.player] = {
    window: 'prebattle',
    cardUids: cmd.cardUids.slice(),
  };

  events.push({
    n: ++draft.counters.event,
    type: 'PlayerCommitted',
    player: cmd.player,
    window: 'prebattle',
  });

  if (draft.pending.P1 !== undefined && draft.pending.P2 !== undefined) {
    const playedCards: Record<PlayerId, CardInstance[]> = {
      P1: [],
      P2: [],
    };
    const totalCosts: Record<PlayerId, Resources> = {
      P1: { ...ZERO_RESOURCES },
      P2: { ...ZERO_RESOURCES },
    };

    for (const player of PLAYERS_ORDER) {
      const commit = draft.pending[player]!;
      const playerState = draft.players[player];
      const handByUid = new Map(playerState.hand.map((c) => [c.uid, c]));
      const chosenSet = new Set(commit.cardUids);

      // Preserva l'ordine delle carte inviate nel comando per il log ma l'effetto è invariante rispetto all'ordine (§4.7.3)
      for (const uid of commit.cardUids) {
        const card = handByUid.get(uid)!;
        playedCards[player].push(card);
        const rules = draft.catalog[card.cardId]!;
        totalCosts[player] = addResources(totalCosts[player], rules.cost);
      }

      playerState.hand = playerState.hand.filter((c) => !chosenSet.has(c.uid));
    }

    events.push({
      n: ++draft.counters.event,
      type: 'InstantsRevealed',
      era: draft.era,
      played: {
        P1: playedCards.P1.map((c) => ({ uid: c.uid, cardId: c.cardId })),
        P2: playedCards.P2.map((c) => ({ uid: c.uid, cardId: c.cardId })),
      },
    });

    for (const player of PLAYERS_ORDER) {
      spendPlayerResources(draft, events, player, totalCosts[player]);
      const playerState = draft.players[player];
      for (const card of playedCards[player]) {
        playerState.discard.push(card);
        playerState.publicDiscard.push(card.cardId);
      }
    }

    // Applicazione modificatori ATK (R2) e calcolo somme algebriche Mura (R3, TV-14)
    const wallsBefore: Record<PlayerId, number> = {
      P1: draft.players.P1.walls,
      P2: draft.players.P2.walls,
    };
    const deltaOwn: Record<PlayerId, number> = { P1: 0, P2: 0 };
    const deltaEnemy: Record<PlayerId, number> = { P1: 0, P2: 0 };

    for (const player of PLAYERS_ORDER) {
      const enemy = getOpponent(player);
      const ownUnits = draft.players[player].units;

      for (const card of playedCards[player]) {
        const rules = draft.catalog[card.cardId]!;
        const effect = rules.effect;
        if (effect === undefined) {
          continue;
        }

        if (effect.kind === 'atk_mod') {
          for (const unit of ownUnits) {
            const unitRules = draft.catalog[unit.cardId]!;
            if (
              effect.target === 'own_archers' &&
              unitRules.category === 'archer'
            ) {
              unit.atkMod += effect.amount;
            } else if (
              effect.target === 'own_front' &&
              unit.line === 'front'
            ) {
              unit.atkMod += effect.amount;
            }
          }
        } else if (effect.kind === 'walls_mod') {
          if (effect.target === 'own') {
            deltaOwn[player] += effect.amount;
          } else {
            deltaEnemy[enemy] += effect.amount;
          }
        }
      }
    }

    const wallsAfter: Record<PlayerId, number> = {
      P1: Math.max(0, wallsBefore.P1 + deltaOwn.P1 + deltaEnemy.P1),
      P2: Math.max(0, wallsBefore.P2 + deltaOwn.P2 + deltaEnemy.P2),
    };

    draft.players.P1.walls = wallsAfter.P1;
    draft.players.P2.walls = wallsAfter.P2;

    events.push({
      n: ++draft.counters.event,
      type: 'WallsModified',
      era: draft.era,
      wallsBefore,
      deltaOwn,
      deltaEnemy,
      wallsAfter,
    });

    draft.pending = {};

    // Esecuzione automatica della Battaglia Campale (Fasi 1, 2A, 2B, 3)
    const battleOutcome = resolveFieldBattle(draft, events);

    // Fase 4 (Demolizione, Breccia, Razzia) solo se c'è un vincitore campale
    if (
      battleOutcome.kind === 'winner' &&
      battleOutcome.winner !== undefined
    ) {
      const gameEndedByAnnihilation = resolveSiegeAndRaid(
        draft,
        events,
        battleOutcome.winner,
      );
      if (gameEndedByAnnihilation) {
        return { ok: true, value: undefined };
      }
    }

    // Fine Era e transizione all'Era successiva o verdetto finale di Era III
    resolveEndOfEra(draft, events);
  }

  return { ok: true, value: undefined };
}

/**
 * Funzione pura e immutabile per gestire `LockInstants` in `prebattle`.
 */
export function lockInstants(
  state: GameState,
  cmd: LockInstantsCommand,
): Result<{ state: GameState; events: GameEvent[] }, RuleError> {
  const validationError = validateLockInstants(state, cmd);
  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    draft.players[cmd.player].consecutiveTimeouts = 0;
    mutateLockInstants(draft, cmd, events);
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
