/**
 * branding.ts — the single source of truth for RE-SEND brand identity.
 *
 * This is the ONLY file in the codebase permitted to contain hex colour
 * literals; the ESLint rule `branding/no-hex-color` fails the build on a hex
 * literal anywhere else. Everything else references these tokens or the CSS
 * custom properties emitted below.
 */

/** Product name shown in headers, page titles and the browser tab. */
export const PRODUCT_NAME = 'RE-SEND' as const;

/** Charity strapline shown alongside the product name. */
export const STRAPLINE = 'Advice and Advocacy Charity' as const;

/** Path to the logo asset, served from the web app's public root. */
export const LOGO_PATH = '/brand/re-send-logo.svg' as const;

/**
 * Brand colour palette. Each entry pairs the raw value (defined here, and only
 * here) with the CSS custom property name and a note on where it is used.
 */
export const BRAND_COLORS = {
  purple: '#67248C',
  lilac: '#8D678F',
  green: '#008037',
  ink: '#000000',
  statusAmber: '#C77700',
} as const;

export type BrandColorKey = keyof typeof BRAND_COLORS;

/** CSS custom property name for each brand colour. */
export const CSS_VAR_NAMES = {
  purple: '--resend-purple',
  lilac: '--resend-lilac',
  green: '--resend-green',
  ink: '--resend-ink',
  statusAmber: '--status-amber',
} as const satisfies Record<BrandColorKey, string>;

/** Human-readable role for each colour, documenting intended usage. */
export const BRAND_COLOR_ROLES = {
  purple: 'primary: headers, primary buttons, active nav',
  lilac: 'secondary: hover, muted accents',
  green: 'success',
  ink: 'body text',
  statusAmber: 'the only status colour in the interface',
} as const satisfies Record<BrandColorKey, string>;

/**
 * Emit the brand palette as a CSS `:root` block of custom properties. Injected
 * once at the top of the web app's global stylesheet.
 */
export function brandingCss(): string {
  const declarations = (Object.keys(BRAND_COLORS) as BrandColorKey[])
    .map((key) => `  ${CSS_VAR_NAMES[key]}: ${BRAND_COLORS[key]};`)
    .join('\n');
  return `:root {\n${declarations}\n}\n`;
}
