import { createHash } from 'node:crypto';
import { simpleParser, type AddressObject } from 'mailparser';
import MsgReaderModule from '@kenjiuno/msgreader';
import {
  EMAIL_INLINE_IMAGE_MIN_BYTES,
  normaliseMessageId,
} from '@re-send/shared';

/**
 * Turn the bytes of a filed email (.eml or Outlook .msg) into one normalised
 * shape. Pure with respect to the database: no reads, no writes, no logging —
 * the content is special category data about a child and never reaches a log.
 */

// msgreader is CommonJS. Under Node's ESM loader (how the API runs) the default
// import is the whole `exports` object, with the class on `.default`; bundlers
// and the test runner hand over the class itself. Accept either.
const MsgReader =
  (MsgReaderModule as unknown as { default?: typeof MsgReaderModule })
    .default ?? MsgReaderModule;
type MsgReader = InstanceType<typeof MsgReader>;

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ParsedEmail {
  /** Normalised Message-ID, or null when the file carries none. */
  messageId: string | null;
  /** Stable identity for de-duplication: the Message-ID, else a content hash. */
  dedupKey: string;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  sentAt: Date | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: ParsedAttachment[];
}

export class EmailParseError extends Error {}

export function looksLikeMsg(filename: string, bytes: Buffer): boolean {
  // Outlook .msg is an OLE compound file: it starts with D0 CF 11 E0 A1 B1 1A E1.
  const ole =
    bytes.length >= 8 &&
    bytes.readUInt32BE(0) === 0xd0cf11e0 &&
    bytes.readUInt32BE(4) === 0xa1b11ae1;
  return ole || filename.toLowerCase().endsWith('.msg');
}

export async function parseEmailFile(
  filename: string,
  bytes: Buffer,
): Promise<ParsedEmail> {
  if (bytes.length === 0) throw new EmailParseError('The file is empty.');
  const parsed = looksLikeMsg(filename, bytes)
    ? parseMsg(bytes)
    : await parseEml(bytes);
  return { ...parsed, dedupKey: dedupKeyFor(parsed) };
}

type WithoutKey = Omit<ParsedEmail, 'dedupKey'>;

/**
 * The same email exported twice (or by two people, as .eml and .msg) shares a
 * Message-ID. When there is none, fall back to a hash of what identifies the
 * message — sender, send time, subject and body — never of the file bytes,
 * which differ between export formats.
 */
export function dedupKeyFor(email: WithoutKey): string {
  if (email.messageId) return `mid:${email.messageId}`;
  const hash = createHash('sha256')
    .update(
      [
        (email.fromAddress ?? '').toLowerCase(),
        email.sentAt?.toISOString() ?? '',
        email.subject ?? '',
        (email.bodyText ?? '').replace(/\s+/g, ' ').trim(),
      ].join('\u0000'),
    )
    .digest('hex');
  return `sha:${hash}`;
}

// --- .eml -------------------------------------------------------------------

async function parseEml(bytes: Buffer): Promise<WithoutKey> {
  // Reject things that are plainly not an email (e.g. a PDF renamed .eml)
  // rather than filing an empty record.
  const head = bytes.subarray(0, 8192).toString('latin1');
  if (!/^[A-Za-z-]+:/m.test(head)) {
    throw new EmailParseError('This file does not look like an email.');
  }
  const mail = await simpleParser(bytes, {
    skipImageLinks: true,
    skipTextLinks: true,
  });
  const from = mail.from?.value[0];
  const attachments: ParsedAttachment[] = [];
  for (const a of mail.attachments) {
    // Inline (cid-referenced) images are usually signature logos; keep only
    // the ones big enough to be content in their own right.
    const inline = a.related || a.contentDisposition === 'inline';
    if (
      inline &&
      a.contentType.startsWith('image/') &&
      a.size < EMAIL_INLINE_IMAGE_MIN_BYTES
    ) {
      continue;
    }
    attachments.push({
      filename: a.filename?.trim() || defaultName(a.contentType),
      mimeType: a.contentType || 'application/octet-stream',
      bytes: a.content,
    });
  }
  const bodyText =
    mail.text?.trim() || (mail.html ? htmlToText(mail.html) : '') || null;
  const sentAt =
    mail.date && !Number.isNaN(mail.date.getTime()) ? mail.date : null;
  if (!mail.subject && !from && !bodyText && attachments.length === 0) {
    throw new EmailParseError('This file does not look like an email.');
  }
  return {
    messageId: normaliseMessageId(mail.messageId),
    subject: mail.subject?.trim() || null,
    fromName: from?.name?.trim() || null,
    fromAddress: from?.address?.trim().toLowerCase() || null,
    toAddresses: addresses(mail.to),
    ccAddresses: addresses(mail.cc),
    sentAt,
    bodyText,
    bodyHtml: mail.html || null,
    attachments,
  };
}

function addresses(
  field: AddressObject | AddressObject[] | undefined,
): string[] {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  return list
    .flatMap((group) => flattenAddresses(group.value))
    .filter((a): a is string => Boolean(a));
}

function flattenAddresses(
  values: AddressObject['value'],
): (string | undefined)[] {
  return values.flatMap((v) =>
    v.group ? flattenAddresses(v.group) : [v.address?.trim().toLowerCase()],
  );
}

// --- .msg -------------------------------------------------------------------

function parseMsg(bytes: Buffer): WithoutKey {
  let reader: MsgReader;
  let data: ReturnType<MsgReader['getFileData']>;
  try {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    reader = new MsgReader(copy);
    data = reader.getFileData();
  } catch {
    throw new EmailParseError('This Outlook file could not be read.');
  }
  if (data.error) {
    throw new EmailParseError('This Outlook file could not be read.');
  }

  const headers = data.headers ?? '';
  const header = (name: string) =>
    headers
      .match(new RegExp(`^${name}:[ \\t]*(.+(?:\\r?\\n[ \\t]+.+)*)`, 'im'))?.[1]
      ?.replace(/\r?\n[ \t]+/g, ' ')
      .trim() ?? null;

  const recipients = data.recipients ?? [];
  const recipient = (r: (typeof recipients)[number]) =>
    smtp(r.smtpAddress) ?? smtp(r.email);
  const to = recipients
    .filter((r) => (r.recipType ?? 'to') === 'to')
    .map(recipient)
    .filter((a): a is string => a !== null);
  const cc = recipients
    .filter((r) => r.recipType === 'cc')
    .map(recipient)
    .filter((a): a is string => a !== null);

  const attachments: ParsedAttachment[] = [];
  for (const att of data.attachments ?? []) {
    if (att.attachmentHidden && !att.innerMsgContent) continue;
    try {
      const got = reader.getAttachment(att);
      const content = Buffer.from(got.content);
      const mimeType = att.attachMimeTag || mimeFromName(got.fileName);
      if (
        att.pidContentId &&
        mimeType.startsWith('image/') &&
        content.length < EMAIL_INLINE_IMAGE_MIN_BYTES
      ) {
        continue;
      }
      attachments.push({
        filename: got.fileName?.trim() || defaultName(mimeType),
        mimeType,
        bytes: content,
      });
    } catch {
      // An unreadable attachment does not stop the email being filed.
    }
  }

  const sent =
    data.clientSubmitTime ?? data.messageDeliveryTime ?? header('Date');
  const sentAt = sent ? new Date(sent) : null;
  const bodyText =
    data.body?.trim() ||
    (data.bodyHtml ? htmlToText(data.bodyHtml) : '') ||
    null;

  return {
    messageId: normaliseMessageId(header('Message-ID')),
    subject: data.subject?.trim() || null,
    fromName: data.senderName?.trim() || null,
    fromAddress:
      smtp(data.senderSmtpAddress) ??
      smtp(data.senderEmail) ??
      smtp(header('From')?.match(/<([^>]+)>/)?.[1] ?? header('From')),
    toAddresses: to,
    ccAddresses: cc,
    sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
    bodyText,
    bodyHtml: data.bodyHtml ?? null,
    attachments,
  };
}

/** Exchange stores internal senders as X.500 paths; keep only real SMTP addresses. */
function smtp(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  return v && /^[^\s@/]+@[^\s@]+$/.test(v) ? v : null;
}

// --- helpers ----------------------------------------------------------------

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

function mimeFromName(name: string | undefined): string {
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function defaultName(mimeType: string): string {
  const ext = Object.entries(EXT_MIME).find(([, m]) => m === mimeType)?.[0];
  return ext ? `attachment.${ext}` : 'attachment';
}

/** Plain text from an HTML body — for display and the corpus only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
