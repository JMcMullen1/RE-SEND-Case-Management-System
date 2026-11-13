/**
 * email.ts — filed correspondence: the shapes the API returns and the pure
 * rules behind filing (which files are emails, which way an email went, how
 * the same email is recognised twice, and how it reads in the case corpus).
 *
 * Parsing the bytes of a .eml or .msg is server-only; everything here is pure
 * so both apps share one definition and it is tested directly.
 */

import {
  EMAIL_FILE_EXTENSIONS,
  EMAIL_PUBLIC_DOMAINS,
  type EmailDirection,
} from './config';

/** An attachment filed from an email, as a case document. */
export interface EmailAttachmentInfo {
  /** The case document the attachment was filed as. */
  documentId: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  /** Folder the document sits in now (it may have been moved since filing). */
  category: string;
}

/** One filed email, as the case screen shows it. */
export interface EmailInfo {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  /** When the email was sent (ISO timestamp), or null if the file carries none. */
  sentAt: string | null;
  direction: EmailDirection;
  /** Plain-text body. HTML is stored but never rendered, so nothing executes. */
  bodyText: string | null;
  attachments: EmailAttachmentInfo[];
  filedByName: string | null;
  filedAt: string;
  /** The original .eml/.msg as filed, for download. */
  rawDocumentId: string | null;
}

/**
 * The result of filing one file as an email. `duplicate` means the same email
 * is already on the case (filed by anyone, as .eml or .msg) — nothing new was
 * stored and `email` is the existing record.
 */
export type EmailFileOutcome = 'created' | 'duplicate';

export interface EmailFileResult {
  email: EmailInfo;
  outcome: EmailFileOutcome;
}

/** True when a dropped file should be filed as an email rather than a document. */
export function isEmailFile(filename: string, mimeType = ''): boolean {
  const name = filename.toLowerCase();
  if (EMAIL_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  const type = mimeType.split(';')[0]!.trim().toLowerCase();
  return type === 'message/rfc822' || type === 'application/vnd.ms-outlook';
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

/**
 * Sent by staff → outbound; anything else → inbound. A sender counts as staff
 * when their address is a staff account's address, or when it shares the
 * domain of a staff account and that domain is not a public mail provider (so
 * the charity's shared mailboxes count, but a parent on gmail.com never does).
 */
export function inferEmailDirection(
  fromAddress: string | null,
  staffAddresses: readonly string[],
): EmailDirection {
  if (!fromAddress) return 'inbound';
  const from = fromAddress.trim().toLowerCase();
  const staff = staffAddresses.map((a) => a.trim().toLowerCase());
  if (staff.includes(from)) return 'outbound';
  const domain = domainOf(from);
  if (!domain || (EMAIL_PUBLIC_DOMAINS as readonly string[]).includes(domain))
    return 'inbound';
  return staff.some((a) => domainOf(a) === domain) ? 'outbound' : 'inbound';
}

/**
 * Normalise an RFC 5322 Message-ID so the same email exported by two people
 * (one as .eml, one as .msg) compares equal: angle brackets and surrounding
 * whitespace removed, lower-cased. Returns null for an empty id.
 */
export function normaliseMessageId(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const id = raw.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
  return id ? id.toLowerCase() : null;
}

/** Render a filed email as corpus text: the headers a reader needs, then the body. */
export function renderEmailText(email: {
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddresses: readonly string[];
  ccAddresses: readonly string[];
  sentAt: string | null;
  direction: EmailDirection;
  bodyText: string | null;
  attachmentNames: readonly string[];
}): string {
  const from = [
    email.fromName,
    email.fromAddress ? `<${email.fromAddress}>` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [
    `Direction: ${email.direction === 'outbound' ? 'sent by staff' : 'received'}`,
    from ? `From: ${from}` : null,
    email.toAddresses.length ? `To: ${email.toAddresses.join(', ')}` : null,
    email.ccAddresses.length ? `Cc: ${email.ccAddresses.join(', ')}` : null,
    email.sentAt ? `Sent: ${email.sentAt}` : null,
    `Subject: ${email.subject ?? '(no subject)'}`,
    email.attachmentNames.length
      ? `Attachments: ${email.attachmentNames.join(', ')}`
      : null,
  ].filter((l): l is string => l !== null);
  return [...lines, '', (email.bodyText ?? '').trim()].join('\n').trim();
}
