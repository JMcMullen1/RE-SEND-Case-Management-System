/**
 * email-matching.ts — which case an email belongs to, worked out from what the
 * system already holds about each case: its reference and appeal number (in
 * the subject or text), the client's email address (among the people the
 * email is between), the child's and client's full names (in the subject or
 * text), and the school and LA contacts on the case.
 *
 * Pure: the API loads the cases and calls this. A confident, unambiguous match
 * to an open case is filed straight away; anything else waits for a person,
 * with the likely cases suggested.
 */

import {
  EMAIL_AUTO_FILE_MARGIN,
  EMAIL_AUTO_FILE_MIN_SCORE,
  EMAIL_MATCH_WEIGHTS,
  EMAIL_SUGGEST_MIN_SCORE,
  EMAIL_SUGGESTIONS_MAX,
  type EmailMatchReason,
} from './config';
import { inferEmailDirection } from './email';

/** What a case offers for matching. */
export interface MatchableCase {
  caseId: string;
  caseReference: string;
  appealNumber: string | null;
  /** Never filed to automatically (e.g. closed); still suggested. */
  noAutoFile: boolean;
  /** The client's, and any other parent's on the child, email addresses. */
  clientEmails: string[];
  clientNames: string[];
  /** The child's full name, and preferred name with the family name. */
  childNames: string[];
  schoolContactEmails: string[];
  laContactEmails: string[];
}

/** What an email offers for matching. */
export interface MatchableEmail {
  subject: string | null;
  bodyText: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
}

export interface CaseMatch {
  caseId: string;
  score: number;
  reasons: EmailMatchReason[];
}

export interface EmailMatchResult {
  /** The likeliest cases, best first (at most EMAIL_SUGGESTIONS_MAX). */
  matches: CaseMatch[];
  /** The case to file to without asking, or null to ask a person. */
  autoFileCaseId: string | null;
}

const EMAIL_IN_TEXT = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** The email addresses written in free text (e.g. an LA contact line). */
export function emailAddressesIn(text: string | null | undefined): string[] {
  return [...new Set((text ?? '').match(EMAIL_IN_TEXT) ?? [])].map((a) =>
    a.toLowerCase(),
  );
}

/** Lower-case words and digits only, single-spaced, padded for word search. */
function words(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // "Robin Doe’s" is about Robin Doe; "O’Brien" reads as "obrien".
    .replace(/[\u2019']s\b/g, '')
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/** Letters and digits only, for references and appeal numbers. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Whether a reference ("RS-2026-1001", "EH123/26/00042") is written in the
 * text as a whole: its letters and digits in order, with only a space, tab
 * or - / . _ between them (never a line break), and no letter or digit either
 * side — so "RS-2026-10012" is not RS-2026-1001.
 */
function mentionsReference(text: string, reference: string): boolean {
  const chars = compact(reference);
  if (chars.length < 6) return false;
  const pattern = chars.split('').join('[ \\t\\-/._]*');
  return new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, 'i').test(text);
}

/**
 * Whether a name is written in the text as whole words. Only names of two or
 * more words count: a first name alone ("Kit") would match far too much.
 */
function mentionsName(text: string, name: string): boolean {
  const n = words(name).trim();
  if (n.split(' ').length < 2) return false;
  return text.includes(` ${n} `);
}

/**
 * The names a person is likely to be written as: the full name, and first and
 * last name without the middle ones ("Robin James Doe" → "Robin Doe").
 */
export function nameForms(fullName: string | null | undefined): string[] {
  const parts = words(fullName ?? '')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (parts.length < 2) return [];
  const forms = [parts.join(' ')];
  if (parts.length > 2) forms.push(`${parts[0]} ${parts[parts.length - 1]}`);
  return forms;
}

/**
 * Score every case for this email and decide whether it can be filed without
 * asking. `staffAddresses` are left out of the people the email is between,
 * with the charity's own domain (see inferEmailDirection).
 */
export function matchEmailToCases(
  email: MatchableEmail,
  cases: readonly MatchableCase[],
  staffAddresses: readonly string[],
): EmailMatchResult {
  const text = words(`${email.subject ?? ''}\n${email.bodyText ?? ''}`);
  const raw = `${email.subject ?? ''}\n${email.bodyText ?? ''}`;
  // The people outside the charity the email is between.
  const people = new Set(
    [email.fromAddress, ...email.toAddresses, ...email.ccAddresses]
      .filter((a): a is string => Boolean(a))
      .map((a) => a.trim().toLowerCase())
      .filter((a) => inferEmailDirection(a, staffAddresses) === 'inbound'),
  );
  const between = (addresses: string[]) =>
    addresses.some((a) => people.has(a.trim().toLowerCase()));

  const scored: (CaseMatch & { noAutoFile: boolean })[] = [];
  for (const c of cases) {
    const reasons: EmailMatchReason[] = [];
    if (mentionsReference(raw, c.caseReference)) reasons.push('case_reference');
    if (c.appealNumber && mentionsReference(raw, c.appealNumber))
      reasons.push('appeal_number');
    if (between(c.clientEmails)) reasons.push('client_email');
    if (c.childNames.some((n) => mentionsName(text, n)))
      reasons.push('child_name');
    if (c.clientNames.some((n) => mentionsName(text, n)))
      reasons.push('client_name');
    if (between(c.schoolContactEmails)) reasons.push('school_contact');
    if (between(c.laContactEmails)) reasons.push('la_contact');
    if (!reasons.length) continue;
    const score = reasons.reduce((s, r) => s + EMAIL_MATCH_WEIGHTS[r], 0);
    if (score < EMAIL_SUGGEST_MIN_SCORE) continue;
    scored.push({ caseId: c.caseId, score, reasons, noAutoFile: c.noAutoFile });
  }
  // Best first; between equals, an open case before a closed one.
  scored.sort(
    (a, b) => b.score - a.score || Number(a.noAutoFile) - Number(b.noAutoFile),
  );

  const [best, next] = scored;
  const autoFileCaseId =
    best &&
    !best.noAutoFile &&
    best.score >= EMAIL_AUTO_FILE_MIN_SCORE &&
    (!next || best.score - next.score >= EMAIL_AUTO_FILE_MARGIN)
      ? best.caseId
      : null;

  return {
    matches: scored
      .slice(0, EMAIL_SUGGESTIONS_MAX)
      .map(({ caseId, score, reasons }) => ({ caseId, score, reasons })),
    autoFileCaseId,
  };
}

// --- Emails to file ------------------------------------------------------------

/** A suggested case, as the list of emails to file shows it. */
export interface EmailCaseSuggestion {
  caseId: string;
  caseReference: string;
  clientName: string | null;
  childName: string | null;
  closed: boolean;
  score: number;
  reasons: EmailMatchReason[];
}

/** An email waiting for someone to choose its case. */
export interface EmailInboxItem {
  id: string;
  filename: string;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  sentAt: string | null;
  addedAt: string;
  addedByName: string | null;
  suggestions: EmailCaseSuggestion[];
}

/** What happened to one email dropped in to be filed. */
export type EmailIntakeResult =
  | {
      outcome: 'filed' | 'duplicate';
      emailId: string;
      caseId: string;
      caseReference: string;
      /** Why it was filed there (empty when it was already on the case). */
      reasons: EmailMatchReason[];
    }
  | { outcome: 'queued'; item: EmailInboxItem }
  | { outcome: 'already_waiting'; itemId: string };
