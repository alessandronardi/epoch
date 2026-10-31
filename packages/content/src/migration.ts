import migration from '../../../data/v2/migration.json' with { type: 'json' };
import { DeckPayloadSchema } from '../../../data/schema/deck.schema.js';
import { validateDeck } from '../../engine/src/deck.js';
import type { DeckPayload } from '../../engine/src/view-types.js';
import type { CivilizationId } from '../../../data/versions.js';
import { getCatalog } from './index.js';

/** Pure preview: never writes to storage or mutates the source deck. */
export function migrateLegacyDeck(raw: unknown, civilizationId: CivilizationId) {
  const source = DeckPayloadSchema.parse(raw);
  if ((source.catalogVersion ?? '1.0') !== '1.0') throw new Error('Only v1 decks can be migrated.');
  if (!['feudal', 'norse', 'byzantine'].includes(civilizationId))
    throw new Error('Choose a civilization explicitly.');
  const legacyIssues = validateDeck(source, { ...getCatalog('1.0').rulesById });
  if (legacyIssues.length) throw new Error(`Invalid source deck: ${legacyIssues[0]!.message}`);
  const catalog = getCatalog('2.0').rulesById;
  const renamed: Record<string, string> = migration.renamed;
  const exclusive: Record<string, string> = migration.exclusiveReplacements;
  const changes: Array<{ era: string; index: number; from: string; to: string }> = [];
  const deck: DeckPayload = {
    ...structuredClone(source),
    id: `${source.id ?? 'custom'}-v2-${civilizationId}`,
    schemaVersion: 2,
    rulesetVersion: '2.0',
    catalogVersion: '2.0',
    civilizationId,
  };
  for (const era of ['1', '2', '3'] as const) {
    deck.subdecks[era] = source.subdecks[era].map((from, index) => {
      let to = renamed[from] ?? from;
      if (catalog[to]?.affiliation !== 'common' && catalog[to]?.affiliation !== civilizationId)
        to = exclusive[to] ?? to;
      if (to !== from) changes.push({ era, index, from, to });
      return to;
    });
  }
  return { deck, changes, issues: validateDeck(deck, { ...catalog }) };
}
