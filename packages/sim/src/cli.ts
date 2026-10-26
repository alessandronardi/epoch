// TECH-SPEC §7.2 — Interfaccia CLI per il simulatore headless @epochs/sim.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BotKind } from '../../bots/src/index.js';
import type { DeckPayload } from '../../engine/src/index.js';
import { DeckPayloadSchema } from '../../../data/schema/deck.schema.js';
import {
  formatReportAsCsv,
  runSimulation,
  type SimulationReport,
} from './index.js';

export interface ParsedCliArgs {
  readonly deckA: string;
  readonly deckB: string;
  readonly botA: BotKind;
  readonly botB: BotKind;
  readonly games: number;
  readonly seed: string;
  readonly workers: number;
  readonly out?: string;
}

const VALID_BOT_KINDS: ReadonlySet<string> = new Set([
  'random',
  'greedy',
  'rational',
]);

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '..', '..', '..');

function parseBotKind(value: string, flagName: string): BotKind {
  const normalized = value.trim().toLowerCase();
  if (!VALID_BOT_KINDS.has(normalized)) {
    throw new Error(
      `Invalid value "${value}" for ${flagName}: expected "random", "greedy", or "rational".`,
    );
  }
  return normalized as BotKind;
}

function parsePositiveInt(
  value: string,
  flagName: string,
  allowZero = false,
): number {
  const parsed = Number(value);
  const minVal = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minVal) {
    throw new Error(
      `Invalid value "${value}" for ${flagName}: expected an integer >= ${minVal}.`,
    );
  }
  return parsed;
}

/**
 * Effettua il parsing degli argomenti CLI di `@epochs/sim` (`--deckA`, `--deckB`, `--botA`, `--botB`, `--games`, `--seed`, `--workers`, `--out`).
 */
export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let deckA = 'data/decks/aggro-breach.json';
  let deckB = 'data/decks/boom-economy.json';
  let botA: BotKind = 'greedy';
  let botB: BotKind = 'greedy';
  let games = 100;
  let seed = 'epochs-v1';
  let workers = 4;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      continue;
    }

    const nextValue = (): string => {
      const val = argv[++i];
      if (val === undefined || val.startsWith('--')) {
        throw new Error(`Missing value for CLI flag ${arg}.`);
      }
      return val;
    };

    switch (arg) {
      case '--deckA':
        deckA = nextValue();
        break;
      case '--deckB':
        deckB = nextValue();
        break;
      case '--botA':
        botA = parseBotKind(nextValue(), '--botA');
        break;
      case '--botB':
        botB = parseBotKind(nextValue(), '--botB');
        break;
      case '--games':
        games = parsePositiveInt(nextValue(), '--games', true);
        break;
      case '--seed':
        seed = nextValue();
        break;
      case '--workers':
        workers = parsePositiveInt(nextValue(), '--workers', false);
        break;
      case '--out':
        out = nextValue();
        break;
      default:
        throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return {
    deckA,
    deckB,
    botA,
    botB,
    games,
    seed,
    workers,
    ...(out !== undefined ? { out } : {}),
  };
}

/**
 * Risolve un percorso file cercando prima rispetto a `process.cwd()` e poi rispetto alla radice del monorepo.
 */
export function resolveSimPath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const fromCwd = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(REPO_ROOT, filePath);
}

/**
 * Carica e valida con Zod un file mazzo JSON.
 */
export function loadDeckFromFile(filePath: string): DeckPayload {
  const resolved = resolveSimPath(filePath);
  const rawContent = fs.readFileSync(resolved, 'utf8');
  const parsed = DeckPayloadSchema.parse(JSON.parse(rawContent));
  return parsed as unknown as DeckPayload;
}

/**
 * Esegue la CLI completa di simulazione restituendo il `SimulationReport` e scrivendo opzionalmente il file di output.
 */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<SimulationReport> {
  const args = parseCliArgs(argv);
  const deckAPayload = loadDeckFromFile(args.deckA);
  const deckBPayload = loadDeckFromFile(args.deckB);

  const report = await runSimulation({
    deckA: deckAPayload,
    deckB: deckBPayload,
    botA: args.botA,
    botB: args.botB,
    games: args.games,
    seed: args.seed,
    workers: args.workers,
  });

  if (args.out !== undefined) {
    const outPath = path.isAbsolute(args.out)
      ? args.out
      : path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (outPath.toLowerCase().endsWith('.csv')) {
      fs.writeFileSync(outPath, formatReportAsCsv(report), 'utf8');
    } else {
      fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
  }

  return report;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runCli()
    .then((report) => {
      console.log(
        `[sim] Completed ${report.games} games (seed="${report.seed}", hash=${report.reportHash}): A(${report.deckA.id}/${report.deckA.bot}) winRate=${report.byCompetitor.A.winRate} vs B(${report.deckB.id}/${report.deckB.bot}) winRate=${report.byCompetitor.B.winRate}`,
      );
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sim] Error: ${msg}`);
      process.exitCode = 1;
    });
}
