import type { CardRules, GameState, PlayerState, Resources } from './types.js';
import type { ContentVersion } from '../../../data/versions.js';

export function effectiveCardCost(
  card: Readonly<CardRules>,
  player: Pick<PlayerState, 'civilizationId' | 'organizationUsed'>,
  version: ContentVersion = '1.0',
): Resources {
  const discount =
    version === '2.0' &&
    player.civilizationId === 'feudal' &&
    !player.organizationUsed &&
    card.type === 'unit';
  return { ...card.cost, food: Math.max(0, card.cost.food - (discount ? 1 : 0)) };
}

export function eraWallsBonus(state: Readonly<GameState>, player: Readonly<PlayerState>): number {
  if (state.rulesetVersion !== '2.0') return 0;
  const civilization = player.civilizationId === 'byzantine' ? 2 : 0;
  const cistern = player.structures?.some(
    (c) => state.catalog[c.cardId]?.structureEffect?.kind === 'era_walls',
  )
    ? 2
    : 0;
  return civilization + cistern;
}
