// Narrow correctness lint for Edge source. The supported lint parser/toolchain is isolated
// from the app's TypeScript 7 compiler under scripts/edge-lint and never shipped publicly.
import { createRequire } from 'node:module';
const require = createRequire(new URL('./scripts/edge-lint/package.json', import.meta.url));
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

export default [
  { ignores: ['backend/edge/engine.cjs', 'scripts/edge-lint/**', 'node_modules/**'] },
  {
    files: ['assets/js/edge/*.js', 'backend/edge/*.cjs', 'scripts/edge-*.cjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', globals: globals.es2022 },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  { files: ['assets/js/edge/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['backend/edge/*.cjs', 'scripts/edge-*.cjs'], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['lib/edge/**/*.ts'],
    languageOptions: { ...config.languageOptions, ecmaVersion: 'latest', globals: globals.es2022 },
  })),
  {
    files: ['lib/edge/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // Arrays/maps are tested before indexed reads; the application compiler also checks strict types.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
