import fs from 'node:fs';
import path from 'node:path';
import type { SimulationReport } from '../packages/sim/src/index.js';
import { scoreInterval } from '../packages/sim/src/expansion-metrics.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: tsx tools/expansion-summary.ts <calibration-directory>');
const input = JSON.parse(fs.readFileSync(path.join(directory, 'inputs.json'), 'utf8')) as {
  summaries: { file: string; bot: string; pair: number[]; seed: string }[];
};
const groups = new Map<string, SimulationReport[]>();
for (const entry of input.summaries) {
  const key = `${entry.bot}-${entry.pair.join('-')}`;
  groups.set(key, [
    ...(groups.get(key) ?? []),
    JSON.parse(fs.readFileSync(path.join(directory, entry.file), 'utf8')) as SimulationReport,
  ]);
}
const summary = Object.fromEntries(
  [...groups].map(([key, reports]) => {
    const games = reports.reduce((n, report) => n + report.games, 0);
    const scores = reports.flatMap((report) => [
      ...Array<number>(report.byCompetitor.A.wins).fill(1),
      ...Array<number>(report.byCompetitor.A.draws).fill(0.5),
      ...Array<number>(report.byCompetitor.A.losses).fill(0),
    ]);
    const drawRate = reports.reduce((n, report) => n + report.outcomes.draw, 0) / games;
    const overall = scoreInterval(scores);
    const asP1 =
      reports.reduce((n, report) => n + report.expansion.A.asP1.score!, 0) / reports.length;
    const asP2 =
      reports.reduce((n, report) => n + report.expansion.A.asP2.score!, 0) / reports.length;
    return [
      key,
      {
        ...overall,
        drawRate,
        asP1,
        asP2,
        seatGap: Math.abs(asP1 - asP2),
        desiredScore: overall.score! >= 0.45 && overall.score! <= 0.55,
        hardScore: overall.score! >= 0.4 && overall.score! <= 0.6,
        desiredDrawRate: drawRate <= 0.2,
        perSeed: reports.map((report) => ({
          seed: report.seed,
          ...report.expansion.A.overall,
          drawRate: report.outcomes.rates.draw,
        })),
      },
    ];
  }),
);
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
