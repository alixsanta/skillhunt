// Configuration plate ESLint 9 pour le backend-core NestJS (C2.1.2 - qualité de code)
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // NestJS s'appuie massivement sur des types injectés ; on tolère un usage encadré de `any`
      '@typescript-eslint/no-explicit-any': 'off',
      // Autorise les variables préfixées par _ (ex. destructuration pour retirer un champ sensible)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Les specs Jest utilisent des globals de test
    files: ['**/*.spec.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
  },
);
