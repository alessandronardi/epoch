import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  ART_WIDTHS,
  buildSingleCardArt,
  computeHeightFor4x3,
  runArtBuild,
  type ArtManifest,
} from '../../../tools/art-build.js';
import { CARD_CATALOG, V2_CARD_CATALOG } from '../src/index.js';

describe('Art pipeline (tools/art-build.ts)', () => {
  it('verifies art-manifest.json and WebP/AVIF variants for both versioned catalogs', async () => {
    const rootDir = process.cwd();
    const outCardsDir = path.join(rootDir, 'apps', 'web', 'public', 'cards');
    const manifestPath = path.join(outCardsDir, 'art-manifest.json');

    if (!fs.existsSync(manifestPath)) {
      await runArtBuild({ rootDir, includeExpansion: true });
    }

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ArtManifest;

    expect(manifest.version).toBe(1);
    expect(manifest.widths).toEqual([256, 512, 1024]);

    const manifestIds = Object.keys(manifest.cards).sort();
    const catalogIds = [
      ...new Set([...CARD_CATALOG.allCards, ...V2_CARD_CATALOG.allCards].map((c) => c.id)),
    ].sort();
    expect(manifestIds).toEqual(catalogIds);
    expect(manifestIds.length).toBe(66);

    for (const card of [
      ...new Map(
        [...V2_CARD_CATALOG.allCards, ...CARD_CATALOG.allCards].map((card) => [card.id, card]),
      ).values(),
    ]) {
      const entry = manifest.cards[card.id];
      expect(entry).toBeDefined();
      expect(entry?.id).toBe(card.id);
      expect(entry?.aspectRatio).toBe('4:3');
      expect(entry?.alt.it).toBe(card.art.alt.it);
      expect(entry?.fallbackSvg).toBe(`/cards/placeholders/${card.id}.svg`);

      for (const width of ART_WIDTHS) {
        expect(entry?.webp[width]).toBe(`/cards/${card.id}-${width}.webp`);
        expect(entry?.avif[width]).toBe(`/cards/${card.id}-${width}.avif`);

        const webpFile = path.join(outCardsDir, `${card.id}-${width}.webp`);
        const avifFile = path.join(outCardsDir, `${card.id}-${width}.avif`);
        expect(fs.existsSync(webpFile)).toBe(true);
        expect(fs.existsSync(avifFile)).toBe(true);
        expect(fs.statSync(webpFile).size).toBeGreaterThan(0);
        expect(fs.statSync(avifFile).size).toBeGreaterThan(0);
      }
    }

    // Verify exact 4:3 dimensions on a sample card across all 3 widths
    for (const width of ART_WIDTHS) {
      const expectedHeight = computeHeightFor4x3(width);
      const webpMeta = await sharp(path.join(outCardsDir, `e1_farm-${width}.webp`)).metadata();
      expect(webpMeta.format).toBe('webp');
      expect(webpMeta.width).toBe(width);
      expect(webpMeta.height).toBe(expectedHeight);

      const avifMeta = await sharp(path.join(outCardsDir, `e1_farm-${width}.avif`)).metadata();
      expect(avifMeta.format).toBe('heif');
      expect(avifMeta.width).toBe(width);
      expect(avifMeta.height).toBe(expectedHeight);
    }
  });

  it('converts a master PNG (1536x1152) when present and falls back to SVG placeholder when missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epochs-art-test-'));
    try {
      const masterDir = path.join(tmpDir, 'master');
      const outCardsDir = path.join(tmpDir, 'out');
      const placeholdersDir = path.join(outCardsDir, 'placeholders');
      fs.mkdirSync(masterDir, { recursive: true });

      const sampleCard = CARD_CATALOG.cardsById['e1_farm']!;

      // 1. Without master PNG -> fallback to SVG placeholder
      const placeholderEntry = await buildSingleCardArt({
        card: sampleCard.rules,
        art: sampleCard.art,
        masterDir,
        outCardsDir,
        placeholdersDir,
      });
      expect(placeholderEntry.source).toBe('placeholder');
      expect(fs.existsSync(path.join(placeholdersDir, 'e1_farm.svg'))).toBe(true);

      // 2. With 1536x1152 master PNG -> source === 'master'
      const masterPngPath = path.join(masterDir, 'e1_farm.png');
      await sharp({
        create: {
          width: 1536,
          height: 1152,
          channels: 3,
          background: { r: 168, g: 111, b: 60 },
        },
      })
        .png()
        .toFile(masterPngPath);

      const masterEntry = await buildSingleCardArt({
        card: sampleCard.rules,
        art: sampleCard.art,
        masterDir,
        outCardsDir,
        placeholdersDir,
      });
      expect(masterEntry.source).toBe('master');

      const meta1024 = await sharp(
        fs.readFileSync(path.join(outCardsDir, 'e1_farm-1024.webp')),
      ).metadata();
      expect(meta1024.width).toBe(1024);
      expect(meta1024.height).toBe(768);
    } finally {
      fs.rmSync(tmpDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });
});
