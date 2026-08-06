import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import branding from './tools/eslint-rules/no-hex-color.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      branding,
    },
    rules: {
      'branding/no-hex-color': 'error',
      // TypeScript performs undefined-symbol checking; the core rule only
      // produces false positives on DOM/Node globals here.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The single home of brand colour values.
    files: ['packages/shared/src/branding.ts'],
    rules: {
      'branding/no-hex-color': 'off',
    },
  },
  prettier,
);
