import type { Config } from 'tailwindcss';

/** A neutral grey from branding.ts, usable with an opacity (bg-gray-50/50). */
const gray = (step: string) => `rgb(var(--gray-${step}) / <alpha-value>)`;

/**
 * Tailwind theme maps brand names to the CSS custom properties emitted by
 * packages/shared/src/branding.ts. No hex values live here — only var()
 * references — so branding.ts stays the single source of colour truth.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Slightly larger small print than Tailwind's 12px, for legibility.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.15rem' }],
      },
      colors: {
        gray: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => [
            s,
            gray(String(s)),
          ]),
        ),
        'resend-purple': 'var(--resend-purple)',
        'resend-lilac': 'var(--resend-lilac)',
        'resend-green': 'var(--resend-green)',
        'resend-ink': 'var(--resend-ink)',
        'status-amber': 'var(--status-amber)',
        'status-amber-text': 'var(--status-amber-text)',
      },
    },
  },
  plugins: [],
} satisfies Config;
