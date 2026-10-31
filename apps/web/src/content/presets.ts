import type { DeckPayload } from '@epochs/engine';
import { CIVILIZATIONS } from '@epochs/content';
import { CIVILIZATION_PRESETS } from '../../../../packages/content/src/presets.js';
export interface PresetDeckOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: DeckPayload;
}
export const DEFAULT_PLAYER_DECK_ID = 'balanced-tactical-v2';
export const DEFAULT_OPPONENT_DECK_ID = 'aggro-breach-v2';
export const PRESET_DECK_OPTIONS: readonly PresetDeckOption[] = CIVILIZATION_PRESETS.map(
  (payload) => {
    const civ = CIVILIZATIONS[payload.civilizationId!];
    return {
      id: payload.id!,
      name: `${payload.name} · ${civ.name}`,
      description: `${civ.description} Difficoltà: ${civ.difficulty}. Debolezza: ${civ.weakness}`,
      payload,
    };
  },
);
export function presetOption(id: string): PresetDeckOption {
  const option = PRESET_DECK_OPTIONS.find((d) => d.id === id);
  if (!option) throw new Error(`Unknown preset: ${id}`);
  return option;
}
