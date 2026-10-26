// GDD §3.1, §3.3, §3.4, §4.1, TECH-SPEC §4.4, §4.5, Appendice A TV-01, TV-02, TV-03
// Modulo Economia: limiti di magazzino per Era, accredito con troncamento al cap ed emissione
// di ResourcesChanged e ResourcesOverflowed, Raccolto d'apertura d'Era e Rendite periodiche.

import type {
  GameEvent,
  ResourceChangeReason,
  ResourceOverflowReason,
} from './events.js';
import type {
  CardInstance,
  CardRules,
  EraNo,
  GameState,
  PlayerId,
  Resource,
  Resources,
} from './types.js';

export const RESOURCE_KEYS: readonly Resource[] = ['food', 'wood', 'metal'];

export const PLAYERS_ORDER: readonly PlayerId[] = ['P1', 'P2'];

/**
 * Cap di magazzino per singola risorsa per Era (GDD §3.1):
 * - Era I: 7
 * - Era II: 11
 * - Era III: 16
 */
export const STORAGE_CAP_BY_ERA: Readonly<Record<EraNo, number>> = {
  1: 7,
  2: 11,
  3: 16,
};

/**
 * Cap Logistico (massimo numero di nuove carte da campo Economia + Unità) per Era (GDD §4.1):
 * - Era I: 4
 * - Era II: 5
 * - Era III: 6
 */
export const LOGISTICS_CAP_BY_ERA: Readonly<Record<EraNo, number>> = {
  1: 4,
  2: 5,
  3: 6,
};

/**
 * Dotazione iniziale di risorse a inizio partita (GDD §3.3.1): 2 Cibo, 2 Legno, 0 Metallo.
 */
export const INITIAL_RESOURCES: Readonly<Resources> = {
  food: 2,
  wood: 2,
  metal: 0,
};

export const ZERO_RESOURCES: Readonly<Resources> = {
  food: 0,
  wood: 0,
  metal: 0,
};

/**
 * Restituisce il cap di magazzino per singola risorsa nell'Era specificata (GDD §3.1).
 */
export function getStorageCap(era: EraNo): number {
  return STORAGE_CAP_BY_ERA[era];
}

/**
 * Restituisce il Cap Logistico per nuove carte da campo nell'Era specificata (GDD §4.1).
 */
export function getLogisticsCap(era: EraNo): number {
  return LOGISTICS_CAP_BY_ERA[era];
}

/**
 * Crea una copia profonda di un oggetto Resources.
 */
export function cloneResources(resources: Readonly<Resources>): Resources {
  return {
    food: resources.food,
    wood: resources.wood,
    metal: resources.metal,
  };
}

/**
 * Somma componente per componente due vettori di risorse.
 */
export function addResources(
  a: Readonly<Resources>,
  b: Readonly<Resources>,
): Resources {
  return {
    food: a.food + b.food,
    wood: a.wood + b.wood,
    metal: a.metal + b.metal,
  };
}

/**
 * Moltiplica ogni componente di un vettore di risorse per uno scalare intero.
 */
export function scaleResources(
  resources: Readonly<Resources>,
  factor: number,
): Resources {
  return {
    food: resources.food * factor,
    wood: resources.wood * factor,
    metal: resources.metal * factor,
  };
}

/**
 * Verifica se il saldo `available` è sufficiente a coprire interamente il costo `cost`.
 */
export function canAfford(
  available: Readonly<Resources>,
  cost: Readonly<Resources>,
): boolean {
  return (
    available.food >= cost.food &&
    available.wood >= cost.wood &&
    available.metal >= cost.metal
  );
}

/**
 * Verifica se almeno una componente del vettore risorse è diversa da zero.
 */
export function hasNonZeroResources(resources: Readonly<Resources>): boolean {
  return (
    resources.food !== 0 || resources.wood !== 0 || resources.metal !== 0
  );
}

/**
 * Calcola la somma dei vettori `production` di tutti gli Edifici Economici attivi (GDD §3.3).
 */
export function sumBuildingsProduction(
  buildings: readonly CardInstance[],
  catalog: Readonly<Record<string, CardRules>>,
): Resources {
  let food = 0;
  let wood = 0;
  let metal = 0;

  for (const building of buildings) {
    const card = catalog[building.cardId];
    if (card === undefined) {
      throw new Error(
        `Card "${building.cardId}" (uid "${building.uid}") not found in catalog during building production calculation.`,
      );
    }
    if (card.production !== undefined) {
      food += card.production.food;
      wood += card.production.wood;
      metal += card.production.metal;
    }
  }

  return { food, wood, metal };
}

/**
 * Calcola il Raccolto d'apertura d'Era prima del Ciclo 1 (GDD §3.3.2, TV-01, TV-02):
 * - Era I: +2 Cibo, +2 Legno, +0 Metallo;
 * - Era II ed Era III: +2 Cibo, +2 Legno, +1 Metallo più 2x la produzione degli edifici attivi.
 */
export function calculateOpeningHarvest(
  era: EraNo,
  buildings: readonly CardInstance[],
  catalog: Readonly<Record<string, CardRules>>,
): Resources {
  if (era === 1) {
    return { food: 2, wood: 2, metal: 0 };
  }

  const buildingProd = sumBuildingsProduction(buildings, catalog);
  return {
    food: 2 + 2 * buildingProd.food,
    wood: 2 + 2 * buildingProd.wood,
    metal: 1 + 2 * buildingProd.metal,
  };
}

/**
 * Calcola la Rendita periodica all'apertura di un ciclo di sviluppo (GDD §3.3.4–7, TV-02):
 * - Ciclo 2 e Ciclo 3: +1 Cibo, +1 Legno, +0 Metallo più 1x la produzione degli edifici attivi;
 * - Ciclo 1 e Cicli >= 4: 0/0/0.
 */
export function calculatePeriodicRent(
  cycle: number,
  buildings: readonly CardInstance[],
  catalog: Readonly<Record<string, CardRules>>,
): Resources {
  if (cycle !== 2 && cycle !== 3) {
    return { food: 0, wood: 0, metal: 0 };
  }

  const buildingProd = sumBuildingsProduction(buildings, catalog);
  return {
    food: 1 + buildingProd.food,
    wood: 1 + buildingProd.wood,
    metal: buildingProd.metal,
  };
}

export interface CreditResourcesResult {
  resources: Resources;
  delta: Resources;
  overflow: Resources;
  hasOverflow: boolean;
  cap: number;
}

/**
 * Calcola in modo puro l'accredito di risorse con troncamento al cap dell'Era corrente (GDD §3.1, TV-03).
 */
export function creditResourcesWithCap(
  current: Readonly<Resources>,
  gain: Readonly<Resources>,
  era: EraNo,
): CreditResourcesResult {
  const cap = getStorageCap(era);

  const rawFood = current.food + gain.food;
  const rawWood = current.wood + gain.wood;
  const rawMetal = current.metal + gain.metal;

  const nextFood = Math.min(cap, Math.max(0, rawFood));
  const nextWood = Math.min(cap, Math.max(0, rawWood));
  const nextMetal = Math.min(cap, Math.max(0, rawMetal));

  const resources: Resources = {
    food: nextFood,
    wood: nextWood,
    metal: nextMetal,
  };

  const delta: Resources = {
    food: nextFood - current.food,
    wood: nextWood - current.wood,
    metal: nextMetal - current.metal,
  };

  const overflow: Resources = {
    food: Math.max(0, rawFood - cap),
    wood: Math.max(0, rawWood - cap),
    metal: Math.max(0, rawMetal - cap),
  };

  const hasOverflow =
    overflow.food > 0 || overflow.wood > 0 || overflow.metal > 0;

  return {
    resources,
    delta,
    overflow,
    hasOverflow,
    cap,
  };
}

/**
 * Accredita risorse al giocatore sullo stato/draft della partita applicando il cap dell'Era corrente
 * ed emettendo `ResourcesChanged` ed eventualmente `ResourcesOverflowed` (TECH-SPEC §4.4, §4.5, TV-03).
 */
export function creditPlayerResources(
  state: GameState,
  events: GameEvent[],
  player: PlayerId,
  gain: Readonly<Resources>,
  reason: ResourceOverflowReason | 'initial',
): CreditResourcesResult {
  const playerState = state.players[player];
  const result = creditResourcesWithCap(playerState.resources, gain, state.era);

  playerState.resources = cloneResources(result.resources);

  const changeReason: ResourceChangeReason = reason;
  events.push({
    n: ++state.counters.event,
    type: 'ResourcesChanged',
    player,
    reason: changeReason,
    delta: cloneResources(result.delta),
    resources: cloneResources(result.resources),
  });

  if (result.hasOverflow && reason !== 'initial') {
    events.push({
      n: ++state.counters.event,
      type: 'ResourcesOverflowed',
      player,
      reason,
      overflow: cloneResources(result.overflow),
      cap: result.cap,
    });
  }

  return result;
}

/**
 * Addebita un costo risorse al giocatore emettendo `ResourcesChanged { reason: 'cost' }`.
 * Solleva errore se il saldo disponibile è inferiore al costo richiesto.
 */
export function spendPlayerResources(
  state: GameState,
  events: GameEvent[],
  player: PlayerId,
  cost: Readonly<Resources>,
): Resources {
  const playerState = state.players[player];
  if (!canAfford(playerState.resources, cost)) {
    throw new Error(
      `Insufficient resources for player ${player}: available ${JSON.stringify(playerState.resources)}, cost ${JSON.stringify(cost)}.`,
    );
  }

  if (!hasNonZeroResources(cost)) {
    return cloneResources(playerState.resources);
  }

  const nextResources: Resources = {
    food: playerState.resources.food - cost.food,
    wood: playerState.resources.wood - cost.wood,
    metal: playerState.resources.metal - cost.metal,
  };

  playerState.resources = cloneResources(nextResources);

  events.push({
    n: ++state.counters.event,
    type: 'ResourcesChanged',
    player,
    reason: 'cost',
    delta: {
      food: -cost.food || 0,
      wood: -cost.wood || 0,
      metal: -cost.metal || 0,
    },
    resources: cloneResources(nextResources),
  });

  return nextResources;
}

/**
 * Applica il Raccolto d'apertura d'Era a entrambi i giocatori (P1 e P2) nell'ordine canonico (GDD §3.3.2).
 */
export function applyOpeningHarvest(
  state: GameState,
  events: GameEvent[],
): void {
  for (const player of PLAYERS_ORDER) {
    const harvest = calculateOpeningHarvest(
      state.era,
      state.players[player].buildings,
      state.catalog,
    );
    creditPlayerResources(state, events, player, harvest, 'harvest');
  }
}

/**
 * Applica la Rendita periodica del ciclo corrente (`state.cycle`) a entrambi i giocatori (GDD §3.3.4–6).
 * Eseguita solo se `state.cycle === 2 || state.cycle === 3`.
 */
export function applyPeriodicRent(
  state: GameState,
  events: GameEvent[],
): void {
  if (state.cycle !== 2 && state.cycle !== 3) {
    return;
  }

  for (const player of PLAYERS_ORDER) {
    const rent = calculatePeriodicRent(
      state.cycle,
      state.players[player].buildings,
      state.catalog,
    );
    creditPlayerResources(state, events, player, rent, 'rent');
  }
}
