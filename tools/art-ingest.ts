import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  CardsArtFileSchema,
  type CardsArtFile,
} from '../data/schema/cards.schema.js';

sharp.cache(false);

export interface IngestOptions {
  readonly cardId: string;
  readonly inputPath: string;
  readonly rootDir?: string | undefined;
  readonly credit?: string | undefined;
}

export async function ingestCardArt(options: IngestOptions): Promise<string> {
  const rootDir = options.rootDir ?? process.cwd();
  const cardId = options.cardId;
  const inputPath = path.resolve(rootDir, options.inputPath);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image file not found: ${inputPath}`);
  }

  const artJsonPath = path.join(rootDir, 'data', 'cards.art.json');
  const rawArt = JSON.parse(fs.readFileSync(artJsonPath, 'utf8'));
  const artMap = CardsArtFileSchema.parse(rawArt);

  const existingEntry = artMap[cardId];
  if (!existingEntry) {
    throw new Error(`Card "${cardId}" not found in cards.art.json.`);
  }

  const masterDir = path.join(rootDir, 'data', 'art', 'src');
  fs.mkdirSync(masterDir, { recursive: true });

  const targetMasterPath = path.join(masterDir, `${cardId}.png`);

  const imageBuffer = fs.readFileSync(inputPath);
  await sharp(imageBuffer)
    .resize(1536, 1152, {
      fit: 'cover',
      position: 'centre',
    })
    .toColorspace('srgb')
    .png({ compressionLevel: 9 })
    .toFile(targetMasterPath);

  const updatedEntry = {
    ...existingEntry,
    file: `cards/${cardId}-1024.webp`,
    status: 'final' as const,
    credit: options.credit ?? 'The Epochs Art Pipeline (image-generator)',
  };

  const updatedArtMap: CardsArtFile = {
    ...artMap,
    [cardId]: updatedEntry,
  };

  // Keep sorted keys
  const sortedMap: CardsArtFile = {};
  for (const id of Object.keys(updatedArtMap).sort()) {
    sortedMap[id] = updatedArtMap[id]!;
  }

  fs.writeFileSync(
    artJsonPath,
    `${JSON.stringify(sortedMap, null, 2)}\n`,
    'utf8',
  );

  return targetMasterPath;
}

export async function ingestDirectory(
  dirPath: string,
  rootDir = process.cwd(),
): Promise<string[]> {
  const resolvedDir = path.resolve(rootDir, dirPath);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  const files = fs.readdirSync(resolvedDir);
  const ingested: string[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      continue;
    }
    const cardId = path.basename(file, ext);
    const fullPath = path.join(resolvedDir, file);
    try {
      const outPath = await ingestCardArt({
        cardId,
        inputPath: fullPath,
        rootDir,
      });
      ingested.push(outPath);
      console.log(`Ingested ${cardId} -> ${outPath}`);
    } catch (err) {
      console.warn(`Skipping ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return ingested;
}

function parseCliArgs(): {
  card?: string;
  input?: string;
  dir?: string;
  credit?: string;
} {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith('--card=')) {
      result.card = arg.slice('--card='.length);
    } else if (arg.startsWith('--input=')) {
      result.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--dir=')) {
      result.dir = arg.slice('--dir='.length);
    } else if (arg.startsWith('--credit=')) {
      result.credit = arg.slice('--credit='.length);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.dir) {
    const results = await ingestDirectory(args.dir);
    console.log(`Successfully ingested ${results.length} cards from ${args.dir}`);
    return;
  }

  if (args.card && args.input) {
    const outPath = await ingestCardArt({
      cardId: args.card,
      inputPath: args.input,
      credit: args.credit,
    });
    console.log(`Successfully ingested ${args.card} into ${outPath}`);
    return;
  }

  console.error('Usage: tsx tools/art-ingest.ts --card=<id> --input=<path> [--credit=<credit>]');
  console.error('   or: tsx tools/art-ingest.ts --dir=<path>');
  process.exit(1);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'art-ingest.ts';

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  });
}
