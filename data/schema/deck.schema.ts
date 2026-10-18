import { z } from 'zod';

const CardIdSchema = z.string().min(1);

const SubdeckCardsSchema = z.array(CardIdSchema).length(20);

export interface DeckSubdecks {
  '1': string[];
  '2': string[];
  '3': string[];
}

export interface DeckPayload {
  id?: string;
  name: string;
  description?: string;
  subdecks: DeckSubdecks;
}

const BaseDeckPayloadSchema = z
  .object({
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

export const DeckPayloadSchema: z.ZodType<DeckPayload> =
  BaseDeckPayloadSchema.superRefine((deck, ctx) => {
    const counts: Record<string, number> = {};

    const eras: Array<['1' | '2' | '3', 1 | 2 | 3]> = [
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ];

    for (const [eraKey, eraNo] of eras) {
      const cards = deck.subdecks[eraKey];
      for (let i = 0; i < cards.length; i++) {
        const cardId = cards[i];
        if (cardId === undefined) continue;
        counts[cardId] = (counts[cardId] ?? 0) + 1;

        const match = /^[euic]([123])_/.exec(cardId);
        if (match !== null && Number(match[1]) !== eraNo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subdecks', eraKey, i],
            message: `Card "${cardId}" does not belong to Era ${eraNo} subdeck.`,
          });
        }
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
  }) as unknown as z.ZodType<DeckPayload>;
