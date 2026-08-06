/**
 * Redaction layer. This system holds special category personal data about
 * children, and invariant 6 is that personal data never reaches logs. Every log
 * line is passed through {@link redactLine} before it is written, stripping
 * anything that resembles an email address, a phone number, a UK postcode or a
 * date of birth — even if a caller logs it by mistake. Over-redaction (e.g. any
 * date, not only a birth date) is deliberate: it is the safe direction to err.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// UK mobiles (+44 7xxx / 07xxx) and landlines (0xx / +44 xx), with the usual
// spacing and separators. The leading boundary keeps it from firing inside a
// longer number (e.g. a decimal response time), and the trailing one stops it
// swallowing following digits.
const PHONE = /(?<![\d.\w])(?:\+44\s?|0)(?:\d[\s-]?){9,10}\d(?!\d)/g;

// UK postcode, e.g. "AL1 2AB", "SW1A 1AA", "M1 1AE" (optional inner space).
const POSTCODE = /\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b/g;

// Dates in ISO (YYYY-MM-DD) and UK (DD/MM/YYYY, DD-MM-YYYY) forms. A birth date
// is indistinguishable from any other date in a free log line, so all go.
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const UK_DATE = /\b\d{2}[/-]\d{2}[/-]\d{4}\b/g;

/**
 * Redact PII-looking substrings from a single string. Replacements are plain
 * tokens with no quotes or backslashes, so a JSON log line stays valid JSON.
 * Order matters: emails first (they contain none of the others), then dates
 * (before the phone rule can consume their digits), then postcode, then phone.
 */
export function redactLine(line: string): string {
  return line
    .replace(EMAIL, '[redacted-email]')
    .replace(ISO_DATE, '[redacted-date]')
    .replace(UK_DATE, '[redacted-date]')
    .replace(POSTCODE, '[redacted-postcode]')
    .replace(PHONE, '[redacted-phone]');
}
