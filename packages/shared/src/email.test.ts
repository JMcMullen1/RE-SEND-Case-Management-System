import { describe, expect, it } from 'vitest';
import {
  inferEmailDirection,
  isEmailFile,
  normaliseMessageId,
  renderEmailText,
} from './email';

describe('isEmailFile', () => {
  it('recognises .eml and .msg by extension, any case', () => {
    expect(isEmailFile('Re- Tribunal.MSG')).toBe(true);
    expect(isEmailFile('enquiry.eml')).toBe(true);
    expect(isEmailFile('report.pdf')).toBe(false);
  });
  it('recognises an email by MIME type when the name has no extension', () => {
    expect(isEmailFile('message', 'message/rfc822')).toBe(true);
    expect(isEmailFile('message', 'application/vnd.ms-outlook')).toBe(true);
    expect(isEmailFile('message', 'text/plain')).toBe(false);
  });
});

describe('inferEmailDirection', () => {
  const staff = ['alex.worker@resend.example', 'jo.bloggs@gmail.com'];

  it('treats an exact staff address as outbound', () => {
    expect(inferEmailDirection('Alex.Worker@resend.example', staff)).toBe(
      'outbound',
    );
  });
  it("treats the charity's own domain (e.g. a shared mailbox) as outbound", () => {
    expect(inferEmailDirection('enquiries@resend.example', staff)).toBe(
      'outbound',
    );
  });
  it('never treats a public mail domain as staff unless the address matches', () => {
    expect(inferEmailDirection('parent@gmail.com', staff)).toBe('inbound');
    expect(inferEmailDirection('jo.bloggs@gmail.com', staff)).toBe('outbound');
  });
  it('treats everything else, and a missing sender, as inbound', () => {
    expect(inferEmailDirection('sen@council.gov.uk', staff)).toBe('inbound');
    expect(inferEmailDirection(null, staff)).toBe('inbound');
  });
});

describe('normaliseMessageId', () => {
  it('strips brackets and whitespace and lower-cases', () => {
    expect(normaliseMessageId('  <ABC.123@Mail.Example> ')).toBe(
      'abc.123@mail.example',
    );
  });
  it('returns null for an empty id', () => {
    expect(normaliseMessageId('')).toBeNull();
    expect(normaliseMessageId('<>')).toBeNull();
    expect(normaliseMessageId(undefined)).toBeNull();
  });
});

describe('renderEmailText', () => {
  it('renders the headers a reader needs, then the body', () => {
    const text = renderEmailText({
      subject: 'Draft EHCP',
      fromName: 'Sam Parent',
      fromAddress: 'sam@example.org',
      toAddresses: ['casework@resend.example'],
      ccAddresses: [],
      sentAt: '2025-10-01T08:30:00.000Z',
      direction: 'inbound',
      bodyText: 'Comments attached.',
      attachmentNames: ['comments.docx'],
    });
    expect(text).toBe(
      [
        'Direction: received',
        'From: Sam Parent <sam@example.org>',
        'To: casework@resend.example',
        'Sent: 2025-10-01T08:30:00.000Z',
        'Subject: Draft EHCP',
        'Attachments: comments.docx',
        '',
        'Comments attached.',
      ].join('\n'),
    );
  });
});
