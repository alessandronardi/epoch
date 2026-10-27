import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

interface ManifestEntry {
  file: string;
  imports?: string[];
  isEntry?: boolean;
}

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const budget = 250 * 1024;

try {
  const manifest = JSON.parse(
    readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'),
  ) as Record<string, ManifestEntry>;
  const entry = manifest['index.html'];
  if (!entry?.isEntry) throw new Error('Entry index.html assente dal manifest Vite.');

  const visited = new Set<string>();
  const files = new Set<string>();
  function visit(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== 'string') {
      throw new Error(`Chunk mancante o non valido: ${key}`);
    }
    if (chunk.file.startsWith('assets/') && chunk.file.endsWith('.js')) {
      const resolved = path.resolve(dist, chunk.file);
      if (!resolved.startsWith(path.join(dist, 'assets') + path.sep)) {
        throw new Error(`Percorso bundle non valido: ${chunk.file}`);
      }
      files.add(resolved);
    }
    for (const imported of chunk.imports ?? []) visit(imported);
  }
  visit('index.html');
  if (files.size === 0) throw new Error('Nessun bundle JS iniziale trovato.');
  const size = [...files].reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
  console.log(`JS iniziale: ${(size / 1024).toFixed(2)} KiB gzip / 250 KiB (${files.size} file)`);
  if (size > budget) {
    console.error('Budget JS iniziale superato.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Impossibile verificare il budget:', error);
  process.exitCode = 1;
}
