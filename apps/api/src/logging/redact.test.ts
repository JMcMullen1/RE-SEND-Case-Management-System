import { describe, expect, it } from 'vitest';
import { redactLine } from './redact';

/**
 * A realistic log line carrying all four kinds of personal data at once — the
 * exact thing invariant 6 forbids reaching a log. Redaction must strip every
 * one before the line is written.
 */
const FIXTURE = JSON.stringify({
  level: 30,
  reqId: 'req-42',
  msg: 'created case',
  parentEmail: 'nadia.rahman@example.co.uk',
  parentPhone: '07911 123456',
  landline: '020 7946 0123',
  postcode: 'AL1 2AB',
  childDob: '2015-04-23',
  ukDob: '23/04/2015',
});

describe('redactLine', () => {
  it('strips every PII type from a line containing all four', () => {
    const out = redactLine(FIXTURE);

    // Nothing that resembles the originals survives.
    expect(out).not.toContain('nadia.rahman@example.co.uk');
    expect(out).not.toContain('07911 123456');
    expect(out).not.toContain('020 7946 0123');
    expect(out).not.toContain('AL1 2AB');
    expect(out).not.toContain('2015-04-23');
    expect(out).not.toContain('23/04/2015');

    // Each is replaced by its token.
    expect(out).toContain('[redacted-email]');
    expect(out).toContain('[redacted-phone]');
    expect(out).toContain('[redacted-postcode]');
    expect(out).toContain('[redacted-date]');

    // The line remains valid JSON with its structural fields intact.
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.reqId).toBe('req-42');
    expect(parsed.msg).toBe('created case');
  });

  it('redacts a bare email, phone, postcode and date individually', () => {
    expect(redactLine('mailto sam@test.org')).toContain('[redacted-email]');
    expect(redactLine('call +44 7700 900123 now')).toContain(
      '[redacted-phone]',
    );
    expect(redactLine('lives at SW1A 1AA today')).toContain(
      '[redacted-postcode]',
    );
    expect(redactLine('born 1999-12-31')).toContain('[redacted-date]');
  });

  it('leaves ordinary text and identifiers untouched', () => {
    const line = 'case RS-2026-1001 reassigned to queue Enquiries';
    expect(redactLine(line)).toBe(line);
  });

  it('does not mistake an epoch timestamp for personal data', () => {
    const line = JSON.stringify({ time: 1786033403286, msg: 'ok' });
    expect(redactLine(line)).toBe(line);
  });
});
