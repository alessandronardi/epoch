import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CardsRulesFileSchema,
  type CardRules,
  type CardType,
  type EraNo,
  type Line,
  type Resources,
  type UnitCategory,
} from '../data/schema/cards.schema.js';
import { CARD_EFFECTS_MAP, getCardEffectMapping } from './card-effects.js';

const ROOT_DIR = process.cwd();
const GDD_PATH = path.join(ROOT_DIR, 'docs', 'GDD.md');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'cards.rules.json');

function resolveTypeAndCategory(rawTypeCat: string): {
  type: CardType;
  category?: UnitCategory;
} {
  switch (rawTypeCat) {
    case 'Economia':
      return { type: 'economy' };
    case 'Istantanea':
      return { type: 'instant' };
    case 'Riconversione':
      return { type: 'conversion' };
    case 'Fanteria':
      return { type: 'unit', category: 'infantry' };
    case 'Lanciere':
      return { type: 'unit', category: 'spearman' };
    case 'Cavalleria':
      return { type: 'unit', category: 'cavalry' };
    case 'Arciere':
      return { type: 'unit', category: 'archer' };
    case 'Assedio':
      return { type: 'unit', category: 'siege' };
    default:
      throw new Error(`Unknown "Tipo / Cat." value in GDD: "${rawTypeCat}"`);
  }
}

function resolveLine(rawLine: string): Line | undefined {
  switch (rawLine) {
    case '—':
      return undefined;
    case 'Fronte':
      return 'front';
    case 'Centro':
      return 'center';
    case 'Retro':
      return 'rear';
    default:
      throw new Error(`Unknown "Linea" value in GDD: "${rawLine}"`);
  }
}

function parseCost(rawCost: string, cardId: string): Resources {
  const match = /^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/.exec(rawCost.trim());
  if (!match) {
    throw new Error(`Invalid cost format for card "${cardId}": "${rawCost}"`);
  }
  return {
    food: Number.parseInt(match[1]!, 10),
    wood: Number.parseInt(match[2]!, 10),
    metal: Number.parseInt(match[3]!, 10),
  };
}

function parseOptionalInt(
  rawVal: string,
  field: string,
  cardId: string,
): number | undefined {
  const trimmed = rawVal.trim();
  if (trimmed === '—') {
    return undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid integer value for ${field} on card "${cardId}": "${rawVal}"`,
    );
  }
  return Number.parseInt(trimmed, 10);
}

export function parseGddCatalog(
  gddMarkdown: string,
): Record<string, CardRules> {
  const sectionIdx = gddMarkdown.indexOf('## 7. Catalogo Carte Ufficiale');
  if (sectionIdx === -1) {
    throw new Error('Could not find "## 7. Catalogo Carte Ufficiale" in GDD.');
  }

  const lines = gddMarkdown.slice(sectionIdx).split(/\r?\n/);
  let currentEra: EraNo | null = null;

  const rawMap: Record<string, CardRules> = {};
  const countByEra: Record<EraNo, number> = { 1: 0, 2: 0, 3: 0 };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('### Era I')) {
      if (line === '### Era III') {
        currentEra = 3;
      } else if (line === '### Era II') {
        currentEra = 2;
      } else if (line === '### Era I') {
        currentEra = 1;
      }
      continue;
    }

    if (!line.startsWith('|') || currentEra === null) {
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length < 9) {
      continue;
    }

    const firstCell = cells[0]!;
    if (firstCell === 'ID' || firstCell.startsWith(':---')) {
      continue;
    }

    const id = firstCell.replace(/^`|`$/g, '').trim();
    if (!id) {
      throw new Error(`Empty card ID in row: ${line}`);
    }
    if (rawMap[id]) {
      throw new Error(`Duplicate card ID found in GDD: "${id}"`);
    }

    const typeCatCell = cells[2]!;
    const lineCell = cells[3]!;
    const costCell = cells[4]!;
    const atkCell = cells[5]!;
    const demCell = cells[6]!;
    const hpCell = cells[7]!;

    const { type, category } = resolveTypeAndCategory(typeCatCell);
    const deployLine = resolveLine(lineCell);
    const cost = parseCost(costCell, id);
    const atk = parseOptionalInt(atkCell, 'ATK', id);
    const dem = parseOptionalInt(demCell, 'DEM', id);
    const hp = parseOptionalInt(hpCell, 'HP', id);
    const isCombatant = type === 'unit' ? category !== 'siege' : undefined;

    const effectMapping = getCardEffectMapping(id);

    const card: CardRules = {
      id,
      era: currentEra,
      type,
      ...(category !== undefined ? { category } : {}),
      ...(deployLine !== undefined ? { line: deployLine } : {}),
      cost,
      ...(atk !== undefined ? { atk } : {}),
      ...(dem !== undefined ? { dem } : {}),
      ...(hp !== undefined ? { hp } : {}),
      ...(isCombatant !== undefined ? { isCombatant } : {}),
      ...(effectMapping.production !== undefined
        ? { production: effectMapping.production }
        : {}),
      abilities: [...effectMapping.abilities],
      ...(effectMapping.effect !== undefined
        ? { effect: effectMapping.effect }
        : {}),
    };

    rawMap[id] = card;
    countByEra[currentEra] += 1;
  }

  const totalCards = Object.keys(rawMap).length;
  if (totalCards !== 45) {
    throw new Error(`Expected exactly 45 cards in GDD, found ${totalCards}.`);
  }
  for (const era of [1, 2, 3] as const) {
    if (countByEra[era] !== 15) {
      throw new Error(
        `Expected 15 cards in Era ${era}, found ${countByEra[era]}.`,
      );
    }
  }

  const mappedEffectKeys = Object.keys(CARD_EFFECTS_MAP);
  if (mappedEffectKeys.length !== 45) {
    throw new Error(
      `Expected 45 entries in CARD_EFFECTS_MAP, found ${mappedEffectKeys.length}.`,
    );
  }

  const sortedIds = Object.keys(rawMap).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const sortedRecord: Record<string, CardRules> = {};
  for (const id of sortedIds) {
    sortedRecord[id] = rawMap[id]!;
  }

  return CardsRulesFileSchema.parse(sortedRecord);
}

function main(): void {
  const isCheck = process.argv.includes('--check');
  const gddContent = fs.readFileSync(GDD_PATH, 'utf8');
  const parsedCatalog = parseGddCatalog(gddContent);
  const serialized = `${JSON.stringify(parsedCatalog, null, 2)}\n`;

  if (isCheck) {
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(
        `Error: ${OUTPUT_PATH} does not exist. Run "pnpm gdd:cards" first.`,
      );
      process.exit(1);
    }
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8').replace(/\r\n/g, '\n');
    if (existing !== serialized) {
      console.error(
        'Error: data/cards.rules.json is out of sync with docs/GDD.md and tools/card-effects.ts.',
      );
      process.exit(1);
    }
    console.log(
      'OK: data/cards.rules.json is valid and in sync (45 cards, 15 per Era).',
    );
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized, 'utf8');
  console.log(
    `Generated ${OUTPUT_PATH} successfully (45 cards, 15 per Era).`,
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'gdd-to-cards.ts';

if (isDirectRun) {
  main();
}

