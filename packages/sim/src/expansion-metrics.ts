import type { Command, GameEvent, GameState, PlayerId, Resources } from '../../engine/src/index.js';
import { getLogisticsCap, legalCommands } from '../../engine/src/index.js';
import type { GameMetricsRecord } from './worker.js';

export interface DevelopmentMetrics {
  produced: Resources;
  spent: Resources;
  overflow: Resources;
  slots: { economy: number; structure: number; unit: number };
  organization: number;
  market: number;
  engineering: number;
  cistern: number;
  fury: number;
  discipline: number;
  resourceBlockedPasses: number;
}
export function emptyDevelopmentMetrics(): DevelopmentMetrics {
  return {
    produced: { food: 0, wood: 0, metal: 0 },
    spent: { food: 0, wood: 0, metal: 0 },
    overflow: { food: 0, wood: 0, metal: 0 },
    slots: { economy: 0, structure: 0, unit: 0 },
    organization: 0,
    market: 0,
    engineering: 0,
    cistern: 0,
    fury: 0,
    discipline: 0,
    resourceBlockedPasses: 0,
  };
}
export function collectDevelopmentMetrics(
  metrics: Record<PlayerId, DevelopmentMetrics>,
  events: readonly GameEvent[],
  before: GameState,
  command?: Command,
): void {
  if (
    command?.type === 'Pass' &&
    before.players[command.player].slotsUsed < getLogisticsCap(before.era)
  ) {
    const legal = legalCommands(before, command.player);
    if (
      legal.playableFieldCardUids.length === 0 &&
      legal.playableConversionUids.length === 0 &&
      !legal.marketCommands?.length &&
      Object.values(legal.handPlayability).some((p) => p.reason === 'insufficient_resources')
    )
      metrics[command.player].resourceBlockedPasses++;
  }
  if (command?.type === 'PlayCard') {
    const player = before.players[command.player];
    const instance = player.hand.find((c) => c.uid === command.cardUid);
    const card = instance ? before.catalog[instance.cardId] : undefined;
    if (
      card?.type === 'unit' &&
      before.rulesetVersion === '2.0' &&
      player.civilizationId === 'feudal' &&
      !player.organizationUsed
    ) {
      metrics[command.player].organization++;
    }
  }
  for (const event of events) {
    if (event.type === 'ResourcesChanged') {
      for (const r of ['food', 'wood', 'metal'] as const) {
        if (event.reason === 'cost') metrics[event.player].spent[r] -= event.delta[r];
        if (event.reason === 'harvest' || event.reason === 'rent')
          metrics[event.player].produced[r] += event.delta[r];
      }
    } else if (event.type === 'ResourcesOverflowed') {
      for (const r of ['food', 'wood', 'metal'] as const) {
        metrics[event.player].overflow[r] += event.overflow[r];
        if (event.reason === 'harvest' || event.reason === 'rent')
          metrics[event.player].produced[r] += event.overflow[r];
      }
    } else if (event.type === 'CardPlayed' && event.cardType)
      metrics[event.player].slots[event.cardType]++;
    else if (event.type === 'MarketActivated') metrics[event.player].market++;
    else if (event.type === 'EraStarted' && before.rulesetVersion === '2.0') {
      for (const p of ['P1', 'P2'] as const) {
        if (before.players[p].civilizationId === 'byzantine') metrics[p].engineering++;
        if (
          (before.players[p].structures ?? []).some(
            (c) => before.catalog[c.cardId]?.structureEffect?.kind === 'era_walls',
          )
        )
          metrics[p].cistern++;
      }
    } else if (event.type === 'BattlePhaseResolved')
      for (const p of ['P1', 'P2'] as const)
        for (const c of event.contributions?.[p] ?? []) {
          if (c.furyBonus) metrics[p].fury++;
          if (c.disciplineBonus) metrics[p].discipline++;
        }
  }
}

/** Normal approximation using the sample variance of the actual 0 / 0.5 / 1 scores. */
export function scoreInterval(scores: readonly number[]) {
  const n = scores.length;
  if (n === 0) return { games: 0, score: null, ci95: null };
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { games: n, score: mean, ci95: [0, 1] };
  const variance = scores.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  const half = 1.96 * Math.sqrt(variance / n);
  return { games: n, score: mean, ci95: [Math.max(0, mean - half), Math.min(1, mean + half)] };
}
export function summarizeExpansion(records: readonly GameMetricsRecord[]) {
  const summaries = {} as Record<
    'A' | 'B',
    {
      overall: ReturnType<typeof scoreInterval>;
      asP1: ReturnType<typeof scoreInterval>;
      asP2: ReturnType<typeof scoreInterval>;
      development: DevelopmentMetrics;
    }
  >;
  for (const competitor of ['A', 'B'] as const) {
    const score = (r: GameMetricsRecord) =>
      r.winnerCompetitor === 'DRAW' ? 0.5 : r.winnerCompetitor === competitor ? 1 : 0;
    const seat = (r: GameMetricsRecord) => (competitor === 'A' ? r.aSeat : r.bSeat);
    const total = emptyDevelopmentMetrics();
    for (const record of records) {
      const metric = record.development?.[seat(record)];
      if (!metric) continue;
      for (const k of ['produced', 'spent', 'overflow'] as const)
        for (const r of ['food', 'wood', 'metal'] as const) total[k][r] += metric[k][r];
      for (const t of ['economy', 'structure', 'unit'] as const) total.slots[t] += metric.slots[t];
      for (const k of [
        'organization',
        'market',
        'engineering',
        'cistern',
        'fury',
        'discipline',
        'resourceBlockedPasses',
      ] as const)
        total[k] += metric[k];
    }
    summaries[competitor] = {
      overall: scoreInterval(records.map(score)),
      asP1: scoreInterval(records.filter((r) => seat(r) === 'P1').map(score)),
      asP2: scoreInterval(records.filter((r) => seat(r) === 'P2').map(score)),
      development: total,
    };
  }
  return summaries;
}
