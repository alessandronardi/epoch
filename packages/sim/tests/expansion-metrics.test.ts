import { describe, expect, it } from 'vitest';
import { scoreInterval } from '../src/expansion-metrics.js';
import { simulateGame } from '../src/worker.js';
import { getCatalog } from '../../content/src/index.js';
import { CIVILIZATION_PRESETS } from '../../content/src/presets.js';
describe('Expansion metrics', () => {
  it('computes score and uncertainty using draws as half points', () => {
    const x = scoreInterval([1, 1, 0.5, 0]);
    expect(x.score).toBe(0.625);
    expect(x.ci95![0]).toBeLessThan(0.625);
    expect(x.ci95![1]).toBeGreaterThan(0.625);
    expect(scoreInterval([]).score).toBeNull();
  });
  it('collects production, spending, slots and bonus activations reproducibly', () => {
    const options = {
      masterSeed: 'metrics',
      gameIndex: 0,
      deckA: CIVILIZATION_PRESETS[0]!,
      deckB: CIVILIZATION_PRESETS[2]!,
      botA: 'greedy' as const,
      botB: 'greedy' as const,
      catalog: getCatalog('2.0').rulesById,
    };
    const game = simulateGame(options);
    expect(game).toEqual(simulateGame(options));
    expect(game.development!.P1.produced.food).toBeGreaterThan(0);
    expect(game.development!.P1.spent.food).toBeGreaterThan(0);
    expect(game.development!.P1.slots.unit).toBeGreaterThan(0);
    expect(game.development!.P2.engineering).toBe(game.finalEra);
  });
});
