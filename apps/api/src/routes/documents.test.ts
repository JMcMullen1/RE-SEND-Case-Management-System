import { describe, expect, it } from 'vitest';
import { contentDisposition } from './documents';

describe('contentDisposition', () => {
  it('keeps plain names as they are', () => {
    expect(contentDisposition('attachment', 'report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('gives an ASCII fallback and the real name for curly quotes and dashes', () => {
    const value = contentDisposition('inline', 'Parent’s letter – EHCP.msg');
    expect(value).toBe(
      `inline; filename="Parent_s letter _ EHCP.msg"; filename*=UTF-8''Parent%E2%80%99s%20letter%20%E2%80%93%20EHCP.msg`,
    );
    // Every character is a legal header byte.
    expect(/^[\x20-\x7e]*$/.test(value)).toBe(true);
  });

  it('strips quotes, backslashes and line breaks', () => {
    expect(contentDisposition('attachment', 'a"b\\c\r\nd.pdf')).toBe(
      `attachment; filename="abcd.pdf"; filename*=UTF-8''abcd.pdf`,
    );
  });
});
