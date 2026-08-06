/**
 * ESLint rule: forbid hex colour literals anywhere except branding.ts.
 *
 * Brand colours live in exactly one place — packages/shared/src/branding.ts.
 * Everything else must reference the branding tokens or the CSS custom
 * properties, never a raw hex value.
 */

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

/** @type {import('eslint').Rule.RuleModule} */
const noHexColor = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hex colour literals outside packages/shared/src/branding.ts',
    },
    schema: [],
    messages: {
      hex: 'Hex colour literals are only allowed in packages/shared/src/branding.ts. Reference the branding tokens or CSS custom properties instead.',
    },
  },
  create(context) {
    const check = (node, value) => {
      if (typeof value === 'string' && HEX_COLOR.test(value)) {
        context.report({ node, messageId: 'hex' });
      }
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default {
  rules: {
    'no-hex-color': noHexColor,
  },
};
