import { describe, expect, it } from 'vitest';
import { runIntakeEval } from './intake-eval';

// The eval calls the real model, so it is gated: set RUN_INTAKE_EVAL=1 with an
// API key configured. It exists so the model choice for extract_intake can be
// revisited on evidence — run it, read the per-field report, then decide.
const run =
  process.env.RUN_INTAKE_EVAL && process.env.ANTHROPIC_API_KEY
    ? describe
    : describe.skip;

run('intake extraction eval (10 anonymised submissions)', () => {
  it('extracts the core fields accurately', async () => {
    const report = await runIntakeEval();
    for (const c of report.cases) {
      const misses = c.fields.filter((f) => !f.correct);
      console.log(
        `${c.file}: ${c.correct}/${c.total}` +
          (misses.length
            ? ' — ' +
              misses
                .map(
                  (m) => `${m.field}=${m.got ?? 'null'} (want ${m.expected})`,
                )
                .join(', ')
            : ''),
      );
    }
    console.log(`Field accuracy: ${(report.fieldAccuracy * 100).toFixed(1)}%`);
    // A low bar the current model clears comfortably; tighten as evidence grows.
    expect(report.fieldAccuracy).toBeGreaterThan(0.7);
  }, 120_000);
});
