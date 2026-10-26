import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@epochs/engine': path.resolve(
        currentDir,
        '../../packages/engine/src/index.ts',
      ),
      '@epochs/content': path.resolve(
        currentDir,
        '../../packages/content/src/index.ts',
      ),
      '@epochs/bots': path.resolve(
        currentDir,
        '../../packages/bots/src/index.ts',
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
