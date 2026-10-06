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
  {
    // Iris, the mascot, never appears inside a chart: colour inside a chart
    // only encodes data, and a mascot beside a bar reads as an endorsement.
    files: [
      'apps/web/src/charts/**/*.{ts,tsx}',
      'apps/web/src/components/Charts.tsx',
      'apps/web/src/components/CostByService.tsx',
      'apps/web/src/components/chart-theme.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/brand/Iris', '**/brand/iris-art'],
              message:
                'Iris is never placed inside a chart (handover/DESIGN-SYSTEM.md, "Illustration: Iris").',
            },
          ],
        },
      ],
    },
  },
];
