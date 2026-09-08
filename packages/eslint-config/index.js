import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Apps extend this and add framework-specific plugins.
 *
 * Type-aware rules use `projectService` rather than `project: true` so config
 * files and scripts outside tsconfig's `include` do not error.
 */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: process.cwd() },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // The API returns `unknown` bodies through openapi-fetch; narrowing them is
      // the client's job, and these two fire on every legitimate narrowing.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
];
