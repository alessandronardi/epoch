import balancedV1 from '../../../data/decks/balanced-tactical.json' with { type: 'json' };
import aggroV1 from '../../../data/decks/aggro-breach.json' with { type: 'json' };
import boomV1 from '../../../data/decks/boom-economy.json' with { type: 'json' };
import balancedV2 from '../../../data/v2/decks/balanced-tactical.json' with { type: 'json' };
import aggroV2 from '../../../data/v2/decks/aggro-breach.json' with { type: 'json' };
import boomV2 from '../../../data/v2/decks/boom-economy.json' with { type: 'json' };
import { DeckPayloadSchema } from '../../../data/schema/deck.schema.js';
import type { ContentVersion } from '../../../data/versions.js';
export const LEGACY_PRESETS = [balancedV1, aggroV1, boomV1].map((d) => DeckPayloadSchema.parse(d));
export const CIVILIZATION_PRESETS = [balancedV2, aggroV2, boomV2].map((d) =>
  DeckPayloadSchema.parse(d),
);
export function getPreset(id: string, version: ContentVersion) {
  const preset = (version === '2.0' ? CIVILIZATION_PRESETS : LEGACY_PRESETS).find(
    (d) => d.id === id,
  );
  if (!preset) throw new Error(`Unknown preset ${id} for version ${version}`);
  return structuredClone(preset);
}
