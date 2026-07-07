// Configuration plate ESLint 9+ pour le frontend-web React/Vite SkillHunt (SH-19, cohérent avec backend-core, C2.1.2)
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    // Composants générés par la CLI shadcn/ui : ils exportent volontairement
    // le composant ET son helper de variantes (cva) dans le même fichier.
    // On ne modifie pas ces fichiers à la main, donc la contrainte react-refresh
    // (un seul export de composant par fichier) ne s'applique pas ici (SH-19).
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
