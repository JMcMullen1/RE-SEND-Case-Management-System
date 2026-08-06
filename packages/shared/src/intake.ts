/**
 * intake.ts — the shape of a smart-filled add-case form.
 *
 * Smart fill prefills the *same* add-case form: these types carry the mapped,
 * form-facing values (already mapped onto config vocabularies and with school
 * year / enquiry method derived), each with a confidence so the UI can
 * flag low-confidence fields. Nothing here is written to the database — the form
 * is populated and the ordinary Create path takes over.
 */

/** A single prefilled field: the value as the form uses it, plus confidence. */
export interface IntakeFieldValue {
  /** Form value. Booleans are carried as 'true' / 'false'. */
  value: string;
  /** 0..1 model confidence, or 1 for values derived deterministically. */
  confidence: number;
}

/** A key date the form implied, created only when the user presses Create. */
export interface IntakeKeyDate {
  date: string;
  title: string;
  type: string;
  confidence: number;
}

/**
 * A reference to the original submission, already stored in object storage. It
 * is attached to the case as a document on Create — not before.
 */
export interface IntakeRef {
  storageKey: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

/** A field the model could not fill, with the reason it gave (never a guess). */
export interface IntakeMiss {
  field: string;
  reason: string;
}

/** The mapped result of a smart fill, keyed by add-case form field name. */
export interface IntakeResult {
  source: 'form' | 'email';
  client: Record<string, IntakeFieldValue>;
  child: Record<string, IntakeFieldValue>;
  case: Record<string, IntakeFieldValue>;
  keyDates: IntakeKeyDate[];
  missing: IntakeMiss[];
  ref: IntakeRef;
}

/**
 * The extract endpoint response. Smart fill can be switched off (globally or
 * per job) or fail; the form stays fully usable in every case, so failures are
 * a normal, typed outcome rather than an error the UI must special-case.
 */
export type IntakeResponse =
  | { status: 'ok'; result: IntakeResult }
  | { status: 'disabled' }
  | { status: 'refused' }
  | { status: 'error'; message: string };
