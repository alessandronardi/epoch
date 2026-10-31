import fs from 'node:fs';
import { getCatalog } from '../packages/content/src/index.js';
import { CIVILIZATION_PRESETS } from '../packages/content/src/presets.js';
import { canonicalizeJson, sha256Hex } from '../packages/engine/src/index.js';
import { runSimulation, type SimulationReport } from '../packages/sim/src/index.js';
import { simulationProvenance } from './simulation-provenance.js';
const catalog = getCatalog('2.0').rulesById;
const provenance = simulationProvenance();
const iteration = sha256Hex(
  canonicalizeJson({ catalog, decks: CIVILIZATION_PRESETS, provenance }),
).slice(0, 12);
const dir = `docs/balance/2.0/calibration-${iteration}`;
fs.mkdirSync(dir, { recursive: true });
const summaries: Array<{
  file: string;
  bot: string;
  pair: number[];
  seed: string;
  games: number;
  score: SimulationReport['expansion'];
  drawRate: number;
}> = [];
for (const bot of ['greedy', 'rational'] as const)
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const)
    for (let master = 1; master <= 5; master++) {
      const seed = `expansion-calibration-${master}`;
      const report = await runSimulation({
        deckA: CIVILIZATION_PRESETS[a]!,
        deckB: CIVILIZATION_PRESETS[b]!,
        botA: bot,
        botB: bot,
        games: 200,
        seed,
        workers: 1,
        catalog,
      });
      const file = `${bot}-${a}-${b}-${master}.json`;
      fs.writeFileSync(`${dir}/${file}`, JSON.stringify(report, null, 2) + '\n');
      summaries.push({
        file,
        bot,
        pair: [a, b],
        seed,
        games: 200,
        score: report.expansion,
        drawRate: report.outcomes.rates.draw,
      });
      console.log(
        `${bot} ${a}/${b} seed ${master}: score ${report.expansion.A.overall.score}, draws ${report.outcomes.rates.draw}`,
      );
    }
for (let a = 0; a < 3; a++) {
  const report = await runSimulation({
    deckA: CIVILIZATION_PRESETS[a]!,
    deckB: CIVILIZATION_PRESETS[a]!,
    botA: 'rational',
    botB: 'rational',
    games: 200,
    seed: `expansion-mirror-${a}`,
    workers: 1,
    catalog,
  });
  fs.writeFileSync(`${dir}/mirror-${a}.json`, JSON.stringify(report, null, 2) + '\n');
}
// Cross-strategy controls in both assignments, kept separate from calibration scores.
for (const [a, b] of [
  [0, 1],
  [0, 2],
  [1, 2],
] as const)
  for (const [botA, botB] of [
    ['greedy', 'rational'],
    ['rational', 'greedy'],
  ] as const) {
    const report = await runSimulation({
      deckA: CIVILIZATION_PRESETS[a]!,
      deckB: CIVILIZATION_PRESETS[b]!,
      botA,
      botB,
      games: 100,
      seed: `expansion-cross-${a}-${b}`,
      workers: 1,
      catalog,
    });
    fs.writeFileSync(`${dir}/cross-${a}-${b}-${botA}.json`, JSON.stringify(report, null, 2) + '\n');
  }
fs.writeFileSync(
  `${dir}/inputs.json`,
  JSON.stringify(
    {
      iteration,
      provenance,
      rulesetVersion: '2.0',
      catalogVersion: '2.0',
      catalog,
      decks: CIVILIZATION_PRESETS,
      seedDerivation: 'masterSeed:gameIndex (see deriveGameSeed)',
      scoreInterval:
        'Normal 95% interval from sample variance of scores 0, 0.5, 1; per seed and seat.',
      summaries,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Saved 6000 calibration + 600 mirror + 600 cross-strategy games in ${dir}`);
