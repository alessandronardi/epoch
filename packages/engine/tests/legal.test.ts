import { describe, expect, it } from 'vitest';
import { legalCommands } from '../src/legal.js';
import { createGame, submitMulligan } from '../src/setup.js';
import type { CardRules, EraNo, GameState, PlayerId } from '../src/types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

function loadOfficialCatalog(): Record<string, CardRules> {
  return catalog;
}

function buildTestFixedDecks(): Record<PlayerId, Record<EraNo, string[]>> {
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

function createDevelopmentState(): GameState {
  const catalog = loadOfficialCatalog();
  const { state } = createGame({
    seed: 'legal-test-seed',
    catalog,
    fixedDecks: buildTestFixedDecks(),
    fixedInitiative: 'P1',
  });
  const m1 = submitMulligan(state, {
    type: 'SubmitMulligan',
    player: 'P1',
    cardUids: [],
  });
  if (!m1.ok) throw new Error(m1.error.message);
  const m2 = submitMulligan(m1.value.state, {
    type: 'SubmitMulligan',
    player: 'P2',
    cardUids: [],
  });
  if (!m2.ok) throw new Error(m2.error.message);
  return structuredClone(m2.value.state);
}

describe('Task M1-07: legalCommands and UnplayableReason', () => {
  it('computes legal commands in mulligan phase before and after commit', () => {
    const catalog = loadOfficialCatalog();
    const { state } = createGame({
      seed: 'mulligan-legal',
      catalog,
      fixedDecks: buildTestFixedDecks(),
      fixedInitiative: 'P1',
    });

    const p1Legal = legalCommands(state, 'P1');
    expect(p1Legal.phase).toBe('mulligan');
    expect(p1Legal.canAct).toBe(true);
    expect(p1Legal.canSubmitMulligan).toBe(true);
    expect(p1Legal.maxMulliganCards).toBe(8);
    expect(p1Legal.canSubmitDiscard).toBe(false);
    expect(p1Legal.mustDiscardCount).toBe(0);
    expect(p1Legal.canPass).toBe(false);
    expect(p1Legal.canLockInstants).toBe(false);
    expect(p1Legal.playableFieldCardUids).toEqual([]);
    expect(p1Legal.playableConversionUids).toEqual([]);
    expect(p1Legal.sacrificableBuildingUids).toEqual([]);
    expect(p1Legal.playableInstantUids).toEqual([]);

    for (const card of state.players.P1.hand) {
      expect(p1Legal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'wrong_phase',
      });
    }

    // After P1 commits mulligan
    const afterP1 = submitMulligan(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(afterP1.ok).toBe(true);
    if (!afterP1.ok) return;

    const p1CommittedLegal = legalCommands(afterP1.value.state, 'P1');
    expect(p1CommittedLegal.canAct).toBe(false);
    expect(p1CommittedLegal.canSubmitMulligan).toBe(false);
    expect(p1CommittedLegal.maxMulliganCards).toBe(0);
    for (const card of afterP1.value.state.players.P1.hand) {
      expect(p1CommittedLegal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'already_committed',
      });
    }

    // P2 can still submit mulligan
    const p2Legal = legalCommands(afterP1.value.state, 'P2');
    expect(p2Legal.canAct).toBe(true);
    expect(p2Legal.canSubmitMulligan).toBe(true);
  });

  it('computes legal commands in hand_limit phase for players above/within limit and after commit', () => {
    const state = createDevelopmentState();
    state.era = 2;
    state.phase = 'hand_limit';
    state.toAct = null;

    // Give P1 12 cards (needs to discard 2) and keep P2 at 8 cards (no discard needed)
    const extraCards = state.players.P1.subdecks[2].splice(0, 4);
    state.players.P1.hand.push(...extraCards);
    expect(state.players.P1.hand.length).toBe(12);
    expect(state.players.P2.hand.length).toBe(8);

    const p1Legal = legalCommands(state, 'P1');
    expect(p1Legal.phase).toBe('hand_limit');
    expect(p1Legal.canAct).toBe(true);
    expect(p1Legal.canSubmitDiscard).toBe(true);
    expect(p1Legal.mustDiscardCount).toBe(2);
    for (const card of state.players.P1.hand) {
      expect(p1Legal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'wrong_phase',
      });
    }

    const p2Legal = legalCommands(state, 'P2');
    expect(p2Legal.canAct).toBe(false);
    expect(p2Legal.canSubmitDiscard).toBe(false);
    expect(p2Legal.mustDiscardCount).toBe(0);

    // Simulate P1 committing discard
    state.pending.P1 = {
      window: 'hand_limit',
      cardUids: [state.players.P1.hand[0]!.uid, state.players.P1.hand[1]!.uid],
    };
    const p1Committed = legalCommands(state, 'P1');
    expect(p1Committed.canAct).toBe(false);
    expect(p1Committed.canSubmitDiscard).toBe(false);
    expect(p1Committed.mustDiscardCount).toBe(0);
    for (const card of state.players.P1.hand) {
      expect(p1Committed.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'already_committed',
      });
    }
  });

  it('computes development playability for active player, non-active player, and passed player', () => {
    const state = createDevelopmentState();
    // P1 is active with 4 food, 4 wood, 0 metal
    const p1Legal = legalCommands(state, 'P1');
    expect(p1Legal.phase).toBe('development');
    expect(p1Legal.canAct).toBe(true);
    expect(p1Legal.canPass).toBe(true);

    // P1 hand has: e1_farm (0/2/0), e1_lumb (2/0/0), e1_mine (2/2/0), u1_inf_l (2/0/0),
    // u1_inf_h (2/1/0), u1_spr_l (1/1/0), u1_arc_l (1/1/0), i1_arr (instant)
    const instantCard = state.players.P1.hand.find(
      (c) => c.cardId === 'i1_arr',
    )!;
    expect(p1Legal.handPlayability[instantCard.uid]).toEqual({
      playable: false,
      reason: 'wrong_phase',
    });

    const farmCard = state.players.P1.hand.find((c) => c.cardId === 'e1_farm')!;
    expect(p1Legal.handPlayability[farmCard.uid]).toEqual({
      playable: true,
    });
    expect(p1Legal.playableFieldCardUids).toContain(farmCard.uid);
    expect(p1Legal.playableFieldCardUids).not.toContain(instantCard.uid);

    // P2 is not active yet (toAct === 'P1', P2.passed === false)
    const p2Legal = legalCommands(state, 'P2');
    expect(p2Legal.canAct).toBe(false);
    expect(p2Legal.canPass).toBe(false);
    expect(p2Legal.playableFieldCardUids).toEqual([]);
    for (const card of state.players.P2.hand) {
      expect(p2Legal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'wrong_phase',
      });
    }

    // If P1 has already passed
    state.players.P1.passed = true;
    state.toAct = 'P2';
    const p1PassedLegal = legalCommands(state, 'P1');
    expect(p1PassedLegal.canAct).toBe(false);
    expect(p1PassedLegal.canPass).toBe(false);
    expect(p1PassedLegal.playableFieldCardUids).toEqual([]);
    for (const card of state.players.P1.hand) {
      expect(p1PassedLegal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'already_passed',
      });
    }
  });

  it('distinguishes no_slot and insufficient_resources in development and allows previous Era cards', () => {
    const state = createDevelopmentState();
    state.era = 2;
    state.toAct = 'P1';
    state.players.P1.resources = { food: 1, wood: 0, metal: 0 };
    state.players.P1.slotsUsed = 0;

    // Put an Era I unit u1_inf_l (cost 2/0/0) and an Era II unit u2_inf_l (cost 3/0/1) in hand,
    // plus an affordable Era I unit when resources are raised
    state.players.P1.hand = [
      { uid: 'u_era1_cheap', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 1 },
      { uid: 'u_era2_unit', cardId: 'u2_inf_l', owner: 'P1', drawnOrder: 2 },
    ];

    // With 1/0/0 resources, both fail with insufficient_resources
    const legalLowRes = legalCommands(state, 'P1');
    expect(legalLowRes.handPlayability['u_era1_cheap']).toEqual({
      playable: false,
      reason: 'insufficient_resources',
    });
    expect(legalLowRes.handPlayability['u_era2_unit']).toEqual({
      playable: false,
      reason: 'insufficient_resources',
    });
    // D6: Even with 0 playable cards, active player can still act by passing
    expect(legalLowRes.canAct).toBe(true);
    expect(legalLowRes.canPass).toBe(true);

    // Give 2/0/0 resources: Era I card conserved in Era II is now playable!
    state.players.P1.resources = { food: 2, wood: 0, metal: 0 };
    const legalMidRes = legalCommands(state, 'P1');
    expect(legalMidRes.handPlayability['u_era1_cheap']).toEqual({
      playable: true,
    });
    expect(legalMidRes.playableFieldCardUids).toEqual(['u_era1_cheap']);
    expect(legalMidRes.handPlayability['u_era2_unit']).toEqual({
      playable: false,
      reason: 'insufficient_resources',
    });

    // When slotsUsed reaches Era II cap (5), field cards report no_slot
    state.players.P1.slotsUsed = 5;
    const legalFullSlots = legalCommands(state, 'P1');
    expect(legalFullSlots.playableFieldCardUids).toEqual([]);
    expect(legalFullSlots.handPlayability['u_era1_cheap']).toEqual({
      playable: false,
      reason: 'no_slot',
    });
    expect(legalFullSlots.handPlayability['u_era2_unit']).toEqual({
      playable: false,
      reason: 'no_slot',
    });
  });

  it('validates conversion cards across Eras, building sacrifice requirements, resources, and 0-slot rule', () => {
    const state = createDevelopmentState();
    state.toAct = 'P1';
    state.players.P1.hand = [
      { uid: 'conv_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 1 }, // cost 0/1/0
      { uid: 'conv_frn', cardId: 'e3_frn', owner: 'P1', drawnOrder: 2 }, // cost 2/0/0
    ];
    state.players.P1.buildings = [
      { uid: 'b_farm', cardId: 'e1_farm', owner: 'P1', drawnOrder: 3 },
    ];
    state.players.P1.resources = { food: 4, wood: 4, metal: 4 };

    // In Era I and Era II, conversions are blocked by wrong_phase even with buildings and resources
    state.era = 1;
    expect(legalCommands(state, 'P1').handPlayability['conv_gld']).toEqual({
      playable: false,
      reason: 'wrong_phase',
    });

    state.era = 2;
    expect(legalCommands(state, 'P1').handPlayability['conv_gld']).toEqual({
      playable: false,
      reason: 'wrong_phase',
    });

    // In Era III with 0 buildings: blocked by no_building_to_sacrifice
    state.era = 3;
    state.players.P1.buildings = [];
    const noBuildingLegal = legalCommands(state, 'P1');
    expect(noBuildingLegal.playableConversionUids).toEqual([]);
    expect(noBuildingLegal.sacrificableBuildingUids).toEqual([]);
    expect(noBuildingLegal.handPlayability['conv_gld']).toEqual({
      playable: false,
      reason: 'no_building_to_sacrifice',
    });
    expect(noBuildingLegal.handPlayability['conv_frn']).toEqual({
      playable: false,
      reason: 'no_building_to_sacrifice',
    });

    // In Era III with 1 building but 0/1/0 resources: e3_gld is playable, e3_frn is insufficient_resources
    state.players.P1.buildings = [
      { uid: 'b_farm', cardId: 'e1_farm', owner: 'P1', drawnOrder: 3 },
      { uid: 'b_lumb', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 4 },
    ];
    state.players.P1.resources = { food: 0, wood: 1, metal: 0 };
    // Even if all 6 logistics slots of Era III are full, conversions consume 0 slots!
    state.players.P1.slotsUsed = 6;

    const era3Legal = legalCommands(state, 'P1');
    expect(era3Legal.playableConversionUids).toEqual(['conv_gld']);
    expect(era3Legal.sacrificableBuildingUids).toEqual(['b_farm', 'b_lumb']);
    expect(era3Legal.handPlayability['conv_gld']).toEqual({
      playable: true,
    });
    expect(era3Legal.handPlayability['conv_frn']).toEqual({
      playable: false,
      reason: 'insufficient_resources',
    });
  });

  it('computes legal commands in prebattle and finished phases', () => {
    const state = createDevelopmentState();
    state.era = 3;
    state.phase = 'prebattle';
    state.toAct = null;
    state.players.P1.slotsUsed = 6; // Full logistics slots do not block instants
    state.players.P1.resources = { food: 0, wood: 2, metal: 0 };
    state.players.P1.hand = [
      { uid: 'inst_arr', cardId: 'i1_arr', owner: 'P1', drawnOrder: 1 }, // cost 0/2/0 (affordable)
      { uid: 'inst_fir', cardId: 'i3_fir', owner: 'P1', drawnOrder: 2 }, // cost 0/2/3 (unaffordable)
      { uid: 'unit_inf', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 3 }, // wrong_phase
      { uid: 'conv_gld', cardId: 'e3_gld', owner: 'P1', drawnOrder: 4 }, // wrong_phase
    ];

    const prebattleLegal = legalCommands(state, 'P1');
    expect(prebattleLegal.phase).toBe('prebattle');
    expect(prebattleLegal.canAct).toBe(true);
    expect(prebattleLegal.canLockInstants).toBe(true);
    expect(prebattleLegal.playableInstantUids).toEqual(['inst_arr']);
    expect(prebattleLegal.handPlayability['inst_arr']).toEqual({
      playable: true,
    });
    expect(prebattleLegal.handPlayability['inst_fir']).toEqual({
      playable: false,
      reason: 'insufficient_resources',
    });
    expect(prebattleLegal.handPlayability['unit_inf']).toEqual({
      playable: false,
      reason: 'wrong_phase',
    });
    expect(prebattleLegal.handPlayability['conv_gld']).toEqual({
      playable: false,
      reason: 'wrong_phase',
    });

    // After P1 commits LockInstants
    state.pending.P1 = { window: 'prebattle', cardUids: ['inst_arr'] };
    const committedLegal = legalCommands(state, 'P1');
    expect(committedLegal.canAct).toBe(false);
    expect(committedLegal.canLockInstants).toBe(false);
    expect(committedLegal.playableInstantUids).toEqual([]);
    for (const card of state.players.P1.hand) {
      expect(committedLegal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'already_committed',
      });
    }

    // Finished phase
    state.pending = {};
    state.phase = 'finished';
    const finishedLegal = legalCommands(state, 'P1');
    expect(finishedLegal.phase).toBe('finished');
    expect(finishedLegal.canAct).toBe(false);
    expect(finishedLegal.canLockInstants).toBe(false);
    for (const card of state.players.P1.hand) {
      expect(finishedLegal.handPlayability[card.uid]).toEqual({
        playable: false,
        reason: 'wrong_phase',
      });
    }
  });

  it('throws a descriptive error if a card in hand is missing from catalog', () => {
    const state = createDevelopmentState();
    state.players.P1.hand.push({
      uid: 'bad_uid',
      cardId: 'non_existent_card',
      owner: 'P1',
      drawnOrder: 99,
    });

    expect(() => legalCommands(state, 'P1')).toThrow(/not found in catalog/);
  });
});
