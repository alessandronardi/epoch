// GDD §2.3.3, TECH-SPEC §4.6 (righe 328, 332), Appendice A TV-09
// Politica deterministica obbligatoria per lo scarto automatico da limite di mano (10 carte).

import type { CardInstance, CardRules } from './types.js';

export const HAND_LIMIT = 10;

/**
 * Restituisce il costo totale di una carta: Cibo + Legno + Metallo (GDD §2.3.3).
 */
export function getTotalCardCost(card: CardRules): number {
  return card.cost.food + card.cost.wood + card.cost.metal;
}

/**
 * Seleziona deterministicamente le carte da scartare dalla mano (GDD §2.3.3, TV-09):
 * 1. Era inferiore (`card.era` crescente);
 * 2. A parità di Era, costo totale inferiore (`food + wood + metal` crescente);
 * 3. A ulteriore parità, pescate prima (`drawnOrder` crescente, FIFO).
 *
 * Restituisce gli `uid` delle prime `countToDiscard` carte ordinate secondo la politica.
 * Non muta mai l'array `hand` in ingresso.
 */
export function autoDiscard(
  hand: readonly CardInstance[],
  catalog: Record<string, CardRules>,
  countToDiscard: number,
): string[] {
  if (countToDiscard <= 0) {
    return [];
  }

  const annotated = hand.map((instance) => {
    const rules = catalog[instance.cardId];
    if (rules === undefined) {
      throw new Error(
        `Card "${instance.cardId}" (uid "${instance.uid}") not found in catalog during autoDiscard.`,
      );
    }
    return {
      uid: instance.uid,
      era: rules.era,
      totalCost: getTotalCardCost(rules),
      drawnOrder: instance.drawnOrder,
    };
  });

  annotated.sort((a, b) => {
    if (a.era !== b.era) {
      return a.era - b.era;
    }
    if (a.totalCost !== b.totalCost) {
      return a.totalCost - b.totalCost;
    }
    return a.drawnOrder - b.drawnOrder;
  });

  return annotated.slice(0, countToDiscard).map((entry) => entry.uid);
}
