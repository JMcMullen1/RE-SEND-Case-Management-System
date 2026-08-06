/**
 * Generate the demonstration PDFs in docs/demo/ — a realistic JotForm enquiry
 * and an amended tribunal directions order. Dependency-free: it writes minimal,
 * valid single-page PDFs whose text extracts cleanly with pdf-parse, so they can
 * be dropped into the running app during a live demonstration.
 *
 *   node docs/demo/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Escape a text string for a PDF literal string. */
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Build a single-page A4 PDF from an array of text lines. */
function buildPdf(lines) {
  const content =
    'BT /F1 11 Tf 50 800 Td 15 TL\n' +
    lines.map((l) => `(${esc(l)}) Tj T*`).join('\n') +
    '\nET';

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${Buffer.byteLength(content, 'latin1')}>>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n` +
    `startxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const jotform = [
  'RE-SEND ADVICE AND ADVOCACY — ENQUIRY (QUERY FORM)',
  '',
  'Submission date: 12 May 2026',
  '',
  'Parent / carer full name: Nadia Rahman',
  'Email address: nadia.rahman@example.co.uk',
  'Contact phone: 07911 123456',
  'Home address: 14 Elm Grove, St Albans',
  'Postcode: AL1 2AB',
  '',
  "Child's full name: Yusuf Rahman",
  "Child's date of birth: 23/04/2015",
  'Current school: Marlborough Primary School, St Albans',
  'Nature of SEND: autism spectrum condition and associated anxiety;',
  'significant difficulties with communication and self-regulation.',
  '',
  'What do you need help with? Appeal to the SEND Tribunal',
  'How did you hear about us / enquiry route: New application',
  'Has an appeal been lodged? Yes',
  'Has a final EHC plan been issued? Yes — issued 28 April 2026',
  '',
  'Consents:',
  'I consent to RE-SEND processing my data: Yes',
  'I consent to information sharing with the local authority: Yes',
  'I consent to being contacted about my case: Yes',
  'I have read the privacy notice: Yes',
];

const directions = [
  'FIRST-TIER TRIBUNAL',
  '(SPECIAL EDUCATIONAL NEEDS AND DISABILITY)',
  '',
  'AMENDED DIRECTIONS',
  'Appeal reference: EH/2026/04821',
  'Date of this order: 1 June 2026',
  '',
  'UPON review of the case, the Tribunal makes the following amended',
  'directions, which replace the directions dated 20 April 2026:',
  '',
  '1. The final hearing listed for 18 June 2026 is VACATED and',
  '   relisted for 30 July 2026 at 10:00am.',
  '',
  '2. The appellant shall file and serve any further evidence no later',
  '   than 4pm 15 working days before the hearing.',
  '',
  '3. The respondent shall file and serve its response within 14 days',
  '   of the date of this order.',
  '',
  '4. The parties shall file an agreed bundle no later than 5 working',
  '   days before the hearing.',
  '',
  'Any application to vary these directions must be made promptly and',
  'in writing, copied to the other party.',
];

writeFileSync(join(HERE, 'jotform-enquiry.pdf'), buildPdf(jotform));
writeFileSync(join(HERE, 'amended-directions-order.pdf'), buildPdf(directions));
console.log('Wrote jotform-enquiry.pdf and amended-directions-order.pdf');
