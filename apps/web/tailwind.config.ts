import type { Config } from 'tailwindcss';

/**
 * Tailwind theme maps brand names to the CSS custom properties emitted by
 * packages/shared/src/branding.ts. No hex values live here — only var()
 * references — so branding.ts stays the single source of colour truth.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'resend-purple': 'var(--resend-purple)',
        'resend-lilac': 'var(--resend-lilac)',
        'resend-green': 'var(--resend-green)',
        'resend-ink': 'var(--resend-ink)',
        'status-amber': 'var(--status-amber)',
      },
    },
  },
  plugins: [],
} satisfies Config;
