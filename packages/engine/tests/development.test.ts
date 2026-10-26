import { describe, expect, it } from 'vitest';
import {
  calculateTotalEffectiveDem,
  enterEraHandLimitOrDevelopment,
  getEffectiveUnitDem,
  getInitiativeForEra,
  mutatePass,
  mutatePlayCard,
  mutatePlayConversion,
  mutateSubmitDiscard,
  passTurn,
  playCard,
  playConversion,
  startNextEra,
  submitDiscard,
} from '../src/development.js';
import { legalCommands } from '../src/legal.js';
import { createGame, submitMulligan } from '../src/setup.js';
import type { CardRules, EraNo, GameState, PlayerId } from '../src/types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function buildFixedDecks(): Record<PlayerId, Record<EraNo, string[]>> {
  const era1 = [
    'e1_farm',
    'e1_lumb',
    'e1_mine',
    'u1_inf_l',
    'u1_inf_h',
    'u1_spr_l',
    'u1_arc_l',
    'i1_arr',
    'i1_wall',
    'u1_cav_l',
    'u1_cav_h',
    'u1_sig_l',
    'u1_sig_h',
    'u1_spr_h',
    'u1_arc_h',
    'e1_farm',
    'e1_lumb',
    'u1_inf_l',
    'i1_arr',
    'i1_wall',
  ];
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

function createEra1DevelopmentState(): GameState {
  const { state } = createGame({
    seed: 'dev-test-seed',
    catalog,
    fixedDecks: buildFixedDecks(),
    fixedInitiative: 'P1',
  });
  const r1 = submitMulligan(state, {
    type: 'SubmitMulligan',
    player: 'P1',
    cardUids: [],
  });
  if (!r1.ok) throw new Error(r1.error.message);
  const r2 = submitMulligan(r1.value.state, {
    type: 'SubmitMulligan',
    player: 'P2',
    cardUids: [],
  });
  if (!r2.ok) throw new Error(r2.error.message);
  return structuredClone(r2.value.state);
}

describe('Task M1-08: hand_limit and development transitions (TV-15..TV-20)', () => {
  it('TV-15: Gilda dei Mercanti in Era III calculates N pre-sacrifice, deducts cost, sacrifices building, credits (+N,+N,+N), and consumes 0 slots', () => {
    const state = createEra1DevelopmentState();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 2, wood: 2, metal: 2 };
    state.players.P1.slotsUsed = 1;
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b2', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 2 },
      { uid: 'b3', cardId: 'e2_mill', owner: 'P1', drawnOrder: 3 },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 10 },
    ];

    const res = playConversion(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b2',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const next = res.value.state;
    const events = res.value.events;

    // Cost 0/1/0 -> (2,1,2); N=3 pre-sacrifice -> (+3,+3,+3) -> (5,4,5)
    expect(next.players.P1.resources).toEqual({ food: 5, wood: 4, metal: 5 });
    expect(next.players.P1.buildings.map((b) => b.uid)).toEqual(['b1', 'b3']);
    expect(next.players.P1.slotsUsed).toBe(1); // 0 slots consumed!
    expect(next.players.P1.discard.map((d) => d.uid)).toEqual(['b2', 'c_gld']);
    // D3: conversion cardId is in publicDiscard, sacrificed building cardId is hidden!
    expect(next.players.P1.publicDiscard).toEqual(['e3_gld']);
    expect(next.toAct).toBe('P2');

    const convEvent = events.find((e) => e.type === 'ConversionActivated');
    expect(convEvent).toBeDefined();
    if (convEvent?.type === 'ConversionActivated') {
      expect(convEvent.gain).toEqual({ food: 3, wood: 3, metal: 3 });
      expect(convEvent.demBonusGained).toBe(0);
      expect(convEvent.sacrificeUid).toBe('b2');
      expect(convEvent.sacrificeCardId).toBe('e1_lumb');
      expect(convEvent.coveredCount).toBe(2);
    }
  });

  it('TV-16: Altoforno Reale played twice in Era III grants cumulative +2 DEM to units deployed before and after (D = 25)', () => {
    let state = createEra1DevelopmentState();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 16, wood: 16, metal: 16 };
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
      { uid: 'b2', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 2 },
    ];
    state.players.P1.hand = [
      { uid: 'u_champ', cardId: 'u3_inf_h', owner: 'P1', drawnOrder: 3 }, // Campione Imperiale (DEM 3)
      { uid: 'c_frn1', cardId: 'e3_frn', owner: 'P1', drawnOrder: 4 }, // Altoforno Reale #1
      { uid: 'c_frn2', cardId: 'e3_frn', owner: 'P1', drawnOrder: 5 }, // Altoforno Reale #2
      { uid: 'u_bomb', cardId: 'u3_sig_h', owner: 'P1', drawnOrder: 6 }, // Bombarda di Bronzo (DEM 18)
    ];

    // P2 passes in Cycle 1 after P1 deploys Campione Imperiale
    const step1 = playCard(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_champ',
    });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    state = step1.value.state;

    const p2Pass = passTurn(state, { type: 'Pass', player: 'P2' });
    expect(p2Pass.ok).toBe(true);
    if (!p2Pass.ok) return;
    state = p2Pass.value.state;

    // Cycle 2: P1 plays first Altoforno Reale
    const step2 = playConversion(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_frn1',
      sacrificeUid: 'b1',
    });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    state = step2.value.state;
    expect(state.players.P1.demBonus).toBe(1);

    // Cycle 3: P1 plays second Altoforno Reale
    const step3 = playConversion(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_frn2',
      sacrificeUid: 'b2',
    });
    expect(step3.ok).toBe(true);
    if (!step3.ok) return;
    state = step3.value.state;
    expect(state.players.P1.demBonus).toBe(2);

    // Cycle 4: P1 deploys Bombarda di Bronzo (DEM 18) after both Altoforno Reale
    const step4 = playCard(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_bomb',
    });
    expect(step4.ok).toBe(true);
    if (!step4.ok) return;
    state = step4.value.state;

    const champUnit = state.players.P1.units.find((u) => u.uid === 'u_champ')!;
    const bombUnit = state.players.P1.units.find((u) => u.uid === 'u_bomb')!;

    expect(getEffectiveUnitDem(champUnit, state.players.P1, state.catalog)).toBe(
      5,
    );
    expect(getEffectiveUnitDem(bombUnit, state.players.P1, state.catalog)).toBe(
      20,
    );
    expect(
      calculateTotalEffectiveDem(state.players.P1, state.catalog),
    ).toBe(25);
  });

  it('TV-17: enforces action opportunity exclusivity (PlayConversion immediately passes opportunity to opponent)', () => {
    const state = createEra1DevelopmentState();
    state.era = 3;
    state.initiative = 'P1';
    state.toAct = 'P1';
    state.players.P1.resources = { food: 10, wood: 10, metal: 10 };
    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    state.players.P1.hand = [
      { uid: 'c_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 2 },
      { uid: 'u_inf', cardId: 'u3_inf_l', owner: 'P1', drawnOrder: 3 },
    ];

    const convRes = playConversion(state, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'c_gld',
      sacrificeUid: 'b1',
    });
    expect(convRes.ok).toBe(true);
    if (!convRes.ok) return;

    const nextState = convRes.value.state;
    expect(nextState.toAct).toBe('P2');

    // P1 immediately attempts PlayCard in the same cycle opportunity -> rejected with NOT_YOUR_TURN
    const secondPlay = playCard(nextState, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'u_inf',
    });
    expect(secondPlay).toEqual({
      ok: false,
      error: {
        code: 'NOT_YOUR_TURN',
        message: expect.any(String),
      },
    });
  });

  it('TV-18: enforces Era I Logistics Cap of 4 field cards (5th rejected with NO_LOGISTICS_SLOT), while instants remain playable in prebattle', () => {
    let state = createEra1DevelopmentState();
    state.players.P1.resources = { food: 7, wood: 7, metal: 7 };
    state.players.P1.hand = [
      { uid: 'c1', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 1 },
      { uid: 'c2', cardId: 'u1_spr_l', owner: 'P1', drawnOrder: 2 },
      { uid: 'c3', cardId: 'u1_arc_l', owner: 'P1', drawnOrder: 3 },
      { uid: 'c4', cardId: 'e1_farm', owner: 'P1', drawnOrder: 4 },
      { uid: 'c5', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 5 },
      { uid: 'inst1', cardId: 'i1_arr', owner: 'P1', drawnOrder: 6 },
    ];

    // P2 passes on Cycle 1 after P1's first card
    const play1 = playCard(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c1',
    });
    if (!play1.ok) throw new Error(play1.error.message);
    state = play1.value.state;

    const p2Pass = passTurn(state, { type: 'Pass', player: 'P2' });
    if (!p2Pass.ok) throw new Error(p2Pass.error.message);
    state = p2Pass.value.state;

    for (const uid of ['c2', 'c3', 'c4']) {
      state = structuredClone(state);
      state.players.P1.resources = { food: 7, wood: 7, metal: 7 };
      const res = playCard(state, { type: 'PlayCard', player: 'P1', cardUid: uid });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      state = res.value.state;
    }

    expect(state.players.P1.slotsUsed).toBe(4);
    state = structuredClone(state);
    state.players.P1.resources = { food: 7, wood: 7, metal: 7 };

    // LegalCommands marks 5th field card c5 as no_slot
    const legalAtCap = legalCommands(state, 'P1');
    expect(legalAtCap.handPlayability['c5']).toEqual({
      playable: false,
      reason: 'no_slot',
    });

    // Attempting to play 5th field card is rejected with NO_LOGISTICS_SLOT
    const play5 = playCard(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: 'c5',
    });
    expect(play5).toEqual({
      ok: false,
      error: {
        code: 'NO_LOGISTICS_SLOT',
        message: expect.any(String),
      },
    });

    // P1 passes -> enters prebattle where inst1 is playable (0 slots)
    const p1Pass = passTurn(state, { type: 'Pass', player: 'P1' });
    expect(p1Pass.ok).toBe(true);
    if (!p1Pass.ok) return;
    state = p1Pass.value.state;

    expect(state.phase).toBe('prebattle');
    const prebattleLegal = legalCommands(state, 'P1');
    expect(prebattleLegal.playableInstantUids).toEqual(['inst1']);
    expect(prebattleLegal.handPlayability['inst1']).toEqual({ playable: true });
  });

  it('TV-19: when both P1 and P2 pass in Cycle 1, development ends immediately without opening Cycle 2 or crediting rent (R1)', () => {
    const state = createEra1DevelopmentState();
    expect(state.players.P1.resources).toEqual({ food: 4, wood: 4, metal: 0 });
    expect(state.players.P2.resources).toEqual({ food: 4, wood: 4, metal: 0 });

    const r1 = passTurn(state, { type: 'Pass', player: 'P1' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.state.phase).toBe('development');
    expect(r1.value.state.cycle).toBe(1);
    expect(r1.value.state.toAct).toBe('P2');

    const r2 = passTurn(r1.value.state, { type: 'Pass', player: 'P2' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    const finalState = r2.value.state;
    const events = r2.value.events;

    expect(finalState.phase).toBe('prebattle');
    expect(finalState.cycle).toBe(1);
    expect(finalState.toAct).toBeNull();
    // No Cycle 2 rent credited
    expect(finalState.players.P1.resources).toEqual({
      food: 4,
      wood: 4,
      metal: 0,
    });
    expect(finalState.players.P2.resources).toEqual({
      food: 4,
      wood: 4,
      metal: 0,
    });

    expect(events.map((e) => e.type)).toEqual([
      'PlayerPassed',
      'DevelopmentEnded',
      'UnitsRevealed',
    ]);
  });

  it('TV-19b: when P1 passes in Cycle 1 and P2 plays a card in Cycle 1, Cycle 2 opens and BOTH players receive Cycle 2 rent, then only P2 acts', () => {
    let state = createEra1DevelopmentState();
    // P1 passes in Cycle 1
    const r1 = passTurn(state, { type: 'Pass', player: 'P1' });
    if (!r1.ok) throw new Error(r1.error.message);
    state = r1.value.state;

    // P2 plays e1_farm (cost 0/2/0, production +1 food) in Cycle 1
    const farmCard = state.players.P2.hand.find((c) => c.cardId === 'e1_farm')!;
    const r2 = playCard(state, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: farmCard.uid,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    state = r2.value.state;
    const events = r2.value.events;

    // Cycle 2 opened with toAct = P2 (since P1 already passed)
    expect(state.phase).toBe('development');
    expect(state.cycle).toBe(2);
    expect(state.toAct).toBe('P2');

    // P1 had (4,4,0) -> receives Cycle 2 base rent (+1,+1,0) -> (5,5,0)
    expect(state.players.P1.resources).toEqual({ food: 5, wood: 5, metal: 0 });
    // P2 had (4,4,0) - cost(0,2,0) = (4,2,0) -> receives Cycle 2 rent (+1+1 food, +1 wood, 0 metal) -> (6,3,0)
    expect(state.players.P2.resources).toEqual({ food: 6, wood: 3, metal: 0 });

    const rentEvents = events.filter(
      (e) => e.type === 'ResourcesChanged' && e.reason === 'rent',
    );
    expect(rentEvents).toHaveLength(2);

    // P2 plays another card in Cycle 2 -> opens Cycle 3 (second periodic rent), then Cycle 4 (no rent)
    const lumbCard = state.players.P2.hand.find((c) => c.cardId === 'e1_lumb')!;
    const r3 = playCard(state, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: lumbCard.uid,
    });
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    state = r3.value.state;
    expect(state.cycle).toBe(3);
    expect(state.toAct).toBe('P2');
    // P1 receives Cycle 3 rent (+1,+1,0) -> (6,6,0)
    expect(state.players.P1.resources).toEqual({ food: 6, wood: 6, metal: 0 });

    // P2 plays a 3rd card in Cycle 3 -> opens Cycle 4 with NO periodic rent
    const infCard = state.players.P2.hand.find((c) => c.cardId === 'u1_inf_l')!;
    const r4 = playCard(state, {
      type: 'PlayCard',
      player: 'P2',
      cardUid: infCard.uid,
    });
    expect(r4.ok).toBe(true);
    if (!r4.ok) return;
    state = r4.value.state;
    expect(state.cycle).toBe(4);
    expect(
      r4.value.events.filter(
        (e) => e.type === 'ResourcesChanged' && e.reason === 'rent',
      ),
    ).toHaveLength(0);
  });

  it('TV-20: alternates initiative across Eras (P1 in Era I, P2 in Era II, P1 in Era III) and handles hand_limit -> development transition', () => {
    expect(getInitiativeForEra(1)).toBe('P1');
    expect(getInitiativeForEra(2)).toBe('P2');
    expect(getInitiativeForEra(3)).toBe('P1');

    let state = createEra1DevelopmentState();
    expect(state.era).toBe(1);
    expect(state.initiative).toBe('P1');
    expect(state.toAct).toBe('P1');

    // Start Era II: P1 has 8 cards in hand + draws 5 = 13 cards (> 10), P2 has 5 cards in hand + draws 5 = 10 cards (<= 10)
    state.players.P2.hand.splice(0, 3);
    const era2Events: import('../src/events.js').GameEvent[] = [];
    startNextEra(state, era2Events, 2);

    expect(state.era).toBe(2);
    expect(state.initiative).toBe('P2');
    expect(state.phase).toBe('hand_limit');
    expect(state.players.P1.hand).toHaveLength(13);
    expect(state.players.P2.hand).toHaveLength(10);

    // P1 discards 3 cards to reach 10 -> immediately triggers Era II Opening Harvest and starts Cycle 1 with toAct = P2!
    const discardUids = state.players.P1.hand.slice(0, 3).map((c) => c.uid);
    const discardRes = submitDiscard(state, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: discardUids,
    });
    expect(discardRes.ok).toBe(true);
    if (!discardRes.ok) return;

    state = structuredClone(discardRes.value.state);
    expect(state.phase).toBe('development');
    expect(state.cycle).toBe(1);
    expect(state.initiative).toBe('P2');
    expect(state.toAct).toBe('P2');
    expect(state.players.P1.hand).toHaveLength(10);

    // Start Era III when both hands remain <= 10 after drawing 5 cards (e.g. 4 + 5 = 9)
    state.players.P1.hand.splice(0, 6);
    state.players.P2.hand.splice(0, 6);
    const era3Events: import('../src/events.js').GameEvent[] = [];
    startNextEra(state, era3Events, 3);

    expect(state.era).toBe(3);
    expect(state.initiative).toBe('P1');
    expect(state.phase).toBe('development');
    expect(state.cycle).toBe(1);
    expect(state.toAct).toBe('P1');
  });

  it('handles simultaneous hand_limit when both players exceed 10 cards, and validates SubmitDiscard error codes', () => {
    const state = createEra1DevelopmentState();
    // Invalid phase when in development
    expect(
      submitDiscard(state, {
        type: 'SubmitDiscard',
        player: 'P1',
        cardUids: [],
      }).ok,
    ).toBe(false);

    // Transition to Era II where both P1 and P2 have 8 + 5 = 13 cards
    const events: import('../src/events.js').GameEvent[] = [];
    startNextEra(state, events, 2);
    expect(state.phase).toBe('hand_limit');

    // Wrong discard count (2 instead of 3)
    const wrongCount = submitDiscard(state, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: state.players.P1.hand.slice(0, 2).map((c) => c.uid),
    });
    expect(wrongCount).toEqual({
      ok: false,
      error: { code: 'INVALID_DISCARD_COUNT', message: expect.any(String) },
    });

    // Unknown card uid
    const unknownCard = submitDiscard(state, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: ['non_existent_1', 'non_existent_2', 'non_existent_3'],
    });
    expect(unknownCard).toEqual({
      ok: false,
      error: { code: 'CARD_NOT_IN_HAND', message: expect.any(String) },
    });

    // P1 submits valid 3-card discard
    const p1Uids = state.players.P1.hand.slice(0, 3).map((c) => c.uid);
    const p1Commit = submitDiscard(state, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: p1Uids,
    });
    expect(p1Commit.ok).toBe(true);
    if (!p1Commit.ok) return;

    // Duplicate commit by P1 rejected with DECISION_ALREADY_LOCKED
    const p1Dup = submitDiscard(p1Commit.value.state, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: p1Uids,
    });
    expect(p1Dup).toEqual({
      ok: false,
      error: { code: 'DECISION_ALREADY_LOCKED', message: expect.any(String) },
    });

    // P2 submits valid 3-card discard -> resolves both and enters development
    const p2Uids = p1Commit.value.state.players.P2.hand
      .slice(0, 3)
      .map((c) => c.uid);
    const p2Commit = submitDiscard(p1Commit.value.state, {
      type: 'SubmitDiscard',
      player: 'P2',
      cardUids: p2Uids,
    });
    expect(p2Commit.ok).toBe(true);
    if (!p2Commit.ok) return;

    expect(p2Commit.value.state.phase).toBe('development');
    expect(p2Commit.value.state.players.P1.hand).toHaveLength(10);
    expect(p2Commit.value.state.players.P2.hand).toHaveLength(10);
  });

  it('supports D5 seqAssignedAt reveal and D6 autoPassWhenNoLegalPlay when configured', () => {
    let state = createEra1DevelopmentState();
    state.rules.seqAssignedAt = 'reveal';
    state.rules.autoPassWhenNoLegalPlay = true;

    // Give P1 one playable unit and P2 zero resources (so P2 has no legal play)
    const p1Unit = state.players.P1.hand.find((c) => c.cardId === 'u1_inf_l')!;
    state.players.P1.hand = [p1Unit];
    state.players.P1.resources = { food: 2, wood: 0, metal: 0 };
    state.players.P2.resources = { food: 0, wood: 0, metal: 0 };

    // P1 plays u1_inf_l -> costs 2/0/0 (P1 now has 0 cards, no legal play).
    // P2 has 0 resources (no legal play) -> P2 auto-passes in Cycle 1, Cycle 1 ends, both passed -> enters prebattle!
    const res = playCard(state, {
      type: 'PlayCard',
      player: 'P1',
      cardUid: p1Unit.uid,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    state = res.value.state;
    expect(state.phase).toBe('prebattle');
    expect(state.players.P1.units[0]!.revealed).toBe(true);
    expect(state.players.P1.units[0]!.seq).toBe(1);

    const autoPassEvents = res.value.events.filter(
      (e) => e.type === 'PlayerPassed' && e.reason === 'no_legal_play',
    );
    expect(autoPassEvents).toHaveLength(2);
  });

  it('validates all remaining error branches for PlayCard, PlayConversion, and Pass', () => {
    const state = createEra1DevelopmentState();

    // Pass errors: NOT_YOUR_TURN, ALREADY_PASSED, INVALID_PHASE
    expect(passTurn(state, { type: 'Pass', player: 'P2' }).ok).toBe(false);
    state.players.P1.passed = true;
    expect(passTurn(state, { type: 'Pass', player: 'P1' })).toEqual({
      ok: false,
      error: { code: 'ALREADY_PASSED', message: expect.any(String) },
    });
    expect(
      playCard(state, { type: 'PlayCard', player: 'P1', cardUid: 'x' }),
    ).toEqual({
      ok: false,
      error: { code: 'ALREADY_PASSED', message: expect.any(String) },
    });

    state.players.P1.passed = false;
    // PlayCard: CARD_NOT_IN_HAND, INVALID_PHASE (instant card), INSUFFICIENT_RESOURCES
    expect(
      playCard(state, {
        type: 'PlayCard',
        player: 'P1',
        cardUid: 'missing_uid',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'CARD_NOT_IN_HAND', message: expect.any(String) },
    });

    const instantInHand = state.players.P1.hand.find(
      (c) => c.cardId === 'i1_arr',
    )!;
    expect(
      playCard(state, {
        type: 'PlayCard',
        player: 'P1',
        cardUid: instantInHand.uid,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_PHASE', message: expect.any(String) },
    });

    state.players.P1.resources = { food: 0, wood: 0, metal: 0 };
    const unitInHand = state.players.P1.hand.find(
      (c) => c.cardId === 'u1_inf_l',
    )!;
    expect(
      playCard(state, {
        type: 'PlayCard',
        player: 'P1',
        cardUid: unitInHand.uid,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_RESOURCES', message: expect.any(String) },
    });

    // PlayConversion errors: Era < 3, ALREADY_PASSED, NOT_YOUR_TURN, CARD_NOT_IN_HAND, non-conversion card, NO_BUILDING_TO_SACRIFICE, INSUFFICIENT_RESOURCES
    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: unitInHand.uid,
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_PHASE', message: expect.any(String) },
    });

    state.era = 3;
    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P2',
        cardUid: 'x',
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'NOT_YOUR_TURN', message: expect.any(String) },
    });

    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: 'missing_conv',
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'CARD_NOT_IN_HAND', message: expect.any(String) },
    });

    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: unitInHand.uid,
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INVALID_PHASE', message: expect.any(String) },
    });

    state.players.P1.hand.push({
      uid: 'conv_frn',
      cardId: 'e3_frn',
      owner: 'P1',
      drawnOrder: 99,
    });
    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: 'conv_frn',
        sacrificeUid: 'missing_b',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'NO_BUILDING_TO_SACRIFICE', message: expect.any(String) },
    });

    state.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    expect(
      playConversion(state, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: 'conv_frn',
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_RESOURCES', message: expect.any(String) },
    });

    // Check enterEraHandLimitOrDevelopment directly
    const dummyEvents: import('../src/events.js').GameEvent[] = [];
    enterEraHandLimitOrDevelopment(state, dummyEvents);
    expect(state.phase).toBe('development');

    // Direct mutate* error branch checks
    expect(
      mutateSubmitDiscard(
        state,
        { type: 'SubmitDiscard', player: 'P1', cardUids: [] },
        dummyEvents,
      ).ok,
    ).toBe(false);
    expect(
      mutatePlayCard(
        state,
        { type: 'PlayCard', player: 'P2', cardUid: 'x' },
        dummyEvents,
      ).ok,
    ).toBe(false);
    expect(
      mutatePlayConversion(
        state,
        {
          type: 'PlayConversion',
          player: 'P2',
          cardUid: 'x',
          sacrificeUid: 'b1',
        },
        dummyEvents,
      ).ok,
    ).toBe(false);
    expect(
      mutatePass(state, { type: 'Pass', player: 'P2' }, dummyEvents).ok,
    ).toBe(false);

    // Check passTurn with timeout reason and INVALID_PHASE
    state.players.P1.consecutiveTimeouts = 2;
    const timeoutPass = passTurn(
      state,
      { type: 'Pass', player: 'P1' },
      'timeout',
    );
    expect(timeoutPass.ok).toBe(true);
    if (timeoutPass.ok) {
      expect(timeoutPass.value.state.players.P1.consecutiveTimeouts).toBe(2);
    }

    const state2 = createEra1DevelopmentState();
    state2.phase = 'prebattle';
    expect(passTurn(state2, { type: 'Pass', player: 'P1' }).ok).toBe(false);
    expect(
      playCard(state2, { type: 'PlayCard', player: 'P1', cardUid: 'x' }).ok,
    ).toBe(false);

    // Check PlayConversion ALREADY_PASSED error
    state2.phase = 'development';
    state2.era = 3;
    state2.players.P1.passed = true;
    state2.players.P1.hand.push({
      uid: 'conv_frn',
      cardId: 'e3_frn',
      owner: 'P1',
      drawnOrder: 99,
    });
    state2.players.P1.buildings = [
      { uid: 'b1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    expect(
      playConversion(state2, {
        type: 'PlayConversion',
        player: 'P1',
        cardUid: 'conv_frn',
        sacrificeUid: 'b1',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'ALREADY_PASSED', message: expect.any(String) },
    });

    // Check public sacrificeVisibility and discardVisibility
    state2.players.P1.passed = false;
    state2.toAct = 'P1';
    state2.rules.sacrificeVisibility = 'public';
    state2.rules.discardVisibility = 'public';
    state2.players.P1.resources = { food: 10, wood: 10, metal: 10 };
    const pubConv = playConversion(state2, {
      type: 'PlayConversion',
      player: 'P1',
      cardUid: 'conv_frn',
      sacrificeUid: 'b1',
    });
    expect(pubConv.ok).toBe(true);
    if (pubConv.ok) {
      expect(pubConv.value.state.players.P1.publicDiscard).toContain('e1_farm');
    }

    // Check discardVisibility = 'public' in hand_limit
    const state3 = createEra1DevelopmentState();
    state3.rules.discardVisibility = 'public';
    state3.players.P2.hand.splice(0, 3);
    startNextEra(state3, dummyEvents, 2);
    const p1DiscardUids = state3.players.P1.hand.slice(0, 3).map((c) => c.uid);
    const pubDiscardRes = submitDiscard(state3, {
      type: 'SubmitDiscard',
      player: 'P1',
      cardUids: p1DiscardUids,
    });
    expect(pubDiscardRes.ok).toBe(true);
    if (pubDiscardRes.ok) {
      expect(pubDiscardRes.value.state.players.P1.publicDiscard).toHaveLength(3);
    }

    // Check getEffectiveUnitDem with unknown cardId
    expect(() =>
      getEffectiveUnitDem(
        {
          uid: 'u_bad',
          cardId: 'missing_card',
          owner: 'P1',
          drawnOrder: 1,
          seq: 1,
          hp: 1,
          line: 'front',
          atkMod: 0,
          revealed: false,
        },
        state2.players.P1,
        state2.catalog,
      ),
    ).toThrow(/not found in catalog/);
  });
});
