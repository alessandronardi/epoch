import { describe, expect, it } from 'vitest';
import {
  FLANK_LINE_PRIORITY,
  STANDARD_LINE_PRIORITY,
  assignDamage,
  countLivingCombatants,
  evaluateBattleGuard,
  getEffectiveUnitAtk,
  getMeleeUnitAtk,
  isCombatantUnit,
  orderTargets,
  resolveFieldBattle,
} from '../src/battle.js';
import type { GameEvent } from '../src/events.js';
import { createGame } from '../src/setup.js';
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

function createBaseBattleState(era: EraNo = 1): GameState {
  const { state } = createGame({
    seed: 'battle-test-seed',
    catalog: structuredClone(catalog),
    fixedDecks: buildFixedDecks(),
    fixedInitiative: 'P1',
  });
  state.era = era;
  state.phase = 'prebattle';
  state.players.P1.units = [];
  state.players.P2.units = [];
  return state;
}

function makeUnit(
  owner: PlayerId,
  uid: string,
  cardId: string,
  seq: number,
  overrides: Partial<UnitInstance> = {},
): UnitInstance {
  const rules = catalog[cardId];
  return {
    uid,
    cardId,
    owner,
    drawnOrder: seq,
    seq,
    hp: overrides.hp ?? rules?.hp ?? 1,
    line: overrides.line ?? rules?.line ?? 'front',
    atkMod: overrides.atkMod ?? 0,
    revealed: overrides.revealed ?? true,
  };
}

describe('Task M1-09: Deterministic Field Battle Resolution (TV-10..TV-13, TV-21, TV-22, TV-24)', () => {
  it('TV-10: assignDamage(5) against front targets [Milizia Cittadina hp 3 seq 1, Fante con Scudo hp 5 seq 2]', () => {
    const milizia = makeUnit('P2', 'u_mil', 'u1_inf_l', 1, { hp: 3 });
    const fante = makeUnit('P2', 'u_fan', 'u1_inf_h', 2, { hp: 5 });

    const targets = orderTargets(
      [fante, milizia],
      STANDARD_LINE_PRIORITY,
      () => true,
      catalog,
    );
    expect(targets.map((t) => t.uid)).toEqual(['u_mil', 'u_fan']);

    const assignments = assignDamage(5, targets);
    expect(assignments).toEqual([
      { uid: 'u_mil', damage: 3 },
      { uid: 'u_fan', damage: 2 },
    ]);

    // Apply damage: Milizia dies (0 HP), Fante remains at 3 HP
    milizia.hp -= assignments[0]!.damage;
    fante.hp -= assignments[1]!.damage;
    expect(milizia.hp).toBe(0);
    expect(fante.hp).toBe(3);
  });

  it('TV-11: Era I, P1 Milizia Cittadina (2/1/3) vs P2 Fante con Scudo (2/1/5) -> P2 wins after Phase 3 Cycle 2 with Fante at 1 HP', () => {
    const state = createBaseBattleState(1);
    state.players.P1.units = [makeUnit('P1', 'p1_mil', 'u1_inf_l', 1)]; // 2 ATK, 3 HP
    state.players.P2.units = [makeUnit('P2', 'p2_fan', 'u1_inf_h', 2)]; // 2 ATK, 5 HP

    const events: GameEvent[] = [];
    const outcome = resolveFieldBattle(state, events);

    expect(outcome).toEqual({ kind: 'winner', winner: 'P2' });

    const phaseEvents = events.filter((e) => e.type === 'BattlePhaseResolved');
    // Phase 1, Phase 2A, Phase 2B, Phase 3 Cycle 1, Phase 3 Cycle 2
    const melee1 = phaseEvents.find(
      (e) => e.phase === 'phase3_melee' && e.meleeCycle === 1,
    );
    const melee2 = phaseEvents.find(
      (e) => e.phase === 'phase3_melee' && e.meleeCycle === 2,
    );
    expect(melee1).toBeDefined();
    expect(melee1?.damageDealt).toEqual({ P1: 2, P2: 2 });
    expect(melee1?.casualties).toEqual({ P1: [], P2: [] });

    expect(melee2).toBeDefined();
    expect(melee2?.damageDealt).toEqual({ P1: 2, P2: 2 });
    expect(melee2?.casualties).toEqual({ P1: ['p1_mil'], P2: [] });

    // P1 Milizia died and moved to discard/publicDiscard; P2 Fante survives at 1 HP
    expect(state.players.P1.units).toHaveLength(0);
    expect(state.players.P1.discard.map((d) => d.uid)).toContain('p1_mil');
    expect(state.players.P1.publicDiscard).toContain('u1_inf_l');

    expect(state.players.P2.units).toHaveLength(1);
    expect(state.players.P2.units[0]!.hp).toBe(1);
  });

  it('TV-12: Era I, P1 Lanciere Pesante (2/1/4, Impale 3) vs P2 Cavaliere Feudale (4/1/3) -> Cavaliere dies in Phase 2A, Guard pre-2B awards victory to P1', () => {
    const state = createBaseBattleState(1);
    state.players.P1.units = [makeUnit('P1', 'p1_spr', 'u1_spr_h', 1)]; // Lanciere Pesante: Impale 3, HP 4
    state.players.P2.units = [makeUnit('P2', 'p2_cav', 'u1_cav_h', 2)]; // Cavaliere Feudale: ATK 4, HP 3

    const events: GameEvent[] = [];
    const outcome = resolveFieldBattle(state, events);

    expect(outcome).toEqual({ kind: 'winner', winner: 'P1' });

    const phaseEvents = events.filter((e) => e.type === 'BattlePhaseResolved');
    expect(phaseEvents.map((e) => e.phase)).toEqual([
      'phase1_volley',
      'phase2a_impale',
    ]);

    const phase2a = phaseEvents[1]!;
    expect(phase2a.damageDealt).toEqual({ P1: 3, P2: 0 });
    expect(phase2a.assignments.P1).toEqual([{ uid: 'p2_cav', damage: 3 }]);
    expect(phase2a.casualties.P2).toEqual(['p2_cav']);

    // Phase 2B and Phase 3 were skipped by Guard pre-2B
    expect(state.players.P1.units).toHaveLength(1);
    expect(state.players.P1.units[0]!.hp).toBe(4);
    expect(state.players.P2.units).toHaveLength(0);
  });

  it('TV-13: Era II, P1 Cavaliere Corazzato (6/2/6, Flank +2) vs P2 Arciere Composto (4/0/2) + Uomo d Arme (4/2/8), zero Spearmen -> mutual_annihilation in Phase 3 Cycle 1', () => {
    const state = createBaseBattleState(2);
    state.players.P1.units = [makeUnit('P1', 'p1_cav', 'u2_cav_h', 1)]; // 6 ATK, 6 HP, Flank +2
    state.players.P2.units = [
      makeUnit('P2', 'p2_arc', 'u2_arc_l', 2), // 4 ATK, 2 HP, rear
      makeUnit('P2', 'p2_inf', 'u2_inf_h', 3), // 4 ATK, 8 HP, front
    ];

    const events: GameEvent[] = [];
    const outcome = resolveFieldBattle(state, events);

    expect(outcome).toEqual({ kind: 'mutual_annihilation' });

    const phaseEvents = events.filter((e) => e.type === 'BattlePhaseResolved');
    expect(phaseEvents.map((e) => e.phase)).toEqual([
      'phase1_volley',
      'phase2a_impale',
      'phase2b_impact',
      'phase3_melee',
    ]);

    // Phase 1: P2 Archer deals 4 -> P1 Cavalry HP 6 -> 2
    expect(phaseEvents[0]!.damageDealt).toEqual({ P1: 0, P2: 4 });
    expect(phaseEvents[0]!.assignments.P2).toEqual([
      { uid: 'p1_cav', damage: 4 },
    ]);

    // Phase 2B: P1 Cavalry flanks (6 + 2 = 8), priority rear -> front -> center:
    // P2 Archer (rear, 2 HP) takes 2 and dies; excess 6 hits P2 Uomo d'Arme (front, 8 -> 2 HP)
    expect(phaseEvents[2]!.damageDealt).toEqual({ P1: 8, P2: 0 });
    expect(phaseEvents[2]!.assignments.P1).toEqual([
      { uid: 'p2_arc', damage: 2 },
      { uid: 'p2_inf', damage: 6 },
    ]);
    expect(phaseEvents[2]!.casualties.P2).toEqual(['p2_arc']);

    // Phase 3 Cycle 1: Cavalry (6 ATK, 2 HP) and Uomo d'Arme (4 ATK, 2 HP) eliminate each other
    expect(phaseEvents[3]!.meleeCycle).toBe(1);
    expect(phaseEvents[3]!.damageDealt).toEqual({ P1: 6, P2: 4 });
    expect(phaseEvents[3]!.casualties).toEqual({
      P1: ['p1_cav'],
      P2: ['p2_inf'],
    });

    expect(state.players.P1.units).toHaveLength(0);
    expect(state.players.P2.units).toHaveLength(0);
  });

  it('TV-21: Stalemate at 6th melee cycle (synthetic cards: each side has 1 unit with ATK 1, HP 10 on front) -> both remain at HP 4, outcome stalemate', () => {
    const state = createBaseBattleState(1);
    state.catalog['syn_tank'] = {
      id: 'syn_tank',
      era: 1,
      type: 'unit',
      category: 'infantry',
      line: 'front',
      cost: { food: 1, wood: 0, metal: 0 },
      atk: 1,
      dem: 1,
      hp: 10,
      isCombatant: true,
      abilities: [],
    };

    state.players.P1.units = [
      makeUnit('P1', 'p1_tank', 'syn_tank', 1, { hp: 10, line: 'front' }),
    ];
    state.players.P2.units = [
      makeUnit('P2', 'p2_tank', 'syn_tank', 2, { hp: 10, line: 'front' }),
    ];

    const events: GameEvent[] = [];
    const outcome = resolveFieldBattle(state, events);

    expect(outcome).toEqual({ kind: 'stalemate' });
    expect(state.players.P1.units[0]!.hp).toBe(4);
    expect(state.players.P2.units[0]!.hp).toBe(4);

    const meleeEvents = events.filter(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase3_melee',
    );
    expect(meleeEvents).toHaveLength(6);
  });

  it('TV-22: Siege unit without combatants: P1 deploys only Ariete Batteria (isCombatant: false), P2 deploys 0 units -> Guard before Phase 1 yields mutual_annihilation', () => {
    const state = createBaseBattleState(1);
    state.players.P1.units = [makeUnit('P1', 'p1_ram', 'u1_sig_h', 1)];
    state.players.P2.units = [];

    const events: GameEvent[] = [];
    const outcome = resolveFieldBattle(state, events);

    expect(outcome).toEqual({ kind: 'mutual_annihilation' });

    const phaseEvents = events.filter((e) => e.type === 'BattlePhaseResolved');
    expect(phaseEvents).toHaveLength(0);
    // Ariete remains untouched in P1.units until Era end cleanup
    expect(state.players.P1.units).toHaveLength(1);
  });

  it('TV-24: Decision D1 + D4: in Era III, P1 Cacciatore of Era I (ATK 2, HP 1, Volley +1) with Pioggia di Frecce (+2 ATK) vs P2 Spearman -> Phase 1 deals 4+1=5 (card printed +1, not +3), Phase 3 deals floor(4/2)=2 (D4)', () => {
    const state = createBaseBattleState(3);
    // P1 Cacciatore (u1_arc_l) buffed by Pioggia di Frecce (+2 atkMod) + a high-HP infantry so battle reaches Phase 3
    const cacciatore = makeUnit('P1', 'p1_arc', 'u1_arc_l', 1, { atkMod: 2 });
    const tankP1 = makeUnit('P1', 'p1_inf', 'u3_inf_h', 2, { hp: 20 }); // Campione Imperiale (ATK 6)
    // P2 Falange Imperiale (u3_spr_h, Spearman, HP 20)
    const spearmanP2 = makeUnit('P2', 'p2_spr', 'u3_spr_h', 3, { hp: 20 });

    state.players.P1.units = [cacciatore, tankP1];
    state.players.P2.units = [spearmanP2];

    // Check helper directly for D4
    expect(getEffectiveUnitAtk(cacciatore, state.catalog)).toBe(4);
    expect(getMeleeUnitAtk(cacciatore, state.catalog, state.rules)).toBe(2);

    const events: GameEvent[] = [];
    resolveFieldBattle(state, events);

    const phase1 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase1_volley',
    );
    expect(phase1).toBeDefined();
    if (phase1?.type === 'BattlePhaseResolved') {
      // D1: effAtk (4) + printed volley bonus (+1) = 5 (NOT +3 of Era III)
      expect(phase1.damageDealt.P1).toBe(5);
    }

    const melee1 = events.find(
      (e) =>
        e.type === 'BattlePhaseResolved' &&
        e.phase === 'phase3_melee' &&
        e.meleeCycle === 1,
    );
    expect(melee1).toBeDefined();
    if (melee1?.type === 'BattlePhaseResolved') {
      // D4: Cacciatore contributes floor(4/2) = 2 + Campione Imperiale (6) = 8
      expect(melee1.damageDealt.P1).toBe(8);
    }
  });

  it('supports non-flanking Cavalry when enemy has living Spearman, Siege exclusion from targets, and alternative RulesConfig flags', () => {
    const state = createBaseBattleState(3);
    state.rules.eraScalingSource = 'current_era';
    state.rules.archerMeleeUsesEffectiveAtk = false;

    const p1Arc = makeUnit('P1', 'p1_arc', 'u1_arc_l', 1, {
      atkMod: 2,
      hp: 10,
    });
    const p1Spr = makeUnit('P1', 'p1_spr', 'u1_spr_l', 2, { hp: 10 });
    const p1Cav = makeUnit('P1', 'p1_cav', 'u1_cav_l', 3, { hp: 10 });
    const p2Spr = makeUnit('P2', 'p2_spr', 'u1_spr_l', 4, { hp: 20 });
    const p2Arc = makeUnit('P2', 'p2_arc', 'u1_arc_l', 5, { hp: 10 });
    const p2Cav = makeUnit('P2', 'p2_cav', 'u1_cav_l', 6, { hp: 20 });
    const p2Sig = makeUnit('P2', 'p2_sig', 'u1_sig_h', 7, { hp: 3 });

    state.players.P1.units = [p1Arc, p1Spr, p1Cav];
    state.players.P2.units = [p2Spr, p2Arc, p2Cav, p2Sig];

    // With archerMeleeUsesEffectiveAtk = false, base atk 2 -> max(1, floor(2/2)) = 1
    expect(getMeleeUnitAtk(p1Arc, state.catalog, state.rules)).toBe(1);

    // Order targets without catalog parameter (fallback check)
    const fallbackTargets = orderTargets(
      [p2Sig, p2Arc, p2Spr],
      FLANK_LINE_PRIORITY,
    );
    expect(fallbackTargets.map((t) => t.uid)).toEqual(['p2_arc', 'p2_spr']);

    const customUnitWithFlag = {
      ...makeUnit('P2', 'u_custom', 'u1_inf_l', 9),
      isCombatant: false,
    };
    expect(isCombatantUnit(customUnitWithFlag)).toBe(false);

    const events: GameEvent[] = [];
    resolveFieldBattle(state, events);

    // Phase 1 with eraScalingSource = 'current_era' (era 3): effAtk (4) + 3 = 7
    const phase1 = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase1_volley',
    );
    if (phase1?.type === 'BattlePhaseResolved') {
      expect(phase1.damageDealt.P1).toBe(7);
    }

    // Phase 2A with eraScalingSource = 'current_era' (era 3): 1 + 2*3 = 7
    const phase2a = events.find(
      (e) => e.type === 'BattlePhaseResolved' && e.phase === 'phase2a_impale',
    );
    if (phase2a?.type === 'BattlePhaseResolved') {
      expect(phase2a.damageDealt.P1).toBe(7);
    }

    // Siege unit p2_sig was never damaged in field battle
    expect(state.players.P2.units.find((u) => u.uid === 'p2_sig')?.hp).toBe(3);
  });

  it('handles early termination right after Phase 1, Phase 2B, or on the 6th cycle of Phase 3 (R5)', () => {
    // Termination after Phase 1 (Pre-2A guard)
    const state1 = createBaseBattleState(1);
    state1.players.P1.units = [makeUnit('P1', 'p1_arc', 'u1_arc_h', 1)]; // 3 ATK in Phase 1
    state1.players.P2.units = [makeUnit('P2', 'p2_inf', 'u1_inf_l', 2)]; // 3 HP, 0 damage in Phase 1
    const ev1: GameEvent[] = [];
    expect(resolveFieldBattle(state1, ev1)).toEqual({
      kind: 'winner',
      winner: 'P1',
    });

    // Termination after Phase 2B (Pre-Phase 3 guard)
    const state2 = createBaseBattleState(1);
    state2.players.P1.units = [makeUnit('P1', 'p1_cav', 'u1_cav_h', 1)]; // 4 ATK
    state2.players.P2.units = [makeUnit('P2', 'p2_inf', 'u1_inf_l', 2)]; // 2 ATK, 3 HP
    const ev2: GameEvent[] = [];
    expect(resolveFieldBattle(state2, ev2)).toEqual({
      kind: 'winner',
      winner: 'P1',
    });

    // Termination on the 6th cycle of Phase 3 (R5: winner after 6th cycle instead of stalemate)
    const state3 = createBaseBattleState(1);
    state3.catalog['syn_6'] = {
      id: 'syn_6',
      era: 1,
      type: 'unit',
      category: 'infantry',
      line: 'front',
      cost: { food: 1, wood: 0, metal: 0 },
      atk: 1,
      dem: 1,
      hp: 6,
      isCombatant: true,
      abilities: [],
    };
    state3.players.P1.units = [
      makeUnit('P1', 'p1_6', 'syn_6', 1, { hp: 7, line: 'front' }),
    ];
    state3.players.P2.units = [
      makeUnit('P2', 'p2_6', 'syn_6', 2, { hp: 6, line: 'front' }),
    ];
    const ev3: GameEvent[] = [];
    expect(resolveFieldBattle(state3, ev3)).toEqual({
      kind: 'winner',
      winner: 'P1',
    });

    // Guard check when P2 wins while P1 has 0 combatants at start
    const state4 = createBaseBattleState(1);
    state4.players.P2.units = [makeUnit('P2', 'p2_inf', 'u1_inf_l', 1)];
    expect(evaluateBattleGuard(state4)).toEqual({
      kind: 'winner',
      winner: 'P2',
    });
    expect(countLivingCombatants(state4.players.P2.units, state4.catalog)).toBe(
      1,
    );

    // Unknown card throws descriptive error
    expect(() =>
      isCombatantUnit(makeUnit('P1', 'bad', 'unknown_id', 1), state4.catalog),
    ).toThrow(/not found in catalog/);
  });
});
