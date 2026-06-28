import js from '@eslint/js';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'apps/web/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
