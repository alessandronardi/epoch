import { z } from 'zod';
import v1 from '../data/catalog.v1.manifest.json' with { type: 'json' };
import v2 from '../data/v2/catalog.manifest.json' with { type: 'json' };
import type { CardRules } from '../data/schema/cards.schema.js';
import type { ContentVersion } from '../data/versions.js';

const CountsSchema = z
  .object({
    '1': z.number().int().nonnegative(),
    '2': z.number().int().nonnegative(),
    '3': z.number().int().nonnegative(),
  })
  .strict();
export const CatalogManifestSchema = z
  .object({
    version: z.enum(['1.0', '2.0']),
    total: z.number().int().positive(),
    byEra: CountsSchema,
    byAffiliation: z
      .object({
        common: z.number().int().nonnegative(),
        feudal: z.number().int().nonnegative(),
        norse: z.number().int().nonnegative(),
        byzantine: z.number().int().nonnegative(),
      })
      .strict(),
    ids: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (
      new Set(m.ids).size !== m.total ||
      m.ids.length !== m.total ||
      Object.values(m.byEra).reduce((a, b) => a + b, 0) !== m.total ||
      Object.values(m.byAffiliation).reduce((a, b) => a + b, 0) !== m.total
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Manifest totals or duplicate IDs are inconsistent.',
      });
  });
export const CATALOG_MANIFESTS = {
  '1.0': CatalogManifestSchema.parse(v1),
  '2.0': CatalogManifestSchema.parse(v2),
};
export function assertCatalogManifest(
  catalog: Record<string, CardRules>,
  version: ContentVersion,
): void {
  const manifest = CATALOG_MANIFESTS[version];
  const ids = Object.keys(catalog).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...manifest.ids].sort()))
    throw new Error(
      `Catalog ${version}: expected exactly ${manifest.total} cards with manifest IDs.`,
    );
  for (const era of [1, 2, 3] as const) {
    if (Object.values(catalog).filter((c) => c.era === era).length !== manifest.byEra[era])
      throw new Error(`Catalog ${version}: wrong Era ${era} count.`);
  }
  for (const affiliation of ['common', 'feudal', 'norse', 'byzantine'] as const) {
    if (
      Object.values(catalog).filter((c) => (c.affiliation ?? 'common') === affiliation).length !==
      manifest.byAffiliation[affiliation]
    )
      throw new Error(`Catalog ${version}: wrong ${affiliation} count.`);
  }
}
