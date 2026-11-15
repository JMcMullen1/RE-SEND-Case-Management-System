import { describe, expect, it } from 'vitest';
import { TRIBUNAL_FORMS } from '@re-send/shared';
import { FORM_JOBS } from './drafting-job';
import { schemaToJsonSchema } from './zod-tool';

/** Every property listed as required and no extras, all the way down. */
function strict(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const s = schema as Record<string, unknown>;
  const problems: string[] = [];
  if (s.$ref) problems.push(`${path}: $ref`);
  if (s.type === 'object') {
    const props = Object.keys((s.properties as object) ?? {});
    const required = (s.required as string[]) ?? [];
    if (s.additionalProperties !== false)
      problems.push(`${path}: additional properties allowed`);
    for (const p of props)
      if (!required.includes(p)) problems.push(`${path}.${p}: not required`);
  }
  for (const [k, v] of Object.entries(s))
    if (v && typeof v === 'object')
      problems.push(
        ...(Array.isArray(v)
          ? v.flatMap((x, i) => strict(x, `${path}.${k}[${i}]`))
          : strict(v, `${path}.${k}`)),
      );
  return problems;
}

describe('Tribunal form drafting jobs', () => {
  it.each(Object.entries(FORM_JOBS))(
    '%s has a strict output schema and a prompt naming its form',
    (kind, job) => {
      expect(strict(schemaToJsonSchema(kind, job.outputSchema))).toEqual([]);
      const form = TRIBUNAL_FORMS[kind as keyof typeof TRIBUNAL_FORMS];
      expect(job.systemPrompt).toContain(`${form.code} form (${form.version})`);
      for (const s of form.sections.filter((x) => x.fill === 'model'))
        expect(job.systemPrompt).toContain(`- ${s.key} — `);
    },
  );
});
