import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  type ArtStatus,
  type CardArt,
  type CardRules,
} from '../data/schema/cards.schema.js';
import { generatePlaceholderSvg } from './art-placeholders.js';

sharp.cache(false);

export const ART_WIDTHS = Object.freeze([256, 512, 1024] as const);
export type ArtWidth = (typeof ART_WIDTHS)[number];

export interface CardArtManifestEntry {
  readonly id: string;
  readonly source: 'master' | 'placeholder';
  readonly status: ArtStatus;
  readonly aspectRatio: '4:3';
  readonly widths: readonly [256, 512, 1024];
  readonly avif: {
    readonly 256: string;
    readonly 512: string;
    readonly 1024: string;
  };
  readonly webp: {
    readonly 256: string;
    readonly 512: string;
    readonly 1024: string;
  };
  readonly fallbackSvg: string;
  readonly alt: {
    readonly it: string;
  };
}

export interface ArtManifest {
  readonly version: 1;
  readonly widths: readonly [256, 512, 1024];
  readonly cards: Readonly<Record<string, CardArtManifestEntry>>;
}

export interface BuildCardArtOptions {
  readonly card: CardRules;
  readonly art: CardArt;
  readonly masterDir: string;
  readonly outCardsDir: string;
  readonly placeholdersDir: string;
}

export function computeHeightFor4x3(width: number): number {
  return Math.round((width * 3) / 4);
}

export function createManifestEntry(
  cardId: string,
  source: 'master' | 'placeholder',
  art: CardArt,
): CardArtManifestEntry {
  return {
    id: cardId,
    source,
    status: art.status,
    aspectRatio: '4:3',
    widths: ART_WIDTHS,
    avif: {
      256: `/cards/${cardId}-256.avif`,
      512: `/cards/${cardId}-512.avif`,
      1024: `/cards/${cardId}-1024.avif`,
    },
    webp: {
      256: `/cards/${cardId}-256.webp`,
      512: `/cards/${cardId}-512.webp`,
      1024: `/cards/${cardId}-1024.webp`,
    },
    fallbackSvg: `/cards/placeholders/${cardId}.svg`,
    alt: {
      it: art.alt.it,
    },
  };
}

export async function buildSingleCardArt(
  options: BuildCardArtOptions,
): Promise<CardArtManifestEntry> {
  const { card, art, masterDir, outCardsDir, placeholdersDir } = options;
  const cardId = card.id;

  const masterPngPath = path.join(masterDir, `${cardId}.png`);
  const masterJpgPath = path.join(masterDir, `${cardId}.jpg`);
  const masterJpegPath = path.join(masterDir, `${cardId}.jpeg`);

  let masterPath: string | null = null;
  if (fs.existsSync(masterPngPath)) {
    masterPath = masterPngPath;
  } else if (fs.existsSync(masterJpgPath)) {
    masterPath = masterJpgPath;
  } else if (fs.existsSync(masterJpegPath)) {
    masterPath = masterJpegPath;
  }

  const placeholderSvgPath = path.join(placeholdersDir, `${cardId}.svg`);
  if (!fs.existsSync(placeholderSvgPath)) {
    fs.mkdirSync(placeholdersDir, { recursive: true });
    const svgContent = generatePlaceholderSvg(card);
    fs.writeFileSync(placeholderSvgPath, svgContent, 'utf8');
  }

  const sourceKind: 'master' | 'placeholder' =
    masterPath !== null ? 'master' : 'placeholder';
  const inputBuffer =
    masterPath !== null
      ? fs.readFileSync(masterPath)
      : Buffer.from(fs.readFileSync(placeholderSvgPath, 'utf8'), 'utf8');

  fs.mkdirSync(outCardsDir, { recursive: true });

  await Promise.all(
    ART_WIDTHS.map(async (width) => {
      const height = computeHeightFor4x3(width);
      const resizedPipeline = sharp(inputBuffer).resize(width, height, {
        fit: 'cover',
        position: 'centre',
      });

      const webpOutPath = path.join(outCardsDir, `${cardId}-${width}.webp`);
      const avifOutPath = path.join(outCardsDir, `${cardId}-${width}.avif`);

      await Promise.all([
        resizedPipeline
          .clone()
          .webp({ quality: 80, effort: 1 })
          .toFile(webpOutPath),
        resizedPipeline
          .clone()
          .avif({ quality: 65, effort: 0 })
          .toFile(avifOutPath),
      ]);
    }),
  );

  return createManifestEntry(cardId, sourceKind, art);
}

export interface BuildArtPipelineConfig {
  readonly rootDir?: string | undefined;
  readonly rulesPath?: string | undefined;
  readonly artPath?: string | undefined;
  readonly masterDir?: string | undefined;
  readonly outCardsDir?: string | undefined;
  readonly placeholdersDir?: string | undefined;
  readonly concurrency?: number | undefined;
}

export async function runArtBuild(
  config: BuildArtPipelineConfig = {},
): Promise<ArtManifest> {
  const rootDir = config.rootDir ?? process.cwd();
  const rulesPath =
    config.rulesPath ?? path.join(rootDir, 'data', 'cards.rules.json');
  const artPath =
    config.artPath ?? path.join(rootDir, 'data', 'cards.art.json');
  const masterDir =
    config.masterDir ?? path.join(rootDir, 'data', 'art', 'src');
  const outCardsDir =
    config.outCardsDir ?? path.join(rootDir, 'apps', 'web', 'public', 'cards');
  const placeholdersDir =
    config.placeholdersDir ?? path.join(outCardsDir, 'placeholders');

  const rulesMap = CardsRulesFileSchema.parse(
    JSON.parse(fs.readFileSync(rulesPath, 'utf8')),
  );
  const artMap = CardsArtFileSchema.parse(
    JSON.parse(fs.readFileSync(artPath, 'utf8')),
  );

  fs.mkdirSync(outCardsDir, { recursive: true });
  fs.mkdirSync(placeholdersDir, { recursive: true });

  const sortedCardIds = Object.keys(rulesMap).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const concurrency = Math.max(
    1,
    Math.min(config.concurrency ?? os.availableParallelism(), 8),
  );
  const entriesById: Record<string, CardArtManifestEntry> = {};

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < sortedCardIds.length) {
      const idx = cursor;
      cursor += 1;
      const cardId = sortedCardIds[idx]!;
      const card = rulesMap[cardId]!;
      const art = artMap[cardId];
      if (!art) {
        throw new Error(`Missing art metadata for card "${cardId}".`);
      }
      const entry = await buildSingleCardArt({
        card,
        art,
        masterDir,
        outCardsDir,
        placeholdersDir,
      });
      entriesById[cardId] = entry;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const orderedCards: Record<string, CardArtManifestEntry> = {};
  for (const id of sortedCardIds) {
    orderedCards[id] = entriesById[id]!;
  }

  const manifest: ArtManifest = {
    version: 1,
    widths: ART_WIDTHS,
    cards: orderedCards,
  };

  const manifestPath = path.join(outCardsDir, 'art-manifest.json');
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'art-build.ts';

if (isDirectRun) {
  runArtBuild()
    .then((manifest) => {
      const count = Object.keys(manifest.cards).length;
      console.log(
        `Built WebP/AVIF responsive art (256/512/1024px) and art-manifest.json for ${count} cards.`,
      );
    })
    .catch((err: unknown) => {
      console.error('Art pipeline build failed:', err);
      process.exit(1);
    });
}
