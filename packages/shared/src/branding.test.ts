import { describe, expect, it } from 'vitest';
import {
  BRAND_COLORS,
  BRAND_COLOR_ROLES,
  CSS_VAR_NAMES,
  LOGO_PATH,
  PRODUCT_NAME,
  STRAPLINE,
  brandingCss,
} from './branding';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('branding', () => {
  it('exposes product identity', () => {
    expect(PRODUCT_NAME).toBe('RE-SEND');
    expect(STRAPLINE).toBe('Advice and Advocacy Charity');
    expect(LOGO_PATH.startsWith('/')).toBe(true);
  });

  it('defines a six-digit hex value for every colour', () => {
    for (const value of Object.values(BRAND_COLORS)) {
      expect(value).toMatch(HEX);
    }
  });

  it('has a CSS variable name and a role for every colour', () => {
    for (const key of Object.keys(BRAND_COLORS)) {
      expect(CSS_VAR_NAMES).toHaveProperty(key);
      expect(BRAND_COLOR_ROLES).toHaveProperty(key);
    }
  });

  it('emits a :root block with one custom property per colour', () => {
    const css = brandingCss();
    expect(css.startsWith(':root {')).toBe(true);
    for (const varName of Object.values(CSS_VAR_NAMES)) {
      expect(css).toContain(`${varName}:`);
    }
  });
});
