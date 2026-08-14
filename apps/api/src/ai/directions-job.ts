import {
  EXTRACT_DIRECTIONS_JOB,
  ExtractDirectionsOutputSchema,
} from '@re-send/shared';
import { defineAiJob } from './definition';

const SYSTEM_PROMPT = `You extract the timetable from a SEND (special educational needs) First-tier Tribunal directions order. The order is provided as a PDF document to read in full (and, when available, its extracted text alongside, with paragraphs numbered) — staff refer to directions by paragraph number, so preserve those numbers.

Return one entry per dated obligation. For each:
- obligation: the obligation in full, as written.
- party: who it falls on — "appellant", "respondent", "both", or "tribunal".
- category: the tribunal directions category — exactly one of "LA response to the Appeal" (the local authority/respondent filing its response to the appeal), "Final Evidence Deadline" (the deadline to file and serve final evidence), "Case Review Form" (filing the case review form), "Final Tribunal Bundle" (preparing/filing the final hearing bundle), "Case Management Review" (a case management review or telephone case management hearing), "Final Hearing" (the final hearing itself), or "Other" if the dated obligation is none of these. Choose the closest of the six named categories; use "Other" only when none genuinely fits.
- deadlineDate: the deadline as an absolute YYYY-MM-DD date. Compute it from the order where the order gives a relative deadline (for example "within 14 days of the date of this order"). If the obligation vacates or removes a date rather than setting one, set this to null.
- deadlineTime: a time of day as HH:MM if the order states one (for example "no later than 4pm" → "16:00"), otherwise null.
- rawDateText: the deadline exactly as written in the order (for example "within 14 days of the date of this order").
- workingDays: true only if the original deadline was expressed in working days.
- vacated: true if this obligation vacates, removes or discharges an existing date (for example "the hearing listed for 18 June is vacated").
- paragraph: the source paragraph number as an integer, or null if unnumbered.
- confidence: your confidence in this entry, 0 to 1.

Also return orderDate: the date the order itself was made, as YYYY-MM-DD, or null if not stated.

Extract only what the order states. Never invent a date. If a deadline is relative and you cannot find the date it is relative to, still return the obligation with your best deadlineDate and a lower confidence — the deadline is recomputed downstream from rawDateText.`;

/**
 * The directions-extraction job. Claude Haiku 4.5 — the same model the intake
 * extraction runs on, so it works on any key that can already run the query
 * form. The output is structurally guaranteed by the shared schema (a forced
 * tool call), and relative deadlines are recomputed downstream with the
 * working-day utility rather than trusted from the model, so the heavy lifting
 * does not rest on the model's arithmetic. Model choice is per-job config, so
 * it can move to a stronger model later without touching this pipeline.
 */
export const extractDirectionsJob = defineAiJob({
  name: EXTRACT_DIRECTIONS_JOB,
  model: 'claude-haiku-4-5',
  outputSchema: ExtractDirectionsOutputSchema,
  systemPrompt: SYSTEM_PROMPT,
  toolDescription:
    'Record the directions extracted from the order: the order date and one entry per dated obligation.',
  // A real directions order can carry dozens of numbered obligations, each
  // returned in full — the structured result routinely exceeds a 4k output
  // budget and would be truncated mid-JSON (surfacing as an unreadable order).
  // Output is billed per token actually generated, so a higher ceiling only
  // prevents truncation; it does not raise the cost of a short order.
  maxTokens: 16384,
});
