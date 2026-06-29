import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'top-loading-grow': {
          '0%': { transform: 'scaleX(0)' },
          '65%': { transform: 'scaleX(0.64)' },
          '100%': { transform: 'scaleX(0.8)' },
        },
      },
      animation: {
        'top-loading-grow': 'top-loading-grow 1.25s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        action: {
          primary: 'var(--primary-action)',
          hover: 'var(--primary-action-hover)',
          active: 'var(--primary-action-active)',
          destructive: 'var(--destructive)',
        },
        brand: {
          orange: 'var(--brand-orange)',
          blue: 'var(--brand-blue)',
          green: 'var(--brand-green)',
          'orange-dark': 'var(--brand-orange-dark)',
          'blue-dark': 'var(--brand-blue-dark)',
          'green-dark': 'var(--brand-green-dark)',
        },
        landing: {
          bg: 'var(--pc-landing-bg)',
          surface: {
            1: 'var(--pc-landing-surface-1)',
          },
          border: {
            DEFAULT: 'var(--pc-landing-border)',
            strong: 'var(--pc-landing-border-strong)',
          },
          text: {
            primary: 'var(--pc-landing-text-primary)',
            secondary: 'var(--pc-landing-text-secondary)',
            muted: 'var(--pc-landing-text-muted)',
          },
          action: {
            primary: 'var(--pc-landing-primary-action)',
          },
          destructive: 'var(--pc-landing-destructive)',
          label: {
            aws: 'var(--pc-landing-aws-label)',
            azure: 'var(--pc-landing-azure-label)',
            gcp: 'var(--pc-landing-gcp-label)',
          },
          cost: {
            down: 'var(--pc-landing-cost-down)',
            up: 'var(--pc-landing-cost-up)',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
