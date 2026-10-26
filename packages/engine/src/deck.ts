// GDD §2.1, TECH-SPEC §4.6 (riga 322)
// Validazione pura di un mazzo da 60 carte (3 sotto-mazzi da 20 carte, max 3 copie per carta,
// esistenza nel catalogo e appartenenza all'Era del rispettivo sotto-mazzo).

import type { CardRules, EraNo } from './types.js';
import type { DeckPayload, ValidationIssue } from './view-types.js';

const ERA_SUBDECK_KEYS: ReadonlyArray<readonly ['1' | '2' | '3', EraNo]> = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
];

export const SUBDECK_SIZE = 20;
export const MAX_COPIES_PER_CARD = 3;

/**
 * Valida la composizione di un mazzo secondo GDD §2.1:
 * - 3 sotto-mazzi (Era I, Era II, Era III) da esattamente 20 carte ciascuno (60 totali);
 * - ogni cardId deve esistere nel catalogo fornito;
 * - ogni carta deve appartenere al sotto-mazzo della propria Era (card.era === eraNo);
 * - nessuna carta può comparire più di 3 volte complessivamente nel mazzo.
 */
export function validateDeck(
  deck: DeckPayload,
  catalog: Record<string, CardRules>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const copyCounts: Record<string, number> = {};

  for (const [eraKey, eraNo] of ERA_SUBDECK_KEYS) {
    const cards = deck.subdecks[eraKey];
    if (cards.length !== SUBDECK_SIZE) {
      issues.push({
        code: 'INVALID_SUBDECK_LENGTH',
        path: `subdecks.${eraKey}`,
        era: eraNo,
        message: `Era ${eraNo} subdeck must contain exactly ${SUBDECK_SIZE} cards, got ${cards.length}.`,
      });
    }

    for (let i = 0; i < cards.length; i++) {
      const cardId = cards[i]!;
      copyCounts[cardId] = (copyCounts[cardId] ?? 0) + 1;

      const cardRules = catalog[cardId];
      if (cardRules === undefined) {
        issues.push({
          code: 'UNKNOWN_CARD_ID',
          path: `subdecks.${eraKey}[${i}]`,
          cardId,
          era: eraNo,
          message: `Card "${cardId}" at subdecks.${eraKey}[${i}] does not exist in catalog.`,
        });
        continue;
      }

      if (cardRules.era !== eraNo) {
        issues.push({
          code: 'WRONG_CARD_ERA',
          path: `subdecks.${eraKey}[${i}]`,
          cardId,
          era: eraNo,
          message: `Card "${cardId}" belongs to Era ${cardRules.era}, not Era ${eraNo} subdeck.`,
        });
      }
    }
  }

  const checkedCardIds = Object.keys(copyCounts).sort();
  for (const cardId of checkedCardIds) {
    const count = copyCounts[cardId]!;
    if (count > MAX_COPIES_PER_CARD) {
      issues.push({
        code: 'MAX_COPIES_EXCEEDED',
        path: 'subdecks',
        cardId,
        message: `Card "${cardId}" appears ${count} times across subdecks (maximum allowed is ${MAX_COPIES_PER_CARD}).`,
      });
    }
  }

  return issues;
}
