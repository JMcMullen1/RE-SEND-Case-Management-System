/**
 * branding.ts — the single source of truth for RE-SEND brand identity.
 *
 * This is the ONLY file in the codebase permitted to contain hex colour
 * literals; the ESLint rule `branding/no-hex-color` fails the build on a hex
 * literal anywhere else. Everything else references these tokens or the CSS
 * custom properties emitted below.
 */

/** Product name shown in headers, page titles and the browser tab. */
export const PRODUCT_NAME = 'reSEND' as const;

/** Charity strapline shown alongside the product name. */
export const STRAPLINE = 'Advice and Advocacy Charity' as const;

/** Path to the logo asset, served from the web app's public root. */
export const LOGO_PATH = '/brand/re-send-logo.png' as const;

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
  // The status amber, darkened for text: #C77700 is 3.2:1 on white, below the
  // WCAG AA 4.5:1 that small text needs. Use this for amber words (errors,
  // Delete / Remove links); keep statusAmber for fills, borders and chips.
  statusAmberText: '#9A5B00',
} as const;

export type BrandColorKey = keyof typeof BRAND_COLORS;

/** CSS custom property name for each brand colour. */
export const CSS_VAR_NAMES = {
  purple: '--resend-purple',
  lilac: '--resend-lilac',
  green: '--resend-green',
  ink: '--resend-ink',
  statusAmber: '--status-amber',
  statusAmberText: '--status-amber-text',
} as const satisfies Record<BrandColorKey, string>;

/** Human-readable role for each colour, documenting intended usage. */
export const BRAND_COLOR_ROLES = {
  purple: 'primary: headers, primary buttons, active nav',
  lilac: 'secondary: hover, muted accents',
  green: 'success',
  ink: 'body text',
  statusAmber: 'the only status colour in the interface',
  statusAmberText: 'the status colour as text (meets WCAG AA on white)',
} as const satisfies Record<BrandColorKey, string>;

/**
 * Categorical palette for key-date types on the shared calendar. These are not
 * brand colours and carry no status meaning; they are a fixed, distinguishable
 * hue per key-date type so the calendar can colour-code at a glance. They live
 * here because this file is the only home permitted for hex literals — the
 * type→colour *mapping* lives in `config.ts`, which references the CSS custom
 * properties emitted below (`--kd-<type>`), never the raw values.
 */
export const KEY_DATE_TYPE_COLORS = {
  hearing: '#67248C',
  evidence_deadline: '#C77700',
  annual_review: '#008037',
  working_document: '#0F766E',
  mediation: '#1D4ED8',
  consultation: '#8D678F',
  other: '#475569',
} as const;

export type KeyDateTypeColorKey = keyof typeof KEY_DATE_TYPE_COLORS;

/** CSS custom property name for each key-date-type colour. */
export function keyDateTypeCssVarName(type: KeyDateTypeColorKey): string {
  return `--kd-${type.replace(/_/g, '-')}`;
}

/**
 * The neutral greys of the interface — secondary text, labels, borders,
 * dividers and panel backgrounds — used through Tailwind's `gray-*` classes.
 * Darker than Tailwind's defaults so the interface reads crisply: every text
 * step from 400 up meets WCAG AA (4.5:1) on white, and borders and dividers
 * are visible on any screen. `placeholder` is for input placeholders, kept
 * lighter than typed text so the two are never confused.
 */
export const NEUTRAL_COLORS = {
  50: '#F6F7F9',
  100: '#ECEEF1',
  200: '#D3D7DD',
  300: '#B4BAC3',
  400: '#626A76',
  500: '#4A515C',
  600: '#373D47',
  700: '#262B33',
  800: '#171A20',
  900: '#0B0D11',
  placeholder: '#7B828D',
} as const;

export type NeutralColorKey = keyof typeof NEUTRAL_COLORS;

/** CSS custom property for a neutral, holding its RGB channels ("98 106 118"). */
export function neutralCssVarName(key: NeutralColorKey): string {
  return `--gray-${key}`;
}

/** "#626A76" → "98 106 118", for colours used with an opacity (bg-gray-50/50). */
function rgbChannels(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * Emit the brand palette and the calendar key-date-type palette as a CSS
 * `:root` block of custom properties. Injected once at the top of the web app's
 * global stylesheet.
 */
export function brandingCss(): string {
  const brand = (Object.keys(BRAND_COLORS) as BrandColorKey[])
    .map((key) => `  ${CSS_VAR_NAMES[key]}: ${BRAND_COLORS[key]};`)
    .join('\n');
  const keyDate = (Object.keys(KEY_DATE_TYPE_COLORS) as KeyDateTypeColorKey[])
    .map(
      (key) => `  ${keyDateTypeCssVarName(key)}: ${KEY_DATE_TYPE_COLORS[key]};`,
    )
    .join('\n');
  const neutral = (Object.keys(NEUTRAL_COLORS) as NeutralColorKey[])
    .map(
      (key) =>
        `  ${neutralCssVarName(key)}: ${rgbChannels(NEUTRAL_COLORS[key])};`,
    )
    .join('\n');
  return `:root {\n${brand}\n${keyDate}\n${neutral}\n}\n`;
}
