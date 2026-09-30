/**
 * UI-1 guardrail: colours, type, radius and elevation must come from the Aurora
 * tokens in src/styles/tokens.css. Functions (color-mix, clamp, calc, gradients)
 * are allowed so tokens can be composed; bare literals are not. box-shadow is
 * left to scripts/theme-hex-guard.mjs, which rejects raw rgb()/hsl() colours:
 * this rule checks each part of a shadow on its own, so composed shadows such as
 * a 4px ring of var(--focus-ring) could never pass it.
 */
export default {
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['src/styles/tokens.css'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        'fill',
        'stroke',
        'background-color',
        'font-size',
        'font-weight',
        'border-radius',
      ],
      {
        ignoreValues: [
          'inherit',
          'initial',
          'unset',
          'transparent',
          'currentColor',
          'currentcolor',
          'none',
          '0',
          '/^0 /',
          'inset',
          'normal',
          'bold',
          // Values composed from a token (e.g. a 4px ring of var(--focus-ring)) are fine;
          // what the rule catches is a bare literal colour, size or radius.
          '/var\\(--/',
        ],
        ignoreFunctions: true,
        disableFix: true,
      },
    ],
  },
};
