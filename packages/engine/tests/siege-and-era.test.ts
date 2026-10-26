import { describe, expect, it } from 'vitest';
import { enterPrebattle } from '../src/development.js';
import type { GameEvent } from '../src/events.js';
import { createGame } from '../src/setup.js';
import {
  calculateCityHp,
  calculateRaidTransfer,
  calculateSiege,
  calculateWallCarryover,
  lockInstants,
  resolveEndOfEra,
  resolveSiegeAndRaid,
} from '../src/siege-and-era.js';
import type {
  CardRules,
  EraNo,
  GameState,
  PlayerId,
  UnitInstance,
} from '../src/types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function buildFixedDecks(): Record<PlayerId, Record<EraNo, string[]>> {
  const era1 = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? 'e1_farm' : 'u1_inf_l',
  );
  const era2 = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? 'e2_mill' : 'u2_inf_l',
  );
  const era3 = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? 'e3_gld' : 'u3_inf_l',
  );

  return {
    P1: { 1: [...era1], 2: [...era2], 3: [...era3] },
    P2: { 1: [...era1], 2: [...era2], 3: [...era3] },
  };
}

function createPrebattleState(era: EraNo = 1): GameState {
  const { state } = createGame({
    seed: 'siege-era-test-seed',
    catalog: structuredClone(catalog),
    fixedDecks: buildFixedDecks(),
    fixedInitiative: 'P1',
  });
  state.era = era;
  state.players.P1.mulliganDone = true;
  state.players.P2.mulliganDone = true;
  state.players.P1.hand = [];
  state.players.P2.hand = [];
  state.players.P1.units = [];
  state.players.P2.units = [];
  state.players.P1.resources = { food: 6, wood: 6, metal: 6 };
  state.players.P2.resources = { food: 6, wood: 6, metal: 6 };

  const events: GameEvent[] = [];
  enterPrebattle(state, events);
  return state;
}

function makeUnit(
  owner: PlayerId,
  uid: string,
  cardId: string,
  seq: number,
  overrides: Partial<UnitInstance> = {},
): UnitInstance {
  const rules = catalog[cardId]!;
  return {
    uid,
    cardId,
    owner,
    drawnOrder: seq,
    seq,
    hp: overrides.hp ?? rules.hp ?? 1,
    line: overrides.line ?? rules.line ?? 'front',
    atkMod: overrides.atkMod ?? 0,
    revealed: overrides.revealed ?? true,
  };
}

describe('Task M1-10: Prebattle, Phase 4 (Siege, Breach, Raid), and Era Transition / Victory (TV-04..TV-07c, TV-14, TV-23)', () => {
  it('TV-04: Wall carryover into Era II (base 8) for remaining walls [0, 1, 2, 3, 4, 5, 6, 9] -> [8, 8, 9, 9, 10, 10, 11, 12]', () => {
    const inputs = [0, 1, 2, 3, 4, 5, 6, 9];
    const expected = [8, 8, 9, 9, 10, 10, 11, 12];

    expect(inputs.map((w) => calculateWallCarryover(2, w))).toEqual(expected);

    // Also verify end-to-end via resolveEndOfEra from Era I -> Era II
    for (let i = 0; i < inputs.length; i++) {
      const state = createPrebattleState(1);
      state.players.P1.walls = inputs[i]!;
      const events: GameEvent[] = [];
      resolveEndOfEra(state, events);
      expect(state.era).toBe(2);
      expect(state.players.P1.walls).toBe(expected[i]);
    }
  });

  it('TV-04b: Wall carryover into Era III (base 10) for remaining walls [8, 11, 15] -> [14, 15, 17]', () => {
    const inputs = [8, 11, 15];
    const expected = [14, 15, 17];

    expect(inputs.map((w) => calculateWallCarryover(3, w))).toEqual(expected);

    // Also verify end-to-end via resolveEndOfEra from Era II -> Era III
    for (let i = 0; i < inputs.length; i++) {
      const state = createPrebattleState(2);
      state.players.P1.walls = inputs[i]!;
      const events: GameEvent[] = [];
      resolveEndOfEra(state, events);
      expect(state.era).toBe(3);
      expect(state.players.P1.walls).toBe(expected[i]);
    }
  });

  it('TV-05: City Center with accumulated cityDamage = 3 -> Era I: 7/10, Era II: 13/16, Era III: 19/22', () => {
    expect(calculateCityHp(1, 3)).toEqual({ cityHp: 7, cityMax: 10 });
    expect(calculateCityHp(2, 3)).toEqual({ cityHp: 13, cityMax: 16 });
    expect(calculateCityHp(3, 3)).toEqual({ cityHp: 19, cityMax: 22 });

    // Also verify through Era I -> II -> III transitions
    const state = createPrebattleState(1);
    state.players.P1.cityDamage = 3;
    expect(state.players.P1.cityMax - state.players.P1.cityDamage).toBe(7);

    const events: GameEvent[] = [];
    resolveEndOfEra(state, events);
    expect(state.era).toBe(2);
    expect(state.players.P1.cityMax).toBe(16);
    expect(state.players.P1.cityMax - state.players.P1.cityDamage).toBe(13);

    resolveEndOfEra(state, events);
    expect(state.era).toBe(3);
    expect(state.players.P1.cityMax).toBe(22);
    expect(state.players.P1.cityMax - state.players.P1.cityDamage).toBe(19);
  });

  it('TV-06: Phase 4 with pairs (D, W) = (0,0), (5,8), (10,11), (11,11), (12,11), (13,8), (1,0)', () => {
    const cases: Array<{
      D: number;
      W: number;
      expected: [boolean, number, number];
    }> = [
      { D: 0, W: 0, expected: [false, 0, 0] },
      { D: 5, W: 8, expected: [false, 3, 0] },
      { D: 10, W: 11, expected: [false, 1, 0] },
      { D: 11, W: 11, expected: [true, 0, 0] },
      { D: 12, W: 11, expected: [true, 0, 1] },
      { D: 13, W: 8, expected: [true, 0, 5] },
      { D: 1, W: 0, expected: [true, 0, 1] },
    ];

    for (const c of cases) {
      const res = calculateSiege(c.D, c.W);
      expect([res.breach, res.wallsAfter, res.directDamage]).toEqual(
        c.expected,
      );
    }
  });

  it('TV-07: Raid in Era I: attacker Food 7 Wood 5, defender Food 3 Wood 0 -> 0 Food (attacker at cap 7), 0 Wood (defender at 0)', () => {
    const transfer = calculateRaidTransfer(
      { food: 7, wood: 5, metal: 0 },
      { food: 3, wood: 0, metal: 0 },
      1,
    );
    expect(transfer).toEqual({ foodTransferred: 0, woodTransferred: 0 });

    // End-to-end via resolveSiegeAndRaid
    const state = createPrebattleState(1);
    state.players.P1.units = [makeUnit('P1', 'p1_inf', 'u1_inf_l', 1)]; // DEM 1
    state.players.P1.resources = { food: 7, wood: 5, metal: 0 };
    state.players.P2.walls = 1; // D=1, W=1 -> breach=true, directDamage=0
    state.players.P2.resources = { food: 3, wood: 0, metal: 0 };

    const events: GameEvent[] = [];
    const ended = resolveSiegeAndRaid(state, events, 'P1');
    expect(ended).toBe(false);
    expect(state.players.P1.resources).toEqual({ food: 7, wood: 5, metal: 0 });
    expect(state.players.P2.resources).toEqual({ food: 3, wood: 0, metal: 0 });

    const raidEvent = events.find((e) => e.type === 'RaidResolved');
    expect(raidEvent).toBeDefined();
    if (raidEvent?.type === 'RaidResolved') {
      expect(raidEvent.foodTransferred).toBe(0);
      expect(raidEvent.woodTransferred).toBe(0);
    }
  });

  it('TV-07b: Raid in Era I: attacker (6,5,0), defender (3,2,4) -> +1 Food and +1 Wood to attacker (7,6,0), -1 Food and -1 Wood to defender (2,1,4), Metal never raided', () => {
    const state = createPrebattleState(1);
    state.players.P1.units = [makeUnit('P1', 'p1_inf', 'u1_inf_l', 1)]; // DEM 1
    state.players.P1.resources = { food: 6, wood: 5, metal: 0 };
    state.players.P2.walls = 1; // D=1, W=1 -> breach=true
    state.players.P2.resources = { food: 3, wood: 2, metal: 4 };

    const events: GameEvent[] = [];
    const ended = resolveSiegeAndRaid(state, events, 'P1');
    expect(ended).toBe(false);
    expect(state.players.P1.resources).toEqual({ food: 7, wood: 6, metal: 0 });
    expect(state.players.P2.resources).toEqual({ food: 2, wood: 1, metal: 4 });

    const raidEvent = events.find((e) => e.type === 'RaidResolved');
    expect(raidEvent).toBeDefined();
    if (raidEvent?.type === 'RaidResolved') {
      expect(raidEvent.foodTransferred).toBe(1);
      expect(raidEvent.woodTransferred).toBe(1);
    }
  });

  it('TV-07c: Phase 4 reducing defender City Center to <= 0 HP with breach = true -> immediate victory by annihilation without raid', () => {
    const state = createPrebattleState(1);
    state.players.P1.units = [
      makeUnit('P1', 'p1_inf', 'u1_inf_l', 1), // DEM 1
      makeUnit('P1', 'p1_ram', 'u1_sig_h', 2), // DEM 6 -> total D = 7
    ];
    state.players.P1.resources = { food: 2, wood: 2, metal: 0 };
    state.players.P2.walls = 2; // W = 2 -> directDamage = 5
    state.players.P2.cityDamage = 5; // cityHp before = 5 -> after = 0
    state.players.P2.resources = { food: 5, wood: 5, metal: 2 };

    const r1 = lockInstants(state, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const r2 = lockInstants(r1.value.state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    const next = r2.value.state;
    const events = r2.value.events;

    expect(next.phase).toBe('finished');
    expect(next.result).toEqual({ kind: 'annihilation', winner: 'P1' });
    // No raid executed!
    expect(events.some((e) => e.type === 'RaidResolved')).toBe(false);
    expect(next.players.P1.resources).toEqual({ food: 2, wood: 2, metal: 0 });
    expect(next.players.P2.resources).toEqual({ food: 5, wood: 5, metal: 2 });
  });

  it('TV-14: Prebattle walls modifiers: P1 walls = 4; P2 plays Fuoco Greco (-6), P1 plays Palizzata Extra (+3) -> max(0, 4 + 3 - 6) = 1 HP; with only Fuoco Greco -> max(0, 4 - 6) = 0 HP', () => {
    // Subcase 1: Both Palizzata Extra (+3) and Fuoco Greco (-6)
    const state1 = createPrebattleState(3);
    state1.players.P1.walls = 4;
    state1.players.P1.hand = [
      { uid: 'i_wall', cardId: 'i1_wall', owner: 'P1', drawnOrder: 1 },
    ];
    state1.players.P2.hand = [
      { uid: 'i_fir', cardId: 'i3_fir', owner: 'P2', drawnOrder: 2 },
    ];

    const lock1 = lockInstants(state1, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: ['i_wall'],
    });
    expect(lock1.ok).toBe(true);
    if (!lock1.ok) return;

    const lock2 = lockInstants(lock1.value.state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: ['i_fir'],
    });
    expect(lock2.ok).toBe(true);
    if (!lock2.ok) return;

    const wallsEvent1 = lock2.value.events.find(
      (e) => e.type === 'WallsModified',
    );
    expect(wallsEvent1).toBeDefined();
    if (wallsEvent1?.type === 'WallsModified') {
      expect(wallsEvent1.wallsBefore.P1).toBe(4);
      expect(wallsEvent1.deltaOwn.P1).toBe(3);
      expect(wallsEvent1.deltaEnemy.P1).toBe(-6);
      expect(wallsEvent1.wallsAfter.P1).toBe(1);
    }

    // Subcase 2: Only Fuoco Greco (-6) on P1 walls = 4 -> clamped to 0 HP
    const state2 = createPrebattleState(3);
    state2.players.P1.walls = 4;
    state2.players.P2.hand = [
      { uid: 'i_fir', cardId: 'i3_fir', owner: 'P2', drawnOrder: 2 },
    ];

    const l1 = lockInstants(state2, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: [],
    });
    if (!l1.ok) return;
    const l2 = lockInstants(l1.value.state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: ['i_fir'],
    });
    expect(l2.ok).toBe(true);
    if (!l2.ok) return;

    const wallsEvent2 = l2.value.events.find((e) => e.type === 'WallsModified');
    if (wallsEvent2?.type === 'WallsModified') {
      expect(wallsEvent2.wallsAfter.P1).toBe(0);
    }
  });

  it('TV-23: End of Era III by points (P1 = 12 HP, P2 = 9 HP -> P1 wins with points; P2 > P1 -> P2 wins; both 12 HP -> draw)', () => {
    // Subcase 1: P1 12 HP (22 - 10), P2 9 HP (22 - 13) -> P1 wins by points
    const state1 = createPrebattleState(3);
    state1.players.P1.cityMax = 22;
    state1.players.P1.cityDamage = 10;
    state1.players.P2.cityMax = 22;
    state1.players.P2.cityDamage = 13;

    const ev1: GameEvent[] = [];
    resolveEndOfEra(state1, ev1);
    expect(state1.phase).toBe('finished');
    expect(state1.result).toEqual({ kind: 'points', winner: 'P1' });

    // Subcase 2: Both at 12 HP -> draw
    const state2 = createPrebattleState(3);
    state2.players.P1.cityMax = 22;
    state2.players.P1.cityDamage = 10;
    state2.players.P2.cityMax = 22;
    state2.players.P2.cityDamage = 10;

    const ev2: GameEvent[] = [];
    resolveEndOfEra(state2, ev2);
    expect(state2.phase).toBe('finished');
    expect(state2.result).toEqual({ kind: 'draw', winner: 'DRAW' });

    // Subcase 3: P2 has more HP -> P2 wins by points
    const state3 = createPrebattleState(3);
    state3.players.P1.cityMax = 22;
    state3.players.P1.cityDamage = 15;
    state3.players.P2.cityMax = 22;
    state3.players.P2.cityDamage = 8;

    const ev3: GameEvent[] = [];
    resolveEndOfEra(state3, ev3);
    expect(state3.result).toEqual({ kind: 'points', winner: 'P2' });
  });

  it('validates LockInstants error cases and applies atk_mod (own_archers and own_front) before field battle', () => {
    const state = createPrebattleState(2);
    state.players.P1.units = [
      makeUnit('P1', 'p1_arc', 'u1_arc_l', 1),
      makeUnit('P1', 'p1_inf', 'u2_inf_l', 2),
    ];
    state.players.P2.units = [makeUnit('P2', 'p2_inf', 'u1_inf_l', 3)];
    state.players.P1.hand = [
      { uid: 'i_arr', cardId: 'i1_arr', owner: 'P1', drawnOrder: 1 }, // cost 0/2/0, +2 ATK own_archers
      { uid: 'i_mor', cardId: 'i2_mor', owner: 'P1', drawnOrder: 2 }, // cost 2/0/1, +2 ATK own_front
      { uid: 'not_inst', cardId: 'e1_farm', owner: 'P1', drawnOrder: 3 },
    ];

    // Wrong phase
    const wrongPhaseState = structuredClone(state);
    wrongPhaseState.phase = 'development';
    expect(
      lockInstants(wrongPhaseState, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_PHASE' }),
    });

    // Card not in hand / duplicate
    expect(
      lockInstants(state, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: ['missing_uid'],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CARD_NOT_IN_HAND' }),
    });
    expect(
      lockInstants(state, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: ['i_arr', 'i_arr'],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CARD_NOT_IN_HAND' }),
    });

    // Non-instant card in hand
    expect(
      lockInstants(state, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: ['not_inst'],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_PHASE' }),
    });

    // Insufficient resources for aggregate cost
    const poorState = structuredClone(state);
    poorState.players.P1.resources = { food: 1, wood: 2, metal: 1 };
    expect(
      lockInstants(poorState, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: ['i_arr', 'i_mor'],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INSUFFICIENT_RESOURCES' }),
    });

    // Valid lock by P1
    const r1 = lockInstants(state, {
      type: 'LockInstants',
      player: 'P1',
      cardUids: ['i_arr', 'i_mor'],
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Duplicate lock by P1 -> DECISION_ALREADY_LOCKED
    expect(
      lockInstants(r1.value.state, {
        type: 'LockInstants',
        player: 'P1',
        cardUids: [],
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'DECISION_ALREADY_LOCKED' }),
    });

    // P2 locks empty -> battle resolves and advances from Era II to Era III
    const r2 = lockInstants(r1.value.state, {
      type: 'LockInstants',
      player: 'P2',
      cardUids: [],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.value.state.era).toBe(3);
    expect(r2.value.state.players.P1.publicDiscard).toContain('i1_arr');
    expect(r2.value.state.players.P1.publicDiscard).toContain('i2_mor');
  });
});
