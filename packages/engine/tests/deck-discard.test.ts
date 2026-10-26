import { describe, expect, it } from 'vitest';
import { validateDeck } from '../src/deck.js';
import { autoDiscard, getTotalCardCost } from '../src/discard-policy.js';
import type { CardInstance, CardRules } from '../src/types.js';
import type { DeckPayload } from '../src/view-types.js';
import cardsRulesJson from '../../../data/cards.rules.json' with { type: 'json' };
import aggroBreachJson from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import balancedTacticalJson from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import boomEconomyJson from '../../../data/decks/boom-economy.json' with { type: 'json' };

const catalog = cardsRulesJson as unknown as Record<string, CardRules>;

describe('validateDeck (GDD §2.1)', () => {
  it('accepts all 3 official preset decks (aggro-breach, balanced-tactical, boom-economy)', () => {
    expect(validateDeck(aggroBreachJson as DeckPayload, catalog)).toEqual([]);
    expect(validateDeck(balancedTacticalJson as DeckPayload, catalog)).toEqual(
      [],
    );
    expect(validateDeck(boomEconomyJson as DeckPayload, catalog)).toEqual([]);
  });

  it('detects subdecks with length !== 20', () => {
    const deck: DeckPayload = structuredClone(aggroBreachJson as DeckPayload);
    deck.subdecks['1'] = deck.subdecks['1'].slice(0, 19);

    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === 'INVALID_SUBDECK_LENGTH')).toBe(true);
    expect(
      issues.find((i) => i.code === 'INVALID_SUBDECK_LENGTH')?.era,
    ).toBe(1);
  });

  it('detects unknown card IDs not in catalog', () => {
    const deck: DeckPayload = structuredClone(aggroBreachJson as DeckPayload);
    deck.subdecks['2'][0] = 'non_existent_card';

    const issues = validateDeck(deck, catalog);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_CARD_ID',
        cardId: 'non_existent_card',
        era: 2,
      }),
    );
  });

  it('detects cards placed in the wrong Era subdeck', () => {
    const deck: DeckPayload = structuredClone(aggroBreachJson as DeckPayload);
    // Put an Era II card ('e2_mill') inside Era I subdeck
    deck.subdecks['1'][0] = 'e2_mill';

    const issues = validateDeck(deck, catalog);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'WRONG_CARD_ERA',
        cardId: 'e2_mill',
        era: 1,
      }),
    );
  });

  it('detects more than 3 copies of the same card', () => {
    const deck: DeckPayload = structuredClone(aggroBreachJson as DeckPayload);
    // Replace first two cards of Era I with 'u1_inf_l' (which already has 3 copies in aggro-breach)
    deck.subdecks['1'][0] = 'u1_inf_l';
    deck.subdecks['1'][1] = 'u1_inf_l';

    const issues = validateDeck(deck, catalog);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'MAX_COPIES_EXCEEDED',
        cardId: 'u1_inf_l',
      }),
    );
  });
});

describe('autoDiscard — FIFO discard policy (GDD §2.3.3, TV-09)', () => {
  it('TV-09: discards 2 cards from a 12-card hand at start of Era II by era ASC, totalCost ASC, drawnOrder ASC (FIFO)', () => {
    // TV-09: Mano di 12 carte a inizio Era II, scarto automatico (autoDiscard) di 2 carte:
    // presenti carte di Era I ed Era II, e a parità di Era/costo drawnOrder 3 e 5.
    // Si scartano prima le carte di Era inferiore; a parità di Era quelle col costo totale inferiore;
    // a ulteriore parità drawnOrder 3 prima di 5 (FIFO).
    const hand: CardInstance[] = [
      // Era II cards (should be kept over Era I cards regardless of cost/drawnOrder)
      { uid: 'u_era2_1', cardId: 'e2_mill', owner: 'P1', drawnOrder: 9 }, // Era 2, cost 5
      { uid: 'u_era2_2', cardId: 'i2_sab', owner: 'P1', drawnOrder: 10 }, // Era 2, cost 3
      { uid: 'u_era2_3', cardId: 'u2_inf_l', owner: 'P1', drawnOrder: 11 }, // Era 2, cost 4
      { uid: 'u_era2_4', cardId: 'u2_arc_l', owner: 'P1', drawnOrder: 12 }, // Era 2, cost 4
      { uid: 'u_era2_5', cardId: 'u2_cav_h', owner: 'P1', drawnOrder: 13 }, // Era 2, cost 5

      // Era I cards with higher total cost (cost 3 or 4)
      { uid: 'u_era1_cost4', cardId: 'e1_mine', owner: 'P1', drawnOrder: 1 }, // Era 1, cost 2+2+0 = 4
      { uid: 'u_era1_cost3_a', cardId: 'u1_inf_h', owner: 'P1', drawnOrder: 2 }, // Era 1, cost 2+1+0 = 3
      { uid: 'u_era1_cost3_b', cardId: 'u1_spr_h', owner: 'P1', drawnOrder: 4 }, // Era 1, cost 1+2+0 = 3
      { uid: 'u_era1_cost3_c', cardId: 'u1_cav_l', owner: 'P1', drawnOrder: 6 }, // Era 1, cost 3+0+0 = 3

      // Era I cards with lowest total cost (cost 2), put in non-sorted order in hand array:
      { uid: 'u_era1_cost2_order7', cardId: 'u1_inf_l', owner: 'P1', drawnOrder: 7 }, // Era 1, cost 2, drawnOrder 7
      { uid: 'u_era1_cost2_order5', cardId: 'e1_lumb', owner: 'P1', drawnOrder: 5 }, // Era 1, cost 2, drawnOrder 5
      { uid: 'u_era1_cost2_order3', cardId: 'e1_farm', owner: 'P1', drawnOrder: 3 }, // Era 1, cost 2, drawnOrder 3
    ];

    expect(hand).toHaveLength(12);
    const frozenHand = Object.freeze(hand.slice());

    // Discarding 2 cards must pick Era 1, cost 2, drawnOrder 3 first and drawnOrder 5 second
    const discarded2 = autoDiscard(frozenHand, catalog, 2);
    expect(discarded2).toEqual([
      'u_era1_cost2_order3',
      'u_era1_cost2_order5',
    ]);

    // If discarding 1 card, it must pick drawnOrder 3 before drawnOrder 5
    const discarded1 = autoDiscard(frozenHand, catalog, 1);
    expect(discarded1).toEqual(['u_era1_cost2_order3']);

    // If discarding 4 cards, it picks the three cost-2 Era 1 cards (orders 3, 5, 7) then the first cost-3 Era 1 card (order 2)
    const discarded4 = autoDiscard(frozenHand, catalog, 4);
    expect(discarded4).toEqual([
      'u_era1_cost2_order3',
      'u_era1_cost2_order5',
      'u_era1_cost2_order7',
      'u_era1_cost3_a',
    ]);
  });

  it('Prioritizes lower Era over lower total cost (e.g. Era I cost 4 before Era II cost 3)', () => {
    // e1_mine is Era I with cost 2+2+0 = 4; i2_sab is Era II with cost 1+0+2 = 3
    expect(getTotalCardCost(catalog['e1_mine']!)).toBe(4);
    expect(getTotalCardCost(catalog['i2_sab']!)).toBe(3);

    const hand: CardInstance[] = [
      { uid: 'era2_cheap', cardId: 'i2_sab', owner: 'P1', drawnOrder: 1 },
      { uid: 'era1_expensive', cardId: 'e1_mine', owner: 'P1', drawnOrder: 99 },
    ];

    expect(autoDiscard(hand, catalog, 1)).toEqual(['era1_expensive']);
  });

  it('handles countToDiscard <= 0 and throws on unknown cardId', () => {
    const hand: CardInstance[] = [
      { uid: 'c1', cardId: 'e1_farm', owner: 'P1', drawnOrder: 1 },
    ];
    expect(autoDiscard(hand, catalog, 0)).toEqual([]);
    expect(autoDiscard(hand, catalog, -2)).toEqual([]);

    const invalidHand: CardInstance[] = [
      { uid: 'bad', cardId: 'unknown_card', owner: 'P1', drawnOrder: 1 },
    ];
    expect(() => autoDiscard(invalidHand, catalog, 1)).toThrow(
      /not found in catalog/,
    );
  });
});
