export interface CoverageThreshold {
  readonly statements: number;
  readonly branches: number;
}

export interface VitestRootConfig {
  readonly test: {
    readonly globals: boolean;
    readonly maxWorkers: number;
    readonly environment: 'node';
    readonly include: readonly string[];
    readonly coverage: {
      readonly provider: 'v8';
      readonly reporter: readonly string[];
      readonly include: readonly string[];
      readonly exclude: readonly string[];
      readonly thresholds: Readonly<Record<string, CoverageThreshold>>;
    };
  };
}

const config: VitestRootConfig = {
  test: {
    globals: false,
    // I test jsdom montano il tavolo completo: limita la contesa di CPU e memoria.
    maxWorkers: 2,
    environment: 'node',
    include: [
      'packages/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.tsx',
      'apps/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'packages/engine/src/**/*.ts',
        'packages/protocol/src/**/*.ts',
        'packages/content/src/**/*.ts',
        'packages/bots/src/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/tests/**'],
      thresholds: {
        'packages/engine/src/**/*.ts': {
          statements: 95,
          branches: 95,
        },
        'packages/protocol/src/**/*.ts': {
          statements: 85,
          branches: 85,
        },
        'packages/content/src/**/*.ts': {
          statements: 85,
          branches: 85,
        },
        'packages/bots/src/**/*.ts': {
          statements: 85,
          branches: 85,
        },
      },
    },
  },
};

export default config;
