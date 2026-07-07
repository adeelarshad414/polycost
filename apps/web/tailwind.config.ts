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
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          orange: 'var(--brand-orange)',
          blue: 'var(--brand-blue)',
          green: 'var(--brand-green)',
          'orange-dark': 'var(--brand-orange-dark)',
          'blue-dark': 'var(--brand-blue-dark)',
          'green-dark': 'var(--brand-green-dark)',
        },
        surface: {
          canvas: 'var(--surface-canvas)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        ink: {
          900: 'var(--ink-900)',
          600: 'var(--ink-600)',
          400: 'var(--ink-400)',
        },
        status: {
          ok: 'var(--status-ok)',
          warn: 'var(--status-warn)',
          crit: 'var(--status-crit)',
        },
        provider: {
          aws: 'var(--aws)',
          azure: 'var(--azure)',
          gcp: 'var(--gcp)',
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
