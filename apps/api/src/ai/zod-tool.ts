import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod output schema into an Anthropic tool. The model is forced to
 * call this tool, so its `input` is the job's structured output — guaranteed by
 * the schema, not scraped from prose. Refs are inlined because Anthropic tool
 * schemas do not support `$ref`, and recursion is unsupported anyway.
 */
export function schemaToTool(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;

  // The tool input schema must be an object at the top level so the model's
  // tool call maps directly onto the output; wrap a scalar output in an object.
  if (jsonSchema.type !== 'object') {
    throw new Error(
      `AI job output schema for tool "${name}" must be a Zod object`,
    );
  }

  return {
    name,
    description,
    input_schema: jsonSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Convert a Zod object schema into the JSON Schema used as a structured-output
 * response format (`output_config.format`). Refs are inlined; the top level
 * must be an object.
 */
export function schemaToJsonSchema(
  name: string,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
  if (jsonSchema.type !== 'object') {
    throw new Error(`AI job output schema for "${name}" must be a Zod object`);
  }
  delete jsonSchema.$schema;
  return jsonSchema;
}
