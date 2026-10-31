import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  CardsTextFileSchema,
  computeArcherMeleeAtk,
  formatTypeLine,
  generateRulesText,
  type EraNo,
} from '../packages/content/src/index.js';
import { parseGddCatalog } from './gdd-to-cards.js';
import { CATALOG_MANIFESTS, assertCatalogManifest } from './catalog-manifest.js';
import { checkExpansionFiles } from './expansion-catalog.js';

export interface GddRowExpectation {
  readonly id: string;
  readonly name: string;
  readonly expectedRulesText: string;
}

export function normalizeGddEffectTextToRulesText(rawEffect: string): string {
  const withNames = rawEffect
    .trim()
    .replace(/🍖/g, 'Cibo')
    .replace(/🪵/g, 'Legno')
    .replace(/⛏️/g, 'Metallo');
  return withNames.endsWith('.') ? withNames : `${withNames}.`;
}

export function extractGddExpectations(gddMarkdown: string): Record<string, GddRowExpectation> {
  const sectionIdx = gddMarkdown.indexOf('## 7. Catalogo Carte Ufficiale');
  if (sectionIdx === -1) {
    throw new Error('Could not find "## 7. Catalogo Carte Ufficiale" in GDD.');
  }
  const lines = gddMarkdown.slice(sectionIdx).split(/\r?\n/);
  const result: Record<string, GddRowExpectation> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 9) continue;
    const firstCell = cells[0]!;
    if (firstCell === 'ID' || firstCell.startsWith(':---')) continue;

    const id = firstCell.replace(/^`|`$/g, '').trim();
    const name = cells[1]!.replace(/^\*\*|\*\*$/g, '').trim();
    const rawEffect = cells[8]!;
    result[id] = {
      id,
      name,
      expectedRulesText: normalizeGddEffectTextToRulesText(rawEffect),
    };
  }
  return result;
}

export interface ContentValidationInput {
  readonly rawRules: unknown;
  readonly rawText: unknown;
  readonly rawArt: unknown;
  readonly gddMarkdown: string;
  readonly fileExists?: (relPath: string) => boolean;
}

export interface ContentValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const EXPECTED_ARCHER_MELEE: ReadonlyArray<{
  readonly id: string;
  readonly atk: number;
  readonly melee: number;
}> = Object.freeze([
  { id: 'u1_arc_l', atk: 2, melee: 1 },
  { id: 'u1_arc_h', atk: 3, melee: 1 },
  { id: 'u2_arc_l', atk: 4, melee: 2 },
  { id: 'u2_arc_h', atk: 5, melee: 2 },
  { id: 'u3_arc_l', atk: 6, melee: 3 },
  { id: 'u3_arc_h', atk: 8, melee: 4 },
]);

export function validateContentCatalog(input: ContentValidationInput): ContentValidationResult {
  const errors: string[] = [];
  const manifest = CATALOG_MANIFESTS['1.0'];

  if (
    typeof input.rawRules !== 'object' ||
    input.rawRules === null ||
    typeof input.rawText !== 'object' ||
    input.rawText === null ||
    typeof input.rawArt !== 'object' ||
    input.rawArt === null
  ) {
    return {
      valid: false,
      errors: ['One or more catalog inputs are not valid JSON objects.'],
    };
  }

  const ruleKeys = Object.keys(input.rawRules as Record<string, unknown>);
  const textKeys = Object.keys(input.rawText as Record<string, unknown>);
  const artKeys = Object.keys(input.rawArt as Record<string, unknown>);

  if (ruleKeys.length !== manifest.total) {
    errors.push(`Expected exactly 45 cards in cards.rules.json, found ${ruleKeys.length}.`);
  }
  if (textKeys.length !== manifest.total) {
    errors.push(`Expected exactly 45 cards in cards.text.it.json, found ${textKeys.length}.`);
  }
  if (artKeys.length !== manifest.total) {
    errors.push(`Expected exactly 45 cards in cards.art.json, found ${artKeys.length}.`);
  }

  const allIds = new Set<string>([...ruleKeys, ...textKeys, ...artKeys]);
  for (const id of allIds) {
    if (!ruleKeys.includes(id)) {
      errors.push(`Card ID "${id}" is missing in cards.rules.json.`);
    }
    if (!textKeys.includes(id)) {
      errors.push(`Card ID "${id}" is missing in cards.text.it.json.`);
    }
    if (!artKeys.includes(id)) {
      errors.push(`Card ID "${id}" is missing in cards.art.json.`);
    }
  }

  const rulesParse = CardsRulesFileSchema.safeParse(input.rawRules);
  if (!rulesParse.success) {
    for (const issue of rulesParse.error.issues) {
      errors.push(`cards.rules.json [${issue.path.join('.')}]: ${issue.message}`);
    }
  }

  const textParse = CardsTextFileSchema.safeParse(input.rawText);
  if (!textParse.success) {
    for (const issue of textParse.error.issues) {
      errors.push(`cards.text.it.json [${issue.path.join('.')}]: ${issue.message}`);
    }
  }

  const artParse = CardsArtFileSchema.safeParse(input.rawArt);
  if (!artParse.success) {
    for (const issue of artParse.error.issues) {
      errors.push(`cards.art.json [${issue.path.join('.')}]: ${issue.message}`);
    }
  }

  if (!rulesParse.success || !textParse.success || !artParse.success) {
    return { valid: false, errors };
  }

  const rulesMap = rulesParse.data;
  try {
    assertCatalogManifest(rulesMap, '1.0');
  } catch (error) {
    errors.push(String(error));
  }
  const textMap = textParse.data;
  const artMap = artParse.data;

  const countByEra: Record<EraNo, number> = { 1: 0, 2: 0, 3: 0 };
  for (const card of Object.values(rulesMap)) {
    countByEra[card.era] += 1;
  }
  for (const era of [1, 2, 3] as const) {
    if (countByEra[era] !== manifest.byEra[era]) {
      errors.push(`Expected 15 cards in Era ${era}, found ${countByEra[era]}.`);
    }
  }

  let gddExpectations: Record<string, GddRowExpectation> = {};
  let gddRulesMap: Record<string, unknown> = {};
  try {
    gddExpectations = extractGddExpectations(input.gddMarkdown);
    gddRulesMap = parseGddCatalog(input.gddMarkdown);
  } catch (err) {
    errors.push(`Failed to parse GDD catalog: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Verify Archer melee formula on the 6 official archers (Appendix C.1: 2,3,4,5,6,8 -> 1,1,2,2,3,4)
  for (const expectedArcher of EXPECTED_ARCHER_MELEE) {
    const archerCard = rulesMap[expectedArcher.id];
    if (!archerCard) {
      errors.push(`Missing expected archer card "${expectedArcher.id}" in rules catalog.`);
      continue;
    }
    if (archerCard.atk !== expectedArcher.atk) {
      errors.push(
        `Archer "${expectedArcher.id}" expected base ATK ${expectedArcher.atk}, got ${String(archerCard.atk)}.`,
      );
    }
    const computedMelee = computeArcherMeleeAtk(archerCard.atk ?? expectedArcher.atk);
    if (computedMelee !== expectedArcher.melee) {
      errors.push(
        `Archer "${expectedArcher.id}" melee ATK mismatch: expected ${expectedArcher.melee}, got ${computedMelee}.`,
      );
    }
  }

  const checkFileExists =
    input.fileExists ?? ((relPath: string) => fs.existsSync(path.resolve(process.cwd(), relPath)));

  for (const id of Object.keys(rulesMap)) {
    const card = rulesMap[id]!;
    const text = textMap[id];
    const art = artMap[id];
    if (!text || !art) continue;

    if (text.name.length > 24) {
      errors.push(`Card "${id}" name "${text.name}" exceeds 24 characters (${text.name.length}).`);
    }
    if (text.flavor.trim().length === 0 || text.flavor.length > 120) {
      errors.push(
        `Card "${id}" flavor text must be 1..120 characters (got ${text.flavor.length}).`,
      );
    }
    if (art.alt.it.trim().length < 20) {
      errors.push(
        `Card "${id}" alt.it must be at least 20 characters (got ${art.alt.it.trim().length}).`,
      );
    }

    const expectedTypeLine = formatTypeLine(card, 'it');
    if (text.typeLine !== expectedTypeLine) {
      errors.push(
        `Card "${id}" typeLine mismatch: expected "${expectedTypeLine}", got "${text.typeLine}".`,
      );
    }

    const gddRow = gddExpectations[id];
    if (gddRow) {
      if (text.name !== gddRow.name) {
        errors.push(`Card "${id}" name "${text.name}" diverges from GDD §7 name "${gddRow.name}".`);
      }
      const generatedRulesText = generateRulesText(card, 'it');
      if (generatedRulesText !== gddRow.expectedRulesText) {
        errors.push(
          `Card "${id}" generated rules text "${generatedRulesText}" diverges from GDD §7 "${gddRow.expectedRulesText}".`,
        );
      }
    }

    const gddCardRule = gddRulesMap[id];
    if (gddCardRule && JSON.stringify(card) !== JSON.stringify(gddCardRule)) {
      errors.push(`Card "${id}" in cards.rules.json diverges from GDD §7 parsed rules.`);
    }

    if (art.status === 'final') {
      if (!art.file.trim() || !art.credit.trim() || !art.prompt.trim()) {
        errors.push(`Card "${id}" has status "final" but is missing file or provenance metadata.`);
      } else {
        const masterPath = `data/art/src/${id}.png`;
        const publicOrDirectExists =
          checkFileExists(art.file) ||
          checkFileExists(`apps/web/public/${art.file}`) ||
          checkFileExists(masterPath);
        if (!publicOrDirectExists) {
          errors.push(
            `Card "${id}" has status "final" but image file "${art.file}" (or "${masterPath}") does not exist on disk.`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function main(): void {
  checkExpansionFiles(true);
  const rootDir = process.cwd();
  const rulesPath = path.join(rootDir, 'data', 'cards.rules.json');
  const textPath = path.join(rootDir, 'data', 'cards.text.it.json');
  const artPath = path.join(rootDir, 'data', 'cards.art.json');
  const gddPath = path.join(rootDir, 'docs', 'GDD.md');

  const rawRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')) as unknown;
  const rawText = JSON.parse(fs.readFileSync(textPath, 'utf8')) as unknown;
  const rawArt = JSON.parse(fs.readFileSync(artPath, 'utf8')) as unknown;
  const gddMarkdown = fs.readFileSync(gddPath, 'utf8');

  const result = validateContentCatalog({
    rawRules,
    rawText,
    rawArt,
    gddMarkdown,
  });

  if (!result.valid) {
    console.error('Content validation failed with errors:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    'OK: All 45 cards (15 per Era) passed rules, text, art, and GDD §7 consistency checks.',
  );
}

const isDirectRun =
  process.argv[1] !== undefined && path.basename(process.argv[1]) === 'content-validate.ts';

if (isDirectRun) {
  main();
}
