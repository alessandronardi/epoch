// TECH-SPEC §7.1 — Esportazione pubblica del package @epochs/bots (interfaccia Bot, RandomBot, GreedyBot, RationalBot).

import {
  DEFAULT_RANDOM_BOT_PASS_PROBABILITY,
  RandomBot,
  clampUnitRandom,
  enumeratePlayableDevelopmentMoves,
  enumeratePlayableInstantSubsets,
  pickRandomElement,
  pickRandomInt,
  sampleDistinct,
  type Bot,
  type RandomBotOptions,
} from './random-bot.js';
import {
  DEFAULT_BOT_CATALOG,
  GreedyBot,
  RationalBot,
  calculateTotalDemForView,
  calculateUnitEfficiency,
  predictsEnemyBreach,
  type BotKind,
  type GreedyBotOptions,
  type RationalBotOptions,
} from './greedy-bot.js';

export {
  DEFAULT_BOT_CATALOG,
  DEFAULT_RANDOM_BOT_PASS_PROBABILITY,
  GreedyBot,
  RandomBot,
  RationalBot,
  calculateTotalDemForView,
  calculateUnitEfficiency,
  clampUnitRandom,
  enumeratePlayableDevelopmentMoves,
  enumeratePlayableInstantSubsets,
  pickRandomElement,
  pickRandomInt,
  predictsEnemyBreach,
  sampleDistinct,
  type Bot,
  type BotKind,
  type GreedyBotOptions,
  type RandomBotOptions,
  type RationalBotOptions,
};

export interface CreateBotOptions extends RandomBotOptions, GreedyBotOptions {}

/**
 * Factory per istanziare uno dei tre bot ufficiali (`random`, `greedy`, `rational`).
 */
export function createBot(
  kind: BotKind,
  options: CreateBotOptions = {},
): Bot {
  switch (kind) {
    case 'random':
      return new RandomBot(options);
    case 'greedy':
      return new GreedyBot(options);
    case 'rational':
      return new RationalBot(options);
  }
}
