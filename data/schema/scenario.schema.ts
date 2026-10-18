import { z } from 'zod';
import { EraNoSchema, ResourcesSchema } from './cards.schema';

export const PlayerIdSchema = z.enum(['P1', 'P2']);
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const BattleOutcomeKindSchema = z.enum([
  'winner',
  'mutual_annihilation',
  'stalemate',
]);
export type BattleOutcomeKind = z.infer<typeof BattleOutcomeKindSchema>;

export const ScenarioPlayerSetupSchema = z
  .object({
    units: z.array(z.string().min(1)).default([]),
    buildings: z.array(z.string().min(1)).optional(),
    hand: z.array(z.string().min(1)).optional(),
    resources: ResourcesSchema.optional(),
    walls: z.number().int().min(0),
    cityDamage: z.number().int().min(0).default(0),
    demBonus: z.number().int().min(0).optional(),
  })
  .strict();
export type ScenarioPlayerSetup = z.infer<typeof ScenarioPlayerSetupSchema>;

export const ScenarioExpectSchema = z
  .object({
    outcome: BattleOutcomeKindSchema,
    winner: PlayerIdSchema.nullable(),
    survivors: z
      .object({
        P1: z.array(z.string().min(1)),
        P2: z.array(z.string().min(1)),
      })
      .strict(),
    wallsAfter: z
      .object({
        P1: z.number().int().min(0),
        P2: z.number().int().min(0),
      })
      .strict(),
    cityDamageAfter: z
      .object({
        P1: z.number().int().min(0),
        P2: z.number().int().min(0),
      })
      .strict(),
    resourcesAfter: z
      .object({
        P1: ResourcesSchema,
        P2: ResourcesSchema,
      })
      .strict()
      .optional(),
    breach: z.boolean().optional(),
    gameEnded: z
      .object({
        kind: z.enum(['annihilation', 'points', 'draw', 'concession', 'timeout']),
        winner: z.union([PlayerIdSchema, z.literal('DRAW')]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ScenarioExpect = z.infer<typeof ScenarioExpectSchema>;

export const ScenarioPayloadSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    era: EraNoSchema,
    initiative: PlayerIdSchema,
    setup: z
      .object({
        P1: ScenarioPlayerSetupSchema,
        P2: ScenarioPlayerSetupSchema,
      })
      .strict(),
    instants: z
      .object({
        P1: z.array(z.string().min(1)),
        P2: z.array(z.string().min(1)),
      })
      .strict(),
    expect: ScenarioExpectSchema,
  })
  .strict();
export type ScenarioPayload = z.infer<typeof ScenarioPayloadSchema>;

export const ScenariosFileSchema = z.union([
  ScenarioPayloadSchema,
  z.array(ScenarioPayloadSchema).min(1),
]);
export type ScenariosFile = z.infer<typeof ScenariosFileSchema>;
