import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { DraftSection } from '@re-send/shared';

/**
 * The approved statement as a Word document: a title, the case's identifying
 * line, then each section's heading and paragraphs. Citations stay in the
 * system (they are for the reviewer), not in the document filed for use.
 */
export async function draftToDocx(opts: {
  title: string;
  subtitle: string | null;
  sections: readonly DraftSection[];
  /** Points to settle before the document is used, listed at the end. */
  checklist?: readonly string[];
}): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: opts.title, heading: HeadingLevel.TITLE }),
  ];
  for (const line of opts.subtitle?.split('\n') ?? []) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, italics: true })],
      }),
    );
  }
  for (const section of opts.sections) {
    if (section.paragraphs.length === 0) continue;
    children.push(
      new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }),
    );
    for (const p of section.paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun(p.text)],
          spacing: { after: 160 },
        }),
      );
    }
  }
  if (opts.checklist?.length) {
    children.push(
      new Paragraph({
        text: 'Before you submit',
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const item of opts.checklist) {
      children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
