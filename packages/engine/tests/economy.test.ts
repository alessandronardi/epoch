import { describe, expect, it } from 'vitest';
import {
  INITIAL_RESOURCES,
  LOGISTICS_CAP_BY_ERA,
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
  scaleResources,
  spendPlayerResources,
  sumBuildingsProduction,
} from '../src/economy.js';
import { DEFAULT_RULES_CONFIG } from '../src/types.js';
import type {
  CardInstance,
  CardRules,
  EraNo,
  GameState,
  PlayerState,
  Resources,
} from '../src/types.js';
import type { GameEvent } from '../src/events.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function createEmptyPlayerState(resources: Resources = { food: 0, wood: 0, metal: 0 }): PlayerState {
  return {
    hand: [],
    subdecks: { 1: [], 2: [], 3: [] },
    discard: [],
    publicDiscard: [],
    resources: cloneResources(resources),
    buildings: [],
    units: [],
    slotsUsed: 0,
    passed: false,
    walls: 6,
    cityMax: 10,
    cityDamage: 0,
    demBonus: 0,
    mulliganDone: true,
    consecutiveTimeouts: 0,
  };
}

function createMockGameState(era: EraNo = 1): GameState {
  return {
    schemaVersion: 1,
    rulesetVersion: '1.0',
    catalogVersion: '1.0',
    stateVersion: 0,
    rules: structuredClone(DEFAULT_RULES_CONFIG),
    catalog,
    seed: 'test-seed',
    rngState: [1, 2, 3, 4],
    era,
    phase: 'development',
    cycle: 1,
    initiative: 'P1',
    toAct: 'P1',
    players: {
      P1: createEmptyPlayerState(),
      P2: createEmptyPlayerState(),
    },
    pending: {},
    counters: { uid: 0, drawnOrder: 0, seq: 0, event: 0 },
    result: null,
  };
}

function assertResourceInvariant(resources: Resources, era: EraNo): void {
  const cap = getStorageCap(era);
  for (const key of ['food', 'wood', 'metal'] as const) {
    expect(Number.isInteger(resources[key])).toBe(true);
    expect(resources[key]).toBeGreaterThanOrEqual(0);
    expect(resources[key]).toBeLessThanOrEqual(cap);
  }
}

describe('Economy Module — Storage Caps & Resource Helpers (GDD §3.1, §4.1)', () => {
  it('returns the normative storage caps per Era (7 in Era I, 11 in Era II, 16 in Era III)', () => {
    expect(STORAGE_CAP_BY_ERA).toEqual({ 1: 7, 2: 11, 3: 16 });
    expect(getStorageCap(1)).toBe(7);
    expect(getStorageCap(2)).toBe(11);
    expect(getStorageCap(3)).toBe(16);
  });

  it('returns the normative logistics caps per Era (4 in Era I, 5 in Era II, 6 in Era III)', () => {
    expect(LOGISTICS_CAP_BY_ERA).toEqual({ 1: 4, 2: 5, 3: 6 });
    expect(getLogisticsCap(1)).toBe(4);
    expect(getLogisticsCap(2)).toBe(5);
    expect(getLogisticsCap(3)).toBe(6);
  });

  it('supports pure resource arithmetic and affordability checks', () => {
    expect(ZERO_RESOURCES).toEqual({ food: 0, wood: 0, metal: 0 });
    expect(INITIAL_RESOURCES).toEqual({ food: 2, wood: 2, metal: 0 });

    const a: Resources = { food: 2, wood: 1, metal: 3 };
    const b: Resources = { food: 1, wood: 4, metal: 0 };
    expect(addResources(a, b)).toEqual({ food: 3, wood: 5, metal: 3 });
    expect(scaleResources(a, 2)).toEqual({ food: 4, wood: 2, metal: 6 });

    expect(canAfford({ food: 3, wood: 2, metal: 1 }, { food: 3, wood: 2, metal: 1 })).toBe(true);
    expect(canAfford({ food: 3, wood: 2, metal: 1 }, { food: 4, wood: 0, metal: 0 })).toBe(false);
    expect(canAfford({ food: 3, wood: 2, metal: 1 }, { food: 0, wood: 3, metal: 0 })).toBe(false);
    expect(canAfford({ food: 3, wood: 2, metal: 1 }, { food: 0, wood: 0, metal: 2 })).toBe(false);
  });
});

describe('Economy Module — Nominal Test Vectors TV-01, TV-02, TV-03 (Appendice A)', () => {
  it('TV-01: Initial resources (2/2/0) followed by Era I opening harvest (+2/+2/+0) gives (4/4/0) at Cycle 1', () => {
    const state = createMockGameState(1);
    const events: GameEvent[] = [];

    // 1. Initial resource endowment: 2 food, 2 wood, 0 metal
    creditPlayerResources(state, events, 'P1', INITIAL_RESOURCES, 'initial');
    creditPlayerResources(state, events, 'P2', INITIAL_RESOURCES, 'initial');

    expect(state.players.P1.resources).toEqual({ food: 2, wood: 2, metal: 0 });
    expect(state.players.P2.resources).toEqual({ food: 2, wood: 2, metal: 0 });
    assertResourceInvariant(state.players.P1.resources, 1);
    assertResourceInvariant(state.players.P2.resources, 1);

    // 2. Era I Opening Harvest: +2 food, +2 wood, +0 metal
    const harvestEra1 = calculateOpeningHarvest(1, state.players.P1.buildings, catalog);
    expect(harvestEra1).toEqual({ food: 2, wood: 2, metal: 0 });

    applyOpeningHarvest(state, events);

    expect(state.players.P1.resources).toEqual({ food: 4, wood: 4, metal: 0 });
    expect(state.players.P2.resources).toEqual({ food: 4, wood: 4, metal: 0 });
    assertResourceInvariant(state.players.P1.resources, 1);
    assertResourceInvariant(state.players.P2.resources, 1);

    // Verify emitted events (2 initial + 2 harvest, 0 overflow)
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({
      n: 1,
      type: 'ResourcesChanged',
      player: 'P1',
      reason: 'initial',
      delta: { food: 2, wood: 2, metal: 0 },
      resources: { food: 2, wood: 2, metal: 0 },
    });
    expect(events[2]).toEqual({
      n: 3,
      type: 'ResourcesChanged',
      player: 'P1',
      reason: 'harvest',
      delta: { food: 2, wood: 2, metal: 0 },
      resources: { food: 4, wood: 4, metal: 0 },
    });
  });

  it('TV-02: Era II with Fattoria (1,0,0) and Fonderia (0,0,2) active -> opening harvest (4,2,5) and Cycle 2/3 rent (2,1,2)', () => {
    const buildings: CardInstance[] = [
      { uid: 'uid_P1_0001', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 }, // Fattoria: +1 food
      { uid: 'uid_P1_0002', cardId: 'e2_fnd', owner: 'P1', drawnOrder: 2 }, // Fonderia: +2 metal
    ];

    const prod = sumBuildingsProduction(buildings, catalog);
    expect(prod).toEqual({ food: 1, wood: 0, metal: 2 });

    // Opening Harvest in Era II: (2,2,1) + 2*(1,0,2) = (4,2,5)
    const harvest = calculateOpeningHarvest(2, buildings, catalog);
    expect(harvest).toEqual({ food: 4, wood: 2, metal: 5 });

    // Periodic Rent at Cycle 2 and Cycle 3: (1,1,0) + 1*(1,0,2) = (2,1,2)
    const rentCycle2 = calculatePeriodicRent(2, buildings, catalog);
    const rentCycle3 = calculatePeriodicRent(3, buildings, catalog);
    expect(rentCycle2).toEqual({ food: 2, wood: 1, metal: 2 });
    expect(rentCycle3).toEqual({ food: 2, wood: 1, metal: 2 });

    // Cycle 1 and Cycle 4+ have no periodic rent
    expect(calculatePeriodicRent(1, buildings, catalog)).toEqual({
      food: 0,
      wood: 0,
      metal: 0,
    });
    expect(calculatePeriodicRent(4, buildings, catalog)).toEqual({
      food: 0,
      wood: 0,
      metal: 0,
    });

    // Verify state application in Era II (cap = 11)
    const state = createMockGameState(2);
    state.players.P1.buildings = buildings;
    const events: GameEvent[] = [];

    applyOpeningHarvest(state, events);
    expect(state.players.P1.resources).toEqual({ food: 4, wood: 2, metal: 5 });
    assertResourceInvariant(state.players.P1.resources, 2);

    state.cycle = 2;
    applyPeriodicRent(state, events);
    expect(state.players.P1.resources).toEqual({ food: 6, wood: 3, metal: 7 });
    assertResourceInvariant(state.players.P1.resources, 2);

    state.cycle = 3;
    applyPeriodicRent(state, events);
    expect(state.players.P1.resources).toEqual({ food: 8, wood: 4, metal: 9 });
    assertResourceInvariant(state.players.P1.resources, 2);
  });

  it('TV-03: Era I with resources (6,6,0) and credit +2 food truncates food to 7 and emits ResourcesOverflowed with overflow 1', () => {
    const state = createMockGameState(1);
    state.players.P1.resources = { food: 6, wood: 6, metal: 0 };
    const events: GameEvent[] = [];

    const result = creditPlayerResources(
      state,
      events,
      'P1',
      { food: 2, wood: 0, metal: 0 },
      'harvest',
    );

    expect(result.resources).toEqual({ food: 7, wood: 6, metal: 0 });
    expect(result.delta).toEqual({ food: 1, wood: 0, metal: 0 });
    expect(result.overflow).toEqual({ food: 1, wood: 0, metal: 0 });
    expect(result.hasOverflow).toBe(true);
    expect(result.cap).toBe(7);
    expect(state.players.P1.resources).toEqual({ food: 7, wood: 6, metal: 0 });
    assertResourceInvariant(state.players.P1.resources, 1);

    expect(events).toEqual([
      {
        n: 1,
        type: 'ResourcesChanged',
        player: 'P1',
        reason: 'harvest',
        delta: { food: 1, wood: 0, metal: 0 },
        resources: { food: 7, wood: 6, metal: 0 },
      },
      {
        n: 2,
        type: 'ResourcesOverflowed',
        player: 'P1',
        reason: 'harvest',
        overflow: { food: 1, wood: 0, metal: 0 },
        cap: 7,
      },
    ]);
  });
});

describe('Economy Module — Edge Cases & Formal Invariant Verification', () => {
  it('enforces caps in Era II (11) and Era III (16) and maintains 0 <= resources[r] <= cap(era)', () => {
    const resEra2 = creditResourcesWithCap(
      { food: 10, wood: 11, metal: 8 },
      { food: 4, wood: 2, metal: 5 },
      2,
    );
    expect(resEra2.resources).toEqual({ food: 11, wood: 11, metal: 11 });
    expect(resEra2.delta).toEqual({ food: 1, wood: 0, metal: 3 });
    expect(resEra2.overflow).toEqual({ food: 3, wood: 2, metal: 2 });
    expect(resEra2.hasOverflow).toBe(true);
    expect(resEra2.cap).toBe(11);
    assertResourceInvariant(resEra2.resources, 2);

    const resEra3 = creditResourcesWithCap(
      { food: 15, wood: 14, metal: 16 },
      { food: 3, wood: 2, metal: 4 },
      3,
    );
    expect(resEra3.resources).toEqual({ food: 16, wood: 16, metal: 16 });
    expect(resEra3.delta).toEqual({ food: 1, wood: 2, metal: 0 });
    expect(resEra3.overflow).toEqual({ food: 2, wood: 0, metal: 4 });
    expect(resEra3.hasOverflow).toBe(true);
    expect(resEra3.cap).toBe(16);
    assertResourceInvariant(resEra3.resources, 3);
  });

  it('spends resources and emits ResourcesChanged with reason "cost" and negative delta', () => {
    const state = createMockGameState(1);
    state.players.P1.resources = { food: 4, wood: 4, metal: 0 };
    const events: GameEvent[] = [];

    spendPlayerResources(state, events, 'P1', { food: 0, wood: 2, metal: 0 });
    expect(state.players.P1.resources).toEqual({ food: 4, wood: 2, metal: 0 });
    assertResourceInvariant(state.players.P1.resources, 1);

    expect(events).toEqual([
      {
        n: 1,
        type: 'ResourcesChanged',
        player: 'P1',
        reason: 'cost',
        delta: { food: 0, wood: -2, metal: 0 },
        resources: { food: 4, wood: 2, metal: 0 },
      },
    ]);

    // Spend food and metal as well
    spendPlayerResources(state, events, 'P1', { food: 1, wood: 0, metal: 0 });
    expect(state.players.P1.resources).toEqual({ food: 3, wood: 2, metal: 0 });

    // Zero cost does not emit a redundant event
    spendPlayerResources(state, events, 'P1', { food: 0, wood: 0, metal: 0 });
    expect(events).toHaveLength(2);

    // Spending more than available throws
    expect(() =>
      spendPlayerResources(state, events, 'P1', { food: 5, wood: 0, metal: 0 }),
    ).toThrow(/Insufficient resources/);
  });

  it('does not emit periodic rent events on Cycle 1 or Cycle 4+', () => {
    const state = createMockGameState(1);
    const events: GameEvent[] = [];

    state.cycle = 1;
    applyPeriodicRent(state, events);
    expect(events).toHaveLength(0);

    state.cycle = 4;
    applyPeriodicRent(state, events);
    expect(events).toHaveLength(0);
  });

  it('throws if a building cardId does not exist in catalog and ignores cards without production', () => {
    const nonProductionCard: CardInstance[] = [
      { uid: 'u1', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 1 },
    ];
    expect(sumBuildingsProduction(nonProductionCard, catalog)).toEqual({
      food: 0,
      wood: 0,
      metal: 0,
    });

    const invalidBuildings: CardInstance[] = [
      { uid: 'bad_1', cardId: 'unknown_building', owner: 'P1', drawnOrder: 1 },
    ];
    expect(() => sumBuildingsProduction(invalidBuildings, catalog)).toThrow(
      /not found in catalog/,
    );
  });
});
