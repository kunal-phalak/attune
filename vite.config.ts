import { defineConfig } from 'vite-plus';

const complexityWarning = (max: number): ['warn', { max: number; variant: 'modified' }] => [
  'warn',
  { max, variant: 'modified' },
];

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['import', 'jsx-a11y', 'oxc', 'react', 'typescript', 'unicorn'],
    categories: {
      correctness: 'error',
      perf: 'error',
      suspicious: 'error',
    },
    rules: {
      complexity: complexityWarning(12),
      'max-depth': ['warn', { max: 4 }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', { max: 4 }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'react/react-in-jsx-scope': 'off',
    },
    overrides: [
      {
        files: [
          'packages/domain/**/*.ts',
          'packages/capabilities/**/*.ts',
          'packages/shopify/**/*.ts',
          'packages/webmcp/**/*.ts',
        ],
        rules: {
          complexity: complexityWarning(8),
          'max-depth': ['warn', { max: 3 }],
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['react', 'react/*'],
                  message: 'Core Attune packages must remain independent of React.',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['packages/editor/**/*.ts'],
        rules: {
          complexity: complexityWarning(10),
        },
      },
      {
        files: ['apps/web/app/layout.tsx', 'apps/web/next-env.d.ts'],
        rules: {
          'import/no-unassigned-import': 'off',
        },
      },
      {
        files: ['scripts/verify-shopify/**/*.mjs'],
        rules: {
          'no-await-in-loop': 'off',
        },
      },
    ],
    ignorePatterns: [
      '**/.next/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  fmt: {
    semi: true,
    singleQuote: true,
    sortImports: true,
    sortPackageJson: true,
    ignorePatterns: ['ATTUNE_CODEX_MASTER_BUILD_SPEC.md', 'apps/web/next-env.d.ts'],
  },
  staged: {
    '*.{js,jsx,ts,tsx,json,md,yaml,yml}': 'vp check --fix',
  },
  test: {
    exclude: ['**/.next/**', '**/node_modules/**', 'playwright-report/**'],
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
  },
});
