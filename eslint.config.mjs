import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@epochs/web*', '@epochs/server*', '**/apps/**'],
              message: 'Packages in packages/* cannot import from apps/*.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@epochs/*',
                '**/packages/protocol/**',
                '**/packages/content/**',
                '**/packages/bots/**',
                '**/packages/sim/**',
                '**/apps/**',
                'node:*',
                'fs',
                'path',
                'crypto',
                'http',
                'https',
                'os',
                'child_process',
                'worker_threads',
              ],
              message:
                'packages/engine must remain pure and cannot import from other packages, apps, or Node I/O modules.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Date is forbidden in packages/engine to preserve determinism.',
        },
        {
          name: 'setTimeout',
          message: 'setTimeout is forbidden in packages/engine.',
        },
        {
          name: 'fetch',
          message: 'fetch is forbidden in packages/engine.',
        },
        {
          name: 'process',
          message: 'process is forbidden in packages/engine.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is forbidden in packages/engine. Use the seeded sfc32 PRNG.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Date.now is forbidden in packages/engine.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is forbidden in packages/engine.',
        },
      ],
    },
  },
  {
    files: [
      'packages/protocol/**/*.ts',
      'packages/content/**/*.ts',
      'packages/bots/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@epochs/web*', '@epochs/server*', '@epochs/sim*', '**/apps/**'],
              message:
                'This package can only depend on @epochs/engine (and unidirectional allowed packages), never on apps/* or @epochs/sim.',
            },
          ],
        },
      ],
    },
  },
);
