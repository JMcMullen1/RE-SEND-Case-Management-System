/**
 * Test fixtures: build realistic .eml and Outlook .msg files in memory, so the
 * parser and filing tests run without checked-in binaries. Fictional people
 * and addresses only.
 */
import { burn, type Entry } from '@kenjiuno/msgreader/lib/Burner.js';

// CFBF entry types (msgreader's TypeEnum, which is not re-exported as a value).
const ROOT = 5 as Entry['type'];
const DIRECTORY = 1 as Entry['type'];
const DOCUMENT = 2 as Entry['type'];

export function buildEml(opts: {
  messageId?: string | null;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;
  body?: string;
  attachment?: { filename: string; mimeType: string; content: Buffer };
  inlineLogo?: boolean;
}): Buffer {
  const boundary = 'b1_resend_test';
  const headers = [
    opts.from !== undefined
      ? `From: ${opts.from}`
      : 'From: Sam Parent <sam.parent@example.org>',
    `To: ${opts.to ?? 'Casework <casework@resend.test>'}`,
    opts.cc ? `Cc: ${opts.cc}` : null,
    `Subject: ${opts.subject ?? 'EHCP draft comments'}`,
    `Date: ${opts.date ?? 'Wed, 01 Oct 2025 09:30:00 +0100'}`,
    opts.messageId === null
      ? null
      : `Message-ID: ${opts.messageId ?? '<abc123@example.org>'}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);
  const body = opts.body ?? 'Hello,\r\nPlease find the report attached.\r\nSam';
  if (!opts.attachment && !opts.inlineLogo) {
    return Buffer.from(
      [
        ...headers,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
        '',
      ].join('\r\n'),
    );
  }
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  if (opts.attachment) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${opts.attachment.mimeType}; name="${opts.attachment.filename}"`,
      `Content-Disposition: attachment; filename="${opts.attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      opts.attachment.content.toString('base64'),
    );
  }
  if (opts.inlineLogo) {
    parts.push(
      `--${boundary}`,
      'Content-Type: image/png; name="logo.png"',
      'Content-Disposition: inline; filename="logo.png"',
      'Content-ID: <logo@sig>',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.alloc(300, 1).toString('base64'),
    );
  }
  parts.push(`--${boundary}--`, '');
  return Buffer.from(
    [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join('\r\n'),
  );
}

const utf16 = (s: string) => Buffer.from(s, 'utf16le');

/** One fixed-length property record for a __properties_version1.0 stream. */
function prop(tag: number, value: Buffer): Buffer {
  const rec = Buffer.alloc(16);
  rec.writeUInt32LE(tag, 0);
  rec.writeUInt32LE(0x6, 4); // readable | writable
  value.copy(rec, 8, 0, 8);
  return rec;
}

function fileTime(date: Date): Buffer {
  const ticks = BigInt(date.getTime()) * 10000n + 116444736000000000n;
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(ticks);
  return b;
}

function int32(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeInt32LE(n);
  return b;
}

/** Build a minimal but genuine Outlook .msg (CFBF) file. */
export function buildMsg(opts: {
  subject: string;
  senderName: string;
  senderSmtp: string;
  body: string;
  sent: Date;
  messageId?: string;
  to: { name: string; smtp: string }[];
  cc?: { name: string; smtp: string }[];
  attachment?: { filename: string; mimeType: string; content: Buffer };
}): Buffer {
  const entries: Entry[] = [
    { name: 'Root Entry', type: ROOT, length: 0, children: [] },
  ];
  const doc = (parent: number, name: string, data: Buffer) => {
    entries.push({
      name,
      type: DOCUMENT,
      length: data.length,
      // A fresh array: the burner ignores the byteOffset of pooled Buffers.
      binaryProvider: () => Uint8Array.from(data),
    });
    entries[parent]!.children!.push(entries.length - 1);
  };
  /** MSG sub-storage names: a prefix, then the index as 8 upper-case hex digits. */
  const indexed = (prefix: string, i: number) =>
    `${prefix}_#${i.toString(16).padStart(8, '0').toUpperCase()}`;
  const dir = (parent: number, name: string) => {
    entries.push({ name, type: DIRECTORY, length: 0, children: [] });
    entries[parent]!.children!.push(entries.length - 1);
    return entries.length - 1;
  };

  doc(0, '__substg1.0_0037001F', utf16(opts.subject));
  doc(0, '__substg1.0_0C1A001F', utf16(opts.senderName));
  doc(0, '__substg1.0_5D01001F', utf16(opts.senderSmtp));
  doc(0, '__substg1.0_1000001F', utf16(opts.body));
  if (opts.messageId) {
    doc(
      0,
      '__substg1.0_007D001F',
      utf16(`Message-ID: ${opts.messageId}\r\nSubject: ${opts.subject}\r\n`),
    );
  }
  doc(
    0,
    '__properties_version1.0',
    Buffer.concat([Buffer.alloc(32), prop(0x00390040, fileTime(opts.sent))]),
  );

  const recips = [
    ...opts.to.map((r) => ({ ...r, type: 1 })),
    ...(opts.cc ?? []).map((r) => ({ ...r, type: 2 })),
  ];
  recips.forEach((r, i) => {
    const d = dir(0, indexed('__recip_version1.0', i));
    doc(d, '__substg1.0_3001001F', utf16(r.name));
    doc(d, '__substg1.0_39FE001F', utf16(r.smtp));
    doc(
      d,
      '__properties_version1.0',
      Buffer.concat([Buffer.alloc(8), prop(0x0c150003, int32(r.type))]),
    );
  });

  if (opts.attachment) {
    const d = dir(0, indexed('__attach_version1.0', 0));
    doc(d, '__substg1.0_3707001F', utf16(opts.attachment.filename));
    doc(d, '__substg1.0_370E001F', utf16(opts.attachment.mimeType));
    doc(d, '__substg1.0_37010102', opts.attachment.content);
    doc(d, '__properties_version1.0', Buffer.alloc(8));
  }

  return Buffer.from(burn(entries));
}
