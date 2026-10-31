import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Next's rules only apply inside the web app.
const webOnly = nextCoreWebVitals.map((config) => ({
  ...config,
  files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
  settings: { ...config.settings, next: { rootDir: 'apps/web' } },
}));

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', '**/dist/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...webOnly,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // PLAN §1: no `any`; use `unknown` and narrow it.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/jest.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
    languageOptions: { sourceType: 'commonjs' },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
);
