import type { Affiliation } from '../versions.js';
import { z } from 'zod';

export type EraNo = 1 | 2 | 3;

export const EraNoSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const ResourceSchema = z.enum(['food', 'wood', 'metal']);
export type Resource = z.infer<typeof ResourceSchema>;

export const ResourcesSchema = z
  .object({
    food: z.number().int().min(0),
    wood: z.number().int().min(0),
    metal: z.number().int().min(0),
  })
  .strict();
export type Resources = z.infer<typeof ResourcesSchema>;

export const LineSchema = z.enum(['front', 'center', 'rear']);
export type Line = z.infer<typeof LineSchema>;

export const CardTypeSchema = z.enum(['structure', 'economy', 'unit', 'instant', 'conversion']);
export type CardType = z.infer<typeof CardTypeSchema>;

export const UnitCategorySchema = z.enum(['infantry', 'spearman', 'cavalry', 'archer', 'siege']);
export type UnitCategory = z.infer<typeof UnitCategorySchema>;

export const AbilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fury'), amount: z.literal(2) }).strict(),
  z.object({ kind: z.literal('discipline'), amount: z.literal(1) }).strict(),
  z
    .object({
      kind: z.literal('impale'),
      damage: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('volley'),
      bonusVsSpearman: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('flank'),
      bonusVsArcher: z.number().int().min(1),
    })
    .strict(),
]);
export type Ability = z.infer<typeof AbilitySchema>;

export const InstantEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('atk_mod'),
      target: z.enum(['own_archers', 'own_front', 'own_infantry']),
      amount: z.number().int(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('walls_mod'),
      target: z.enum(['own', 'enemy']),
      amount: z.number().int(),
    })
    .strict(),
]);
export type InstantEffect = z.infer<typeof InstantEffectSchema>;

export const ConversionEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('gain_per_building'),
      perBuilding: ResourcesSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('gain_and_dem_bonus'),
      gain: ResourcesSchema,
      demBonus: z.number().int().min(1),
    })
    .strict(),
]);
export type ConversionEffect = z.infer<typeof ConversionEffectSchema>;

export const CardEffectSchema = z.union([InstantEffectSchema, ConversionEffectSchema]);
export type CardEffect = z.infer<typeof CardEffectSchema>;

export interface CardRules {
  affiliation?: Affiliation;
  structureEffect?: { kind: 'market' } | { kind: 'era_walls'; amount: number };
  id: string;
  era: EraNo;
  type: CardType;
  category?: UnitCategory;
  line?: Line;
  cost: Resources;
  atk?: number;
  dem?: number;
  hp?: number;
  isCombatant?: boolean;
  production?: Resources;
  abilities: Ability[];
  effect?: InstantEffect | ConversionEffect;
}

const BaseCardRulesSchema = z
  .object({
    affiliation: z.enum(['common', 'feudal', 'norse', 'byzantine']).optional(),
    structureEffect: z
      .union([
        z.object({ kind: z.literal('market') }).strict(),
        z.object({ kind: z.literal('era_walls'), amount: z.literal(2) }).strict(),
      ])
      .optional(),
    id: z.string().min(1),
    era: EraNoSchema,
    type: CardTypeSchema,
    category: UnitCategorySchema.optional(),
    line: LineSchema.optional(),
    cost: ResourcesSchema,
    atk: z.number().int().min(0).optional(),
    dem: z.number().int().min(0).optional(),
    hp: z.number().int().min(1).optional(),
    isCombatant: z.boolean().optional(),
    production: ResourcesSchema.optional(),
    abilities: z.array(AbilitySchema),
    effect: CardEffectSchema.optional(),
  })
  .strict();

export const CardRulesSchema: z.ZodType<CardRules> = BaseCardRulesSchema.superRefine(
  (card, ctx) => {
    if (
      card.type === 'structure'
        ? card.structureEffect === undefined || card.effect !== undefined
        : card.structureEffect !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['structureEffect'],
        message:
          'Only structures must define a structureEffect, without instant/conversion effects.',
      });
    }
    if (new Set(card.abilities.map((a) => a.kind)).size !== card.abilities.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abilities'],
        message: 'Duplicate abilities are not allowed.',
      });
    if (card.type === 'unit') {
      if (card.category === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['category'],
          message: 'Unit cards must define a category.',
        });
      }
      if (card.line === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['line'],
          message: 'Unit cards must define a deployment line.',
        });
      }
      if (card.atk === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['atk'],
          message: 'Unit cards must define atk.',
        });
      }
      if (card.dem === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dem'],
          message: 'Unit cards must define dem.',
        });
      }
      if (card.hp === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hp'],
          message: 'Unit cards must define hp.',
        });
      }
      if (card.isCombatant === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['isCombatant'],
          message: 'Unit cards must define isCombatant.',
        });
      } else if (card.category === 'siege' && card.isCombatant !== false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['isCombatant'],
          message: 'Siege units must have isCombatant === false.',
        });
      } else if (
        card.category !== undefined &&
        card.category !== 'siege' &&
        card.isCombatant !== true
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['isCombatant'],
          message: 'Non-siege units must have isCombatant === true.',
        });
      }
      if (card.production !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['production'],
          message: 'Unit cards cannot have production.',
        });
      }
      if (card.effect !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effect'],
          message: 'Unit cards cannot have instant/conversion effects.',
        });
      }
    } else {
      if (card.category !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['category'],
          message: 'Only unit cards can define a category.',
        });
      }
      if (card.line !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['line'],
          message: 'Only unit cards can define a deployment line.',
        });
      }
      if (card.atk !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['atk'],
          message: 'Only unit cards can define atk.',
        });
      }
      if (card.dem !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dem'],
          message: 'Only unit cards can define dem.',
        });
      }
      if (card.hp !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hp'],
          message: 'Only unit cards can define hp.',
        });
      }
      if (card.isCombatant !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['isCombatant'],
          message: 'Only unit cards can define isCombatant.',
        });
      }
      if (card.abilities.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['abilities'],
          message: 'Only unit cards can have combat abilities.',
        });
      }
    }

    if (card.type === 'economy') {
      if (card.production === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['production'],
          message: 'Economy cards must define production.',
        });
      }
      if (card.effect !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effect'],
          message: 'Economy cards cannot have instant/conversion effects.',
        });
      }
    } else if (card.production !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['production'],
        message: 'Only economy cards can define production.',
      });
    }

    if (card.type === 'instant') {
      if (
        card.effect === undefined ||
        (card.effect.kind !== 'atk_mod' && card.effect.kind !== 'walls_mod')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effect'],
          message: 'Instant cards must define an InstantEffect (atk_mod or walls_mod).',
        });
      }
    }

    if (card.type === 'conversion') {
      if (
        card.effect === undefined ||
        (card.effect.kind !== 'gain_per_building' && card.effect.kind !== 'gain_and_dem_bonus')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effect'],
          message:
            'Conversion cards must define a ConversionEffect (gain_per_building or gain_and_dem_bonus).',
        });
      }
    }
  },
) as unknown as z.ZodType<CardRules>;

export const CardsRulesFileSchema = z
  .record(z.string().min(1), CardRulesSchema)
  .superRefine((record, ctx) => {
    for (const [key, value] of Object.entries(record)) {
      if (value.id !== key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, 'id'],
          message: `Card id "${value.id}" does not match record key "${key}".`,
        });
      }
    }
  });
export type CardsRulesFile = z.infer<typeof CardsRulesFileSchema>;

export const CardTextSchema = z
  .object({
    name: z.string().min(1).max(24),
    typeLine: z.string().min(1),
    flavor: z.string().min(1).max(120),
  })
  .strict();
export type CardText = z.infer<typeof CardTextSchema>;

export const CardsTextFileSchema = z.record(z.string().min(1), CardTextSchema);
export type CardsTextFile = z.infer<typeof CardsTextFileSchema>;

export const ArtStatusSchema = z.enum(['missing', 'placeholder', 'final']);
export type ArtStatus = z.infer<typeof ArtStatusSchema>;

export const CardArtSchema = z
  .object({
    file: z.string().min(1),
    alt: z
      .object({
        it: z.string().min(20),
      })
      .strict(),
    prompt: z.string().min(1),
    negative: z.string().min(1),
    status: ArtStatusSchema,
    credit: z.string().min(1),
  })
  .strict();
export type CardArt = z.infer<typeof CardArtSchema>;

export const CardsArtFileSchema = z.record(z.string().min(1), CardArtSchema);
export type CardsArtFile = z.infer<typeof CardsArtFileSchema>;
