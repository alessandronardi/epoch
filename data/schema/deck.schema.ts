import type { CivilizationId, ContentVersion } from '../versions.js';
import { z } from 'zod';

const CardIdSchema = z.string().min(1);

const SubdeckCardsSchema = z.array(CardIdSchema).length(20);

export interface DeckSubdecks {
  '1': string[];
  '2': string[];
  '3': string[];
}

export interface DeckPayload {
  schemaVersion?: 1 | 2;
  rulesetVersion?: ContentVersion;
  catalogVersion?: ContentVersion;
  civilizationId?: CivilizationId;
  id?: string;
  name: string;
  description?: string;
  subdecks: DeckSubdecks;
}

const BaseDeckPayloadSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    rulesetVersion: z.enum(['1.0', '2.0']).optional(),
    catalogVersion: z.enum(['1.0', '2.0']).optional(),
    civilizationId: z.enum(['feudal', 'norse', 'byzantine']).optional(),
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(60),
    description: z.string().max(240).optional(),
    subdecks: z
      .object({
        '1': SubdeckCardsSchema,
        '2': SubdeckCardsSchema,
        '3': SubdeckCardsSchema,
      })
      .strict(),
  })
  .strict();

export const DeckPayloadSchema: z.ZodType<DeckPayload> = BaseDeckPayloadSchema.superRefine(
  (deck, ctx) => {
    const isV2 =
      deck.schemaVersion === 2 ||
      deck.rulesetVersion === '2.0' ||
      deck.catalogVersion === '2.0' ||
      deck.civilizationId !== undefined;
    if (
      isV2 &&
      (deck.schemaVersion !== 2 ||
        deck.rulesetVersion !== '2.0' ||
        deck.catalogVersion !== '2.0' ||
        deck.civilizationId === undefined)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['civilizationId'],
        message: 'V2 decks require schema 2, rules/catalog 2.0 and an explicit civilization.',
      });
    const counts: Record<string, number> = {};

    const eras: Array<['1' | '2' | '3', 1 | 2 | 3]> = [
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ];

    for (const [eraKey] of eras) {
      const cards = deck.subdecks[eraKey];
      for (let i = 0; i < cards.length; i++) {
        const cardId = cards[i];
        if (cardId === undefined) continue;
        counts[cardId] = (counts[cardId] ?? 0) + 1;
      }
    }

    for (const [cardId, count] of Object.entries(counts)) {
      if (count > 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subdecks'],
          message: `Card "${cardId}" appears ${count} times across subdecks (maximum allowed is 3).`,
        });
      }
    }
  },
) as unknown as z.ZodType<DeckPayload>;
