import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ingestCardArt } from '../../../tools/art-ingest.js';

describe('tools/art-ingest.ts', () => {
  it('resizes an input image to 1536x1152 sRGB PNG and updates cards.art.json to final', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epochs-ingest-test-'));

    try {
      // Create mock structure
      const dataDir = path.join(tmpDir, 'data');
      const artDir = path.join(dataDir, 'art', 'src');
      fs.mkdirSync(artDir, { recursive: true });

      const mockArtJson = {
        e1_farm: {
          file: 'cards/placeholders/e1_farm.svg',
          alt: {
            it: 'Illustrazione di una fattoria in legno all&apos;alba con campo di grano e carro trainato da buoi.',
          },
          prompt: 'Mock prompt for testing',
          negative: 'Mock negative',
          status: 'placeholder',
          credit: 'Placeholder credit',
        },
      };

      fs.writeFileSync(
        path.join(dataDir, 'cards.art.json'),
        JSON.stringify(mockArtJson, null, 2),
      );

      // Create a test input image with arbitrary dimensions (e.g. 800x600)
      const inputImagePath = path.join(tmpDir, 'test-input.jpg');
      await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg()
        .toFile(inputImagePath);

      // Execute ingest
      const masterPath = await ingestCardArt({
        cardId: 'e1_farm',
        inputPath: inputImagePath,
        rootDir: tmpDir,
        credit: 'Test Ingest Agent',
      });

      expect(fs.existsSync(masterPath)).toBe(true);

      const metadata = await sharp(fs.readFileSync(masterPath)).metadata();
      expect(metadata.width).toBe(1536);
      expect(metadata.height).toBe(1152);
      expect(metadata.format).toBe('png');
      expect(metadata.space).toBe('srgb');

      // Verify cards.art.json
      const updatedJson = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'cards.art.json'), 'utf8'),
      );
      expect(updatedJson.e1_farm.status).toBe('final');
      expect(updatedJson.e1_farm.file).toBe('cards/e1_farm-1024.webp');
      expect(updatedJson.e1_farm.credit).toBe('Test Ingest Agent');
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
