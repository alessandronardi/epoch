import fs from 'node:fs';
import { sha256Hex } from '../packages/engine/src/index.js';

/** Include implementation identity so later bot/rules changes cannot overwrite an iteration. */
export function simulationProvenance(): Record<string, string> {
  const files = ['pnpm-lock.yaml'];
  for (const directory of ['packages/engine/src', 'packages/bots/src', 'packages/sim/src']) {
    files.push(
      ...fs
        .readdirSync(directory)
        .filter((file) => file.endsWith('.ts'))
        .map((file) => `${directory}/${file}`),
    );
  }
  return Object.fromEntries(
    files
      .sort()
      .map((file) => [file, sha256Hex(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))]),
  );
}
