import { describe, expect, it } from 'vitest';
import { buildEml, buildMsg } from './fixtures';
import { EmailParseError, htmlToText, parseEmailFile } from './parse';

const pdf = Buffer.from('%PDF-1.4 fictional report');

describe('parseEmailFile (.eml)', () => {
  it('reads headers, body and attachments', async () => {
    const email = await parseEmailFile(
      'comments.eml',
      buildEml({
        cc: 'SEN Team <sen@council.example>',
        attachment: {
          filename: 'report.pdf',
          mimeType: 'application/pdf',
          content: pdf,
        },
      }),
    );
    expect(email.messageId).toBe('abc123@example.org');
    expect(email.dedupKey).toBe('mid:abc123@example.org');
    expect(email.subject).toBe('EHCP draft comments');
    expect(email.fromName).toBe('Sam Parent');
    expect(email.fromAddress).toBe('sam.parent@example.org');
    expect(email.toAddresses).toEqual(['casework@resend.test']);
    expect(email.ccAddresses).toEqual(['sen@council.example']);
    expect(email.sentAt?.toISOString()).toBe('2025-10-01T08:30:00.000Z');
    expect(email.bodyText).toContain('Please find the report attached.');
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]!.filename).toBe('report.pdf');
    expect(email.attachments[0]!.bytes.equals(pdf)).toBe(true);
  });

  it('drops small inline images (signature logos)', async () => {
    const email = await parseEmailFile('a.eml', buildEml({ inlineLogo: true }));
    expect(email.attachments).toHaveLength(0);
  });

  it('falls back to a stable content hash when there is no Message-ID', async () => {
    const a = await parseEmailFile('a.eml', buildEml({ messageId: null }));
    const b = await parseEmailFile('b.eml', buildEml({ messageId: null }));
    const c = await parseEmailFile(
      'c.eml',
      buildEml({ messageId: null, subject: 'Something else' }),
    );
    expect(a.messageId).toBeNull();
    expect(a.dedupKey).toMatch(/^sha:/);
    expect(a.dedupKey).toBe(b.dedupKey);
    expect(c.dedupKey).not.toBe(a.dedupKey);
  });

  it('rejects a file that is not an email', async () => {
    await expect(
      parseEmailFile('renamed.eml', Buffer.from('%PDF-1.4\n%binary')),
    ).rejects.toBeInstanceOf(EmailParseError);
    await expect(
      parseEmailFile('empty.eml', Buffer.alloc(0)),
    ).rejects.toBeInstanceOf(EmailParseError);
  });
});

describe('parseEmailFile (.msg)', () => {
  const msg = () =>
    buildMsg({
      subject: 'Tribunal bundle',
      senderName: 'Alex Worker',
      senderSmtp: 'Alex.Worker@resend.test',
      body: 'Bundle attached.',
      sent: new Date('2025-10-02T10:00:00Z'),
      messageId: '<ABC123@example.org>',
      to: [{ name: 'Sam Parent', smtp: 'sam.parent@example.org' }],
      cc: [{ name: 'SEN Team', smtp: 'sen@council.example' }],
      attachment: {
        filename: 'bundle.pdf',
        mimeType: 'application/pdf',
        content: pdf,
      },
    });

  it('reads an Outlook message, its recipients and its attachment', async () => {
    const email = await parseEmailFile('Tribunal bundle.msg', msg());
    expect(email.subject).toBe('Tribunal bundle');
    expect(email.fromName).toBe('Alex Worker');
    expect(email.fromAddress).toBe('alex.worker@resend.test');
    expect(email.toAddresses).toEqual(['sam.parent@example.org']);
    expect(email.ccAddresses).toEqual(['sen@council.example']);
    expect(email.sentAt?.toISOString()).toBe('2025-10-02T10:00:00.000Z');
    expect(email.bodyText).toBe('Bundle attached.');
    expect(email.attachments.map((a) => a.filename)).toEqual(['bundle.pdf']);
    expect(email.attachments[0]!.bytes.equals(pdf)).toBe(true);
  });

  it('gives an .msg and an .eml of the same message the same identity', async () => {
    const fromMsg = await parseEmailFile('x.msg', msg());
    const fromEml = await parseEmailFile('x.eml', buildEml({}));
    expect(fromMsg.dedupKey).toBe(fromEml.dedupKey);
  });

  it('detects an Outlook file by its signature even without the extension', async () => {
    const email = await parseEmailFile('download', msg());
    expect(email.subject).toBe('Tribunal bundle');
  });
});

describe('htmlToText', () => {
  it('drops markup, scripts and styles and keeps line breaks', () => {
    expect(
      htmlToText(
        '<style>p{}</style><p>Hello&nbsp;there</p><script>x()</script><div>Line&amp;two<br>three</div>',
      ),
    ).toBe('Hello there\nLine&two\nthree');
  });
});
