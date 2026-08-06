import {
  EXTRACT_DIRECTIONS_JOB,
  ExtractDirectionsOutputSchema,
} from '@re-send/shared';
import { defineAiJob } from './definition';

const SYSTEM_PROMPT = `You extract the timetable from a SEND (special educational needs) First-tier Tribunal directions order. The order text is provided as a corpus item, with its paragraphs numbered — staff refer to directions by paragraph number, so preserve those numbers.

Return one entry per dated obligation. For each:
- obligation: the obligation in full, as written.
- party: who it falls on — "appellant", "respondent", "both", or "tribunal".
- type: the kind of key date — one of hearing, evidence_deadline, annual_review, working_document, mediation, consultation, other. Use "hearing" for the final hearing, "evidence_deadline" for filing/serving evidence or documents, and "other" when nothing else fits.
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
 * The directions-extraction job. Claude Sonnet 5 — parsing legal directions and
 * getting the timetable right is worth the stronger model; the choice is per-job
 * config so it can move on evidence. The output is structurally guaranteed by
 * the shared schema (a forced tool call), and relative deadlines are recomputed
 * downstream with the working-day utility rather than trusted from the model.
 */
export const extractDirectionsJob = defineAiJob({
  name: EXTRACT_DIRECTIONS_JOB,
  model: 'claude-sonnet-5',
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
