import fs from 'node:fs';
import { getCatalog } from '../packages/content/src/index.js';
import { LEGACY_PRESETS, CIVILIZATION_PRESETS } from '../packages/content/src/presets.js';
import { runSimulation } from '../packages/sim/src/index.js';
const version = process.argv.includes('--v2') ? '2.0' : '1.0';
const decks = version === '2.0' ? CIVILIZATION_PRESETS : LEGACY_PRESETS;
const internal = process.argv.includes('--internal');
const seed = `expansion-${version}-${internal ? 'internal' : 'full'}-2026-10-30`;
const games = Number(process.argv.find((a) => a.startsWith('--games='))?.split('=')[1] ?? 100);
const bot = process.argv.includes('--rational')
  ? 'rational'
  : process.argv.includes('--random')
    ? 'random'
    : 'greedy';
const dir = `docs/balance/${version}/${internal ? 'internal' : bot}`;
fs.mkdirSync(dir, { recursive: true });
for (const [a, b] of [
  [0, 1],
  [0, 2],
  [1, 2],
] as const) {
  const pair = [structuredClone(decks[a]!), structuredClone(decks[b]!)];
  if (internal)
    for (const deck of pair)
      deck.subdecks['2'] = deck.subdecks['2'].map((id) =>
        id === 'f2_market' ? 'e2_saw' : id === 'b2_cistern' ? 'e2_mill' : id,
      );
  const report = await runSimulation({
    deckA: pair[0]!,
    deckB: pair[1]!,
    botA: bot,
    botB: bot,
    games,
    seed,
    workers: 1,
    catalog: { ...getCatalog(version).rulesById },
  });
  fs.writeFileSync(
    `${dir}/${a}-${b}.json`,
    JSON.stringify({ version, seed, bot, games, decks: pair, report }, null, 2) + '\n',
  );
  console.log(`${version} ${bot} ${a}/${b}: ${games} games completed`);
}
