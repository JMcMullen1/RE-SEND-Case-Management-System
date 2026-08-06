import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntakeResult } from '@re-send/shared';
import { runIntakeExtraction } from '../../intake';
import { extractIntakeJob } from '../../intake-job';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBMISSIONS = join(HERE, 'submissions');

export interface FieldScore {
  field: string;
  expected: string;
  got: string | null;
  correct: boolean;
}

export interface CaseScore {
  file: string;
  fields: FieldScore[];
  correct: number;
  total: number;
}

export interface EvalReport {
  cases: CaseScore[];
  fieldAccuracy: number;
  model: string;
}

type Expected = Record<string, Record<string, string>>;

function valueAt(result: IntakeResult, path: string): string | null {
  const [section, key] = path.split('.') as [
    'client' | 'child' | 'case',
    string,
  ];
  return result[section]?.[key]?.value ?? null;
}

/**
 * Run every fixture through the real intake extraction and score it against the
 * expected values. Requires a configured API key. This is the evidence for the
 * model choice — run it, compare models, then set the model on extractIntakeJob.
 */
export async function runIntakeEval(): Promise<EvalReport> {
  const expected = JSON.parse(
    readFileSync(join(HERE, 'expected.json'), 'utf8'),
  ) as Expected;

  const cases: CaseScore[] = [];
  for (const file of readdirSync(SUBMISSIONS).sort()) {
    const truth = expected[file];
    if (!truth) continue;
    const bytes = readFileSync(join(SUBMISSIONS, file));
    const source = truth.source === 'email' ? 'email' : 'form';
    const result = await runIntakeExtraction({
      bytes,
      filename: file,
      mimeType: 'text/plain',
      source,
    });
    const fields: FieldScore[] = [];
    for (const [field, exp] of Object.entries(truth)) {
      if (field === 'source') continue;
      const got = valueAt(result, field);
      fields.push({ field, expected: exp, got, correct: got === exp });
    }
    cases.push({
      file,
      fields,
      correct: fields.filter((f) => f.correct).length,
      total: fields.length,
    });
  }

  const totalFields = cases.reduce((s, c) => s + c.total, 0);
  const correctFields = cases.reduce((s, c) => s + c.correct, 0);
  return {
    cases,
    fieldAccuracy: totalFields ? correctFields / totalFields : 0,
    model: extractIntakeJob.model,
  };
}
