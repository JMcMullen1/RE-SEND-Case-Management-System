import { describe, expect, it } from 'vitest';
import { extractText } from './extract';

// A tiny but valid PDF containing the text "Hello Corpus".
const HELLO_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 18 Tf 20 100 Td (Hello Corpus) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
trailer<</Root 1 0 R/Size 6>>
startxref
0
%%EOF`,
  'latin1',
);

describe('extractText', () => {
  it('extracts UTF-8 plain text', async () => {
    const out = await extractText(
      'text/plain',
      Buffer.from('First line\n\n\n\nSecond line   \n', 'utf8'),
    );
    expect(out.status).toBe('extracted');
    // Runs of blank lines collapse and trailing whitespace is trimmed.
    expect(out.text).toBe('First line\n\nSecond line');
  });

  it('extracts text from a PDF', async () => {
    const out = await extractText('application/pdf', HELLO_PDF);
    expect(out.status).toBe('extracted');
    expect(out.text).toContain('Hello Corpus');
    // Page separators are stripped.
    expect(out.text).not.toMatch(/-- \d+ of \d+ --/);
  });

  it('reports empty text as empty, not extracted', async () => {
    const out = await extractText('text/plain', Buffer.from('   \n\n', 'utf8'));
    expect(out.status).toBe('empty');
    expect(out.text).toBeNull();
  });

  it('returns unsupported for types it cannot read', async () => {
    const out = await extractText('image/png', Buffer.from([0x89, 0x50]));
    expect(out.status).toBe('unsupported');
    expect(out.text).toBeNull();
  });
});
