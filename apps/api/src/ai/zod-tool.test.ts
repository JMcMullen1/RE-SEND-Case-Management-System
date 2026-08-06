import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schemaToTool } from './zod-tool';

describe('schemaToTool', () => {
  it('turns a Zod object into a tool with an object input schema', () => {
    const schema = z.object({
      label: z.enum(['red', 'amber', 'green']),
      confidence: z.number(),
    });
    const tool = schemaToTool('record_status', 'Record status', schema);
    expect(tool.name).toBe('record_status');
    expect(tool.input_schema.type).toBe('object');
    const props = (tool.input_schema as { properties: Record<string, unknown> })
      .properties;
    expect(Object.keys(props)).toEqual(['label', 'confidence']);
  });

  it('rejects a non-object output schema', () => {
    expect(() => schemaToTool('t', 'd', z.string())).toThrow(
      /must be a Zod object/,
    );
  });
});
