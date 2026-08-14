import { z } from 'zod';
import {
  EXTRACT_INTAKE_JOB,
  INTAKE_EMAIL_METHOD,
  KeyDateTypeSchema,
  QueryTypeSchema,
  suggestSchoolYear,
  WorkTypeSchema,
  type IntakeFieldValue,
  type IntakeKeyDate,
  type IntakeMiss,
  type IntakeRef,
  type IntakeResult,
} from '@re-send/shared';
import { defineAiJob } from './definition';

/**
 * A single extracted field: a value with a confidence, or null with a reason.
 * Never a guess — the contract is that `value` is non-null only when the field
 * was actually present in the submission.
 */
/** A field the model did not return, or returned in an unusable shape. */
const ABSENT = { value: null, confidence: null, reason: null };

function field<T extends z.ZodTypeAny>(value: T) {
  // Fully tolerant of an imperfect model response so that ONE bad or missing
  // field can never fail the whole extraction (the rest of the form still
  // fills; the odd field is left blank to complete by hand):
  //   - a malformed value (a near-miss vocabulary code, or "yes" where a
  //     boolean is expected) falls back to null;
  //   - a missing inner key (confidence/reason omitted) defaults to null;
  //   - a field that is not the expected object, or is omitted entirely,
  //     falls back to "absent".
  // The allowed vocabularies are still advertised to the model via the tool
  // schema, so this only rescues the exceptions.
  return z
    .object({
      value: value.nullable().catch(null).default(null),
      confidence: z.number().min(0).max(1).nullable().catch(null).default(null),
      reason: z.string().nullable().catch(null).default(null),
    })
    .catch(ABSENT)
    .default(ABSENT);
}

const str = () => field(z.string());
const bool = () => field(z.boolean());
const date = () => field(z.string());

/**
 * The structured output of extract_intake. Vocabulary fields use the config
 * enums so the model must map onto them rather than return free text.
 */
export const IntakeExtractionSchema = z.object({
  parentFullName: str(),
  parentDisplayName: str(),
  parentPreferredName: str(),
  contactPhone: str(),
  contactMobile: str(),
  email: str(),
  addressLine: str(),
  postcode: str(),
  parentAdditionalNeeds: str(),
  childFullName: str(),
  childPreferredName: str(),
  dateOfBirth: date(),
  schoolName: str(),
  schoolAddress: str(),
  sendNeeds: str(),
  serviceRequired: field(WorkTypeSchema),
  enquiryRoute: field(QueryTypeSchema),
  finalPlanReceived: bool(),
  finalPlanIssuedDate: date(),
  mediationStatus: str(),
  appealLodged: bool(),
  representationWanted: bool(),
  supportLevel: str(),
  aims: str(),
  consentDataProcessing: bool(),
  consentInformationSharing: bool(),
  consentContact: bool(),
  consentPrivacyNotice: bool(),
  paymentPlanRequired: bool(),
  keyDates: z
    .array(
      z
        .object({
          // A malformed entry becomes a blank placeholder that the mapping step
          // drops (it keeps only entries with an ISO date and a title), so one
          // odd entry can't fail the job.
          date: z.string().catch('').default(''),
          title: z.string().catch('').default(''),
          type: KeyDateTypeSchema.catch('other').default('other'),
          confidence: z.number().min(0).max(1).catch(0.5).default(0.5),
        })
        .catch({ date: '', title: '', type: 'other', confidence: 0.5 }),
    )
    // A malformed or missing array becomes no key dates rather than a failure.
    .catch([])
    .default([]),
});

export type IntakeExtraction = z.infer<typeof IntakeExtractionSchema>;

const SYSTEM_PROMPT = `You extract structured intake details from a single SEND advice-and-advocacy enquiry — a JotForm query-form submission or a plain enquiry email. A PDF form is provided as a document to read directly; its extracted text may also be provided alongside for exact spellings.

Rules:
- For every field, either return a value with a confidence from 0 to 1, or return value null with a short reason (for example "not present in the form"). NEVER guess — if a field is not clearly stated, return null with a reason.
- Many questions are multiple-choice (radio buttons or checkboxes). The answer is ONLY the option the applicant actually selected — shown in the PDF by a filled/ticked control or a highlighted choice. Do not treat the mere presence of an option in the list as a selection; if you cannot tell which option was chosen, return null with a reason rather than guessing. Read selections from the PDF's visual state, not from the flattened text, which lists every option unmarked.
- Dates must be ISO YYYY-MM-DD. If only a partial date is given, return null with a reason.
- For fields with an allowed set of values, choose the closest allowed value; if none fits, return null with a reason.
- Consents are booleans: true only where the person has clearly agreed (a ticked box, "I agree", "yes"). If a consent is not addressed, return null with a reason — do not assume false.
- keyDates: list any dated deadlines or events the enquiry implies (hearing, evidence deadline, annual review, mediation, consultation, working document). Each needs an ISO date, a short title, a type and a confidence. Return an empty array if none.
- Do not infer school year or age; those are derived separately from the date of birth.`;

/**
 * The intake extraction job. Claude Haiku 4.5 by default — a labelled text form
 * is well within its reach, and the choice is per-job config so it can move on
 * the evidence of the evaluation set.
 */
export const extractIntakeJob = defineAiJob({
  name: EXTRACT_INTAKE_JOB,
  model: 'claude-haiku-4-5',
  outputSchema: IntakeExtractionSchema,
  systemPrompt: SYSTEM_PROMPT,
  toolDescription:
    'Record the fields extracted from the enquiry, each with a confidence or a reason for absence.',
  // Headroom over a form's structured output; output is billed per token
  // generated, so a larger ceiling only prevents truncation on a long form.
  maxTokens: 8192,
});

// --- Mapping onto the add-case form -----------------------------------------

type ExtractedField = {
  value: unknown;
  confidence: number | null;
  reason: string | null;
};

/**
 * Map the raw extraction onto the add-case form's fields: config vocabularies
 * for the coded fields, and school year / enquiry method derived rather than
 * extracted. Pure — no I/O — so it is straightforward to test.
 */
export function mapExtraction(
  raw: IntakeExtraction,
  opts: { source: 'form' | 'email'; today: string; ref: IntakeRef },
): IntakeResult {
  const missing: IntakeMiss[] = [];

  const take = (f: ExtractedField, label: string): IntakeFieldValue | null => {
    if (f.value === null || f.value === undefined || f.value === '') {
      if (f.reason) missing.push({ field: label, reason: f.reason });
      return null;
    }
    return { value: String(f.value), confidence: f.confidence ?? 0.5 };
  };

  const client: Record<string, IntakeFieldValue> = {};
  const child: Record<string, IntakeFieldValue> = {};
  const caseFields: Record<string, IntakeFieldValue> = {};
  const put = (
    target: Record<string, IntakeFieldValue>,
    key: string,
    f: ExtractedField,
    label: string,
  ) => {
    const v = take(f, label);
    if (v) target[key] = v;
  };

  put(client, 'fullName', raw.parentFullName, 'Parent full name');
  put(client, 'displayName', raw.parentDisplayName, 'Display name');
  put(client, 'preferredName', raw.parentPreferredName, 'Preferred name');
  put(client, 'phone', raw.contactPhone, 'Phone');
  put(client, 'mobile', raw.contactMobile, 'Mobile');
  put(client, 'email', raw.email, 'Email');
  put(client, 'streetAddress', raw.addressLine, 'Address');
  put(client, 'postcode', raw.postcode, 'Postcode');
  put(
    client,
    'additionalNeeds',
    raw.parentAdditionalNeeds,
    'Parent additional needs',
  );
  put(
    client,
    'consentDataProcessing',
    raw.consentDataProcessing,
    'Data-processing consent',
  );
  put(
    client,
    'consentInformationSharing',
    raw.consentInformationSharing,
    'Information-sharing consent',
  );
  put(client, 'consentContact', raw.consentContact, 'Contact consent');
  put(
    client,
    'consentPrivacyNotice',
    raw.consentPrivacyNotice,
    'Privacy-notice consent',
  );
  put(
    client,
    'paymentPlanRequired',
    raw.paymentPlanRequired,
    'Payment plan required',
  );

  put(child, 'fullName', raw.childFullName, "Child's full name");
  put(child, 'preferredName', raw.childPreferredName, "Child's preferred name");
  put(child, 'dateOfBirth', raw.dateOfBirth, 'Date of birth');
  put(child, 'currentSchoolName', raw.schoolName, 'School name');
  put(child, 'currentSchoolAddress', raw.schoolAddress, 'School address');
  put(child, 'sendNeeds', raw.sendNeeds, 'SEND needs');

  put(caseFields, 'currentWork', raw.serviceRequired, 'Service required');
  put(caseFields, 'originalQuery', raw.enquiryRoute, 'Enquiry route');
  put(caseFields, 'supportLevel', raw.supportLevel, 'Support level');
  put(caseFields, 'aims', raw.aims, 'Aims');
  put(
    caseFields,
    'finalPlanReceived',
    raw.finalPlanReceived,
    'Final plan received',
  );
  put(
    caseFields,
    'finalPlanIssuedDate',
    raw.finalPlanIssuedDate,
    'Final plan issued date',
  );
  put(caseFields, 'mediationStatus', raw.mediationStatus, 'Mediation status');
  put(caseFields, 'appealLodged', raw.appealLodged, 'Appeal lodged');
  put(
    caseFields,
    'representationWanted',
    raw.representationWanted,
    'Representation wanted',
  );

  // Derived: enquiry method from the known source (certain, not a guess).
  caseFields.methodOfEnquiry = {
    value: opts.source === 'form' ? 'Query Form' : INTAKE_EMAIL_METHOD,
    confidence: 1,
  };

  // Derived: school year from date of birth. Carry the source field's
  // confidence — a derivation is only as sure as its input.
  const dob = child.dateOfBirth;
  if (dob) {
    const year = suggestSchoolYear(dob.value, opts.today);
    if (year) child.schoolYear = { value: year, confidence: dob.confidence };
  }

  const keyDates: IntakeKeyDate[] = raw.keyDates
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.date) && k.title.trim())
    .map((k) => ({
      date: k.date,
      title: k.title.trim(),
      type: k.type,
      confidence: k.confidence,
    }));

  return {
    source: opts.source,
    client,
    child,
    case: caseFields,
    keyDates,
    missing,
    ref: opts.ref,
  };
}
