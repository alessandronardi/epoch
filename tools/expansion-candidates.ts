/** Isolated copy-count experiments. Never modifies the shipped presets. */
import fs from 'node:fs';
import { getCatalog } from '../packages/content/src/index.js';
import { CIVILIZATION_PRESETS } from '../packages/content/src/presets.js';
import {
  canonicalizeJson,
  sha256Hex,
  validateDeck,
  type DeckPayload,
} from '../packages/engine/src/index.js';
import { runSimulation } from '../packages/sim/src/index.js';

const catalog = getCatalog('2.0').rulesById;
function replace(deck: DeckPayload, era: '1' | '2' | '3', from: string, to: string): void {
  const index = deck.subdecks[era].indexOf(from);
  if (index < 0) throw new Error(`Missing ${from}`);
  deck.subdecks[era][index] = to;
}
for (const experiment of ['norse-economy', 'siege-access'] as const) {
  const decks = structuredClone(CIVILIZATION_PRESETS);
  if (experiment === 'norse-economy') {
    replace(decks[1]!, '1', 'u1_inf_l', 'n1_longhouse');
    replace(decks[1]!, '1', 'n1_raider', 'e1_lumb');
    replace(decks[1]!, '2', 'u2_inf_l', 'n2_landing');
  } else {
    // Preserve every category; trade redundant combat copies for available siege.
    for (const deck of decks) {
      const duplicate = (era: '1' | '2' | '3') =>
        deck.subdecks[era].find(
          (id) =>
            catalog[id]?.type === 'unit' &&
            catalog[id]?.category !== 'siege' &&
            deck.subdecks[era].filter((other) => other === id).length > 1,
        )!;
      replace(deck, '1', duplicate('1'), 'u1_sig_h');
      replace(deck, '2', duplicate('2'), 'u2_sig_h');
      replace(deck, '3', duplicate('3'), 'u3_ram');
    }
  }
  for (const deck of decks) {
    const issues = validateDeck(deck, catalog);
    if (issues.length) throw new Error(JSON.stringify(issues));
  }
  const iteration = sha256Hex(canonicalizeJson({ catalog, decks })).slice(0, 12);
  const dir = `docs/balance/2.0/experiment-${experiment}-${iteration}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    `${dir}/inputs.json`,
    JSON.stringify(
      {
        experiment,
        iteration,
        family: 'copies',
        catalog,
        decks,
        comparison: 'calibration-01e581b903b4',
        hypothesis:
          experiment === 'norse-economy'
            ? 'Extra Norse food/wood production reduces resource-blocked passes and the Byzantine advantage.'
            : 'More siege draws reduce games with a field winner but zero city damage.',
      },
      null,
      2,
    ) + '\n',
  );
  for (const bot of ['greedy', 'rational'] as const) {
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const report = await runSimulation({
        deckA: decks[a]!,
        deckB: decks[b]!,
        botA: bot,
        botB: bot,
        games: 100,
        seed: 'expansion-calibration-1',
        workers: 1,
        catalog,
      });
      fs.writeFileSync(`${dir}/${bot}-${a}-${b}.json`, JSON.stringify(report, null, 2) + '\n');
      console.log(
        `${experiment} ${bot} ${a}/${b}: score ${report.expansion.A.overall.score}, draws ${report.outcomes.rates.draw}`,
      );
    }
  }
}
