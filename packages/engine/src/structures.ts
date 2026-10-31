import type { ActivateMarketCommand, ActivateMarketClientCommand, RuleError } from './commands.js';
import type { GameState, PlayerId } from './types.js';
import type { GameEvent } from './events.js';
import {
  RESOURCE_KEYS,
  getStorageCap,
  spendPlayerResources,
  creditPlayerResources,
} from './economy.js';

export function validateMarket(
  state: Readonly<GameState>,
  cmd: ActivateMarketCommand,
): RuleError | null {
  const player = state.players[cmd.player];
  if (state.rulesetVersion !== '2.0' || state.phase !== 'development')
    return { code: 'INVALID_PHASE', message: 'Mercato disponibile solo nello sviluppo v2.' };
  if (player.passed) return { code: 'ALREADY_PASSED', message: 'Hai già passato.' };
  if (state.toAct !== cmd.player) return { code: 'NOT_YOUR_TURN', message: 'Non è il tuo turno.' };
  const structure = player.structures?.find((c) => c.uid === cmd.structureUid);
  if (
    player.marketUsed ||
    !structure ||
    state.catalog[structure.cardId]?.structureEffect?.kind !== 'market' ||
    cmd.give === cmd.receive ||
    !RESOURCE_KEYS.includes(cmd.give) ||
    !RESOURCE_KEYS.includes(cmd.receive)
  )
    return { code: 'INVALID_PHASE', message: 'Mercato assente, già usato o scambio non valido.' };
  if (player.resources[cmd.give] < 2 || player.resources[cmd.receive] >= getStorageCap(state.era))
    return {
      code: 'INSUFFICIENT_RESOURCES',
      message: 'Servono 2 risorse cedibili e spazio nel magazzino di destinazione.',
    };
  return null;
}

export function legalMarketCommands(
  state: Readonly<GameState>,
  player: PlayerId,
): ActivateMarketClientCommand[] {
  const result: ActivateMarketClientCommand[] = [];
  for (const structure of state.players[player].structures ?? [])
    for (const give of RESOURCE_KEYS)
      for (const receive of RESOURCE_KEYS) {
        const cmd = { type: 'ActivateMarket' as const, structureUid: structure.uid, give, receive };
        if (validateMarket(state, { ...cmd, player }) === null) result.push(cmd);
      }
  return result;
}

/** Caller validates and advances development exactly once. */
export function mutateMarket(
  state: GameState,
  cmd: ActivateMarketCommand,
  events: GameEvent[],
): void {
  const cost = { food: 0, wood: 0, metal: 0 };
  cost[cmd.give] = 2;
  const gain = { food: 0, wood: 0, metal: 0 };
  gain[cmd.receive] = 1;
  spendPlayerResources(state, events, cmd.player, cost);
  creditPlayerResources(state, events, cmd.player, gain, 'market');
  state.players[cmd.player].marketUsed = true;
  events.push({
    n: ++state.counters.event,
    type: 'MarketActivated',
    player: cmd.player,
    structureUid: cmd.structureUid,
    give: cmd.give,
    receive: cmd.receive,
  });
}
