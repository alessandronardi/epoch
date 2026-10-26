import { describe, expect, it } from 'vitest';
import {
  createGame,
  getOpponent,
  mergeRulesConfig,
  mutateSubmitMulligan,
  submitMulligan,
} from '../src/setup.js';
import type { CardRules, EraNo, PlayerId } from '../src/types.js';
import type { DeckPayload } from '../src/view-types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import aggroBreachJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;
const aggroDeck = aggroBreachJson as DeckPayload;
const balancedDeck = balancedTacticalJson as DeckPayload;

function buildFixedDecks(): Record<PlayerId, Record<EraNo, string[]>> {
  return {
    P1: {
      1: aggroDeck.subdecks['1'].slice(),
      2: aggroDeck.subdecks['2'].slice(),
      3: aggroDeck.subdecks['3'].slice(),
    },
    P2: {
      1: balancedDeck.subdecks['1'].slice(),
      2: balancedDeck.subdecks['2'].slice(),
      3: balancedDeck.subdecks['3'].slice(),
    },
  };
}

describe('createGame — Initial Game Setup (GDD §2.1, §2.2, §3.2, §3.3.1)', () => {
  it('initializes structures (Walls 6, City 10/10), initial resources (2/2/0), draws 8 Era I cards with monotonic drawnOrder, and enters mulligan', () => {
    expect(getOpponent('P1')).toBe('P2');
    expect(getOpponent('P2')).toBe('P1');

    const customRules = mergeRulesConfig({
      autoPassWhenNoLegalPlay: true,
    });
    expect(customRules.autoPassWhenNoLegalPlay).toBe(true);

    const { state, events } = createGame({
      seed: 'setup-seed-01',
      catalog,
      decks: { P1: aggroDeck, P2: balancedDeck },
      fixedInitiative: 'P1',
      rules: { autoPassWhenNoLegalPlay: true },
    });

    expect(state.era).toBe(1);
    expect(state.phase).toBe('mulligan');
    expect(state.initiative).toBe('P1');
    expect(state.toAct).toBeNull();
    expect(state.stateVersion).toBe(0);
    expect(state.rules.autoPassWhenNoLegalPlay).toBe(true);

    for (const player of ['P1', 'P2'] as const) {
      const p = state.players[player];
      expect(p.walls).toBe(6);
      expect(p.cityMax).toBe(10);
      expect(p.cityDamage).toBe(0);
      expect(p.resources).toEqual({ food: 2, wood: 2, metal: 0 });
      expect(p.hand).toHaveLength(8);
      expect(p.subdecks[1]).toHaveLength(12);
      expect(p.subdecks[2]).toHaveLength(20);
      expect(p.subdecks[3]).toHaveLength(20);
      expect(p.buildings).toEqual([]);
      expect(p.units).toEqual([]);
      expect(p.discard).toEqual([]);
      expect(p.mulliganDone).toBe(false);

      // Total conservation of 60 cards
      const totalCards =
        p.hand.length +
        p.subdecks[1].length +
        p.subdecks[2].length +
        p.subdecks[3].length +
        p.buildings.length +
        p.units.length +
        p.discard.length;
      expect(totalCards).toBe(60);
    }

    // Verify monotonic drawnOrder 1..16 across P1 and P2 hands
    const allDrawnOrders = [
      ...state.players.P1.hand.map((c) => c.drawnOrder),
      ...state.players.P2.hand.map((c) => c.drawnOrder),
    ];
    expect(allDrawnOrders).toEqual(
      Array.from({ length: 16 }, (_, idx) => idx + 1),
    );

    // Verify setup event sequence
    expect(events.map((e) => e.type)).toEqual([
      'GameStarted',
      'InitiativeAssigned',
      'EraStarted',
      'ResourcesChanged',
      'ResourcesChanged',
      'CardsDrawn',
      'CardsDrawn',
    ]);
    expect(events.map((e) => e.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('assigns initiative deterministically from PRNG when fixedInitiative is omitted (covering both P1 and P2 outcomes)', () => {
    const gameA = createGame({
      seed: 'prng-initiative-seed-1',
      catalog,
      decks: { P1: aggroDeck, P2: balancedDeck },
    });
    const gameB = createGame({
      seed: 'prng-initiative-seed-2',
      catalog,
      decks: { P1: aggroDeck, P2: balancedDeck },
    });

    const initiatives = new Set<PlayerId>();
    for (let i = 0; i < 10; i++) {
      const g = createGame({
        seed: `seed-init-${i}`,
        catalog,
        fixedDecks: buildFixedDecks(),
      });
      initiatives.add(g.state.initiative);
    }
    expect(initiatives.has('P1')).toBe(true);
    expect(initiatives.has('P2')).toBe(true);
    expect(['P1', 'P2']).toContain(gameA.state.initiative);
    expect(['P1', 'P2']).toContain(gameB.state.initiative);
  });

  it('rejects invalid decks, unknown cards in fixedDecks, or missing deck configuration', () => {
    expect(() =>
      createGame({
        seed: 'bad-config',
        catalog,
      }),
    ).toThrow(/Either decks or fixedDecks/);

    expect(() =>
      createGame({
        seed: 'missing-p2-deck',
        catalog,
        decks: { P1: aggroDeck } as unknown as Record<PlayerId, DeckPayload>,
      }),
    ).toThrow(/Either decks or fixedDecks must be provided for player P2/);

    const badFixed = buildFixedDecks();
    badFixed.P1[1][0] = 'unknown_card_xyz';
    expect(() =>
      createGame({
        seed: 'bad-fixed-card',
        catalog,
        fixedDecks: badFixed,
      }),
    ).toThrow(/does not exist in catalog/);

    const invalidDeck: DeckPayload = structuredClone(aggroDeck);
    invalidDeck.subdecks['1'] = invalidDeck.subdecks['1'].slice(0, 10);
    expect(() =>
      createGame({
        seed: 'bad-deck',
        catalog,
        decks: { P1: invalidDeck, P2: balancedDeck },
      }),
    ).toThrow(/Invalid deck for P1/);
  });
});

describe('SubmitMulligan — TV-08, R6, Simultaneous Commit & Automatic Transition to Development', () => {
  it('TV-08 & R6: draws N replacement cards from top of Era I subdeck BEFORE putting N returned cards at bottom sorted by drawnOrder ASC', () => {
    // TV-08: Mulligan Era I: sotto-mazzo [c1..c20], mano iniziale c1..c8, il giocatore cambia {c2, c5}.
    // Pesca prima c9, c10; mano finale {c1,c3,c4,c6,c7,c8,c9,c10}; sotto-mazzo [c11..c20, c2, c5].
    const fixedDecks = buildFixedDecks();
    const { state: initialState } = createGame({
      seed: 'tv-08-seed',
      catalog,
      fixedDecks,
      fixedInitiative: 'P1',
    });

    // Capture the original 20 Era I card UIDs in order c1..c20 for P1
    const c1ToC8 = initialState.players.P1.hand.map((c) => c.uid);
    const c9ToC20 = initialState.players.P1.subdecks[1].map((c) => c.uid);
    const c = [...c1ToC8, ...c9ToC20]; // 0-indexed: c[0] = c1, c[1] = c2, ..., c[19] = c20
    expect(c).toHaveLength(20);

    const c2Uid = c[1]!;
    const c5Uid = c[4]!;

    // Pass [c5, c2] in reverse order to verify R6 sorts returned cards by drawnOrder ASC (c2 before c5)
    const step1 = submitMulligan(initialState, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [c5Uid, c2Uid],
    });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;

    // P1 is committed in pending, phase is still 'mulligan' waiting for P2
    expect(step1.value.state.phase).toBe('mulligan');
    expect(step1.value.state.stateVersion).toBe(1);
    expect(step1.value.state.pending.P1).toEqual({
      window: 'mulligan',
      cardUids: [c5Uid, c2Uid],
    });
    expect(step1.value.events).toEqual([
      {
        n: 8,
        type: 'PlayerCommitted',
        player: 'P1',
        window: 'mulligan',
      },
    ]);

    // P2 submits empty mulligan (keeps all 8 cards)
    const step2 = submitMulligan(step1.value.state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;

    const finalState = step2.value.state;

    // Check TV-08 hand: [c1, c3, c4, c6, c7, c8, c9, c10]
    expect(finalState.players.P1.hand.map((card) => card.uid)).toEqual([
      c[0]!, // c1
      c[2]!, // c3
      c[3]!, // c4
      c[5]!, // c6
      c[6]!, // c7
      c[7]!, // c8
      c[8]!, // c9
      c[9]!, // c10
    ]);

    // Check TV-08 Era I subdeck: [c11..c20, c2, c5]
    expect(finalState.players.P1.subdecks[1].map((card) => card.uid)).toEqual([
      ...c.slice(10, 20), // c11..c20
      c[1]!, // c2 (drawnOrder 2)
      c[4]!, // c5 (drawnOrder 5)
    ]);

    // Check drawnOrder of replacement cards c9 and c10 (17 and 18 after initial 1..16)
    expect(finalState.players.P1.hand[6]!.drawnOrder).toBe(17);
    expect(finalState.players.P1.hand[7]!.drawnOrder).toBe(18);

    // Check automatic transition to Era I Opening Harvest and Cycle 1 of development
    expect(finalState.pending).toEqual({});
    expect(finalState.players.P1.mulliganDone).toBe(true);
    expect(finalState.players.P2.mulliganDone).toBe(true);
    expect(finalState.phase).toBe('development');
    expect(finalState.cycle).toBe(1);
    expect(finalState.toAct).toBe('P1');

    // Both players have 4/4/0 after Era I opening harvest (+2/+2/+0 added to initial 2/2/0)
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

    // Check emitted events on second commit
    expect(step2.value.events.map((e) => e.type)).toEqual([
      'PlayerCommitted',
      'MulliganResolved',
      'MulliganResolved',
      'ResourcesChanged',
      'ResourcesChanged',
      'CycleStarted',
    ]);
  });

  it('returns DECISION_ALREADY_LOCKED if a player attempts to submit mulligan twice in the same window', () => {
    const { state } = createGame({
      seed: 'double-commit-seed',
      catalog,
      fixedDecks: buildFixedDecks(),
      fixedInitiative: 'P1',
    });

    const firstCommit = submitMulligan(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(firstCommit.ok).toBe(true);
    if (!firstCommit.ok) return;

    const frozenAfterFirst = Object.freeze(firstCommit.value.state);
    const secondCommit = submitMulligan(frozenAfterFirst, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [frozenAfterFirst.players.P1.hand[0]!.uid],
    });

    expect(secondCommit).toEqual({
      ok: false,
      error: {
        code: 'DECISION_ALREADY_LOCKED',
        message: expect.stringContaining('P1'),
      },
    });
  });

  it('rejects invalid mulligan commands (wrong phase, unknown card UID, duplicate card UID) without mutating state', () => {
    const { state } = createGame({
      seed: 'invalid-mulligan-seed',
      catalog,
      fixedDecks: buildFixedDecks(),
      fixedInitiative: 'P1',
    });

    // Unknown card UID not in P1's hand
    const badUidResult = submitMulligan(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: ['non_existent_uid'],
    });
    expect(badUidResult.ok).toBe(false);
    if (!badUidResult.ok) {
      expect(badUidResult.error.code).toBe('CARD_NOT_IN_HAND');
    }

    // Duplicate card UID in selection
    const c1Uid = state.players.P1.hand[0]!.uid;
    const dupUidResult = submitMulligan(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [c1Uid, c1Uid],
    });
    expect(dupUidResult.ok).toBe(false);
    if (!dupUidResult.ok) {
      expect(dupUidResult.error.code).toBe('CARD_NOT_IN_HAND');
    }

    // Complete mulligan for both players so phase transitions to 'development'
    const s1 = submitMulligan(state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const s2 = submitMulligan(s1.value.state, {
      type: 'SubmitMulligan',
      player: 'P2',
      cardUids: [],
    });
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;

    // Attempting SubmitMulligan during 'development' returns INVALID_PHASE (also via mutateSubmitMulligan)
    const wrongPhaseResult = submitMulligan(s2.value.state, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [],
    });
    expect(wrongPhaseResult.ok).toBe(false);
    if (!wrongPhaseResult.ok) {
      expect(wrongPhaseResult.error.code).toBe('INVALID_PHASE');
    }

    const mutateErr = mutateSubmitMulligan(
      s2.value.state,
      { type: 'SubmitMulligan', player: 'P1', cardUids: [] },
      [],
    );
    expect(mutateErr.ok).toBe(false);

    // Subdeck smaller than mulligan count returns INVALID_DISCARD_COUNT
    const shortSubdeckDecks = buildFixedDecks();
    shortSubdeckDecks.P1[1] = shortSubdeckDecks.P1[1].slice(0, 8); // 0 cards left in subdeck after initial 8-card draw
    const { state: shortState } = createGame({
      seed: 'short-subdeck-seed',
      catalog,
      fixedDecks: shortSubdeckDecks,
      fixedInitiative: 'P1',
    });
    const tooManyCardsResult = submitMulligan(shortState, {
      type: 'SubmitMulligan',
      player: 'P1',
      cardUids: [shortState.players.P1.hand[0]!.uid],
    });
    expect(tooManyCardsResult.ok).toBe(false);
    if (!tooManyCardsResult.ok) {
      expect(tooManyCardsResult.error.code).toBe('INVALID_DISCARD_COUNT');
    }
  });
});
