/**
 * Generate the demonstration emails in docs/demo/ — one Outlook .msg and one
 * .eml, both about the fictional family in `jotform-enquiry.pdf`, each with a
 * small PDF attachment. Drop them on a case's Documents / Emails tab during a
 * walkthrough. Fictional people and addresses only.
 *
 *   npm run demo:emails -w @re-send/api
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEml, buildMsg } from '../email/fixtures';

const OUT = join(import.meta.dirname, '../../../../docs/demo');

/** A minimal single-page PDF with extractable text. */
function pdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
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
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

writeFileSync(
  join(OUT, 'parent-email.eml'),
  buildEml({
    messageId: '<demo-parent-comments@example.co.uk>',
    from: 'Nadia Rahman <nadia.rahman@example.co.uk>',
    to: 'Casework <casework@resend.demo>',
    subject: "Yusuf's draft EHCP - our comments",
    date: 'Tue, 19 May 2026 20:14:00 +0100',
    body: [
      'Hello,',
      '',
      "Thank you for your help so far. I've gone through Yusuf's draft plan",
      'and put our comments in the attached document. The main worry is that',
      'section F still does not say how many hours of speech and language',
      'therapy he will get.',
      '',
      'Kind regards,',
      'Nadia',
    ].join('\r\n'),
    attachment: {
      filename: 'Draft EHCP comments.pdf',
      mimeType: 'application/pdf',
      content: pdf([
        'Comments on the draft EHC plan for Yusuf Rahman',
        '',
        'Section B: the anxiety described by school is not reflected.',
        'Section F: speech and language therapy is not quantified.',
        'Section I: we still ask for a specialist placement.',
      ]),
    },
  }),
);

writeFileSync(
  join(OUT, 'tribunal-bundle.msg'),
  buildMsg({
    subject: 'RE: Tribunal bundle - working document',
    senderName: 'Jamie McMullen',
    senderSmtp: 'jamie.mcmullen@resend.demo',
    body: [
      'Dear Mrs Rahman,',
      '',
      'Please find attached the working document for the tribunal bundle.',
      'Could you check the chronology and let me know of any changes by',
      'Friday 29 May?',
      '',
      'Kind regards,',
      'Jamie',
    ].join('\r\n'),
    sent: new Date('2026-05-21T13:05:00Z'),
    messageId: '<demo-bundle-working-doc@resend.demo>',
    to: [{ name: 'Nadia Rahman', smtp: 'nadia.rahman@example.co.uk' }],
    cc: [{ name: 'SEN Team', smtp: 'sen.team@council.example' }],
    attachment: {
      filename: 'Bundle working document.pdf',
      mimeType: 'application/pdf',
      content: pdf([
        'Tribunal bundle - working document',
        'Appellant: Nadia Rahman. Child: Yusuf Rahman.',
        '',
        'Chronology',
        '28 April 2026 - final EHC plan issued',
        '12 May 2026 - appeal lodged',
      ]),
    },
  }),
);

process.stdout.write(
  `Wrote parent-email.eml and tribunal-bundle.msg to ${OUT}\n`,
);
