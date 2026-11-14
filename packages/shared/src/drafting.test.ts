import { describe, expect, it } from 'vitest';
import type { CorpusItem } from './corpus';
import { draftPlainText, groundDraft } from './drafting';

const corpus: CorpusItem[] = [
  {
    id: 'doc-1',
    type: 'document',
    title: 'EP report.pdf',
    date: '2026-03-01',
    text: 'The educational psychologist found significant needs in communication.',
  },
  {
    id: 'note-1',
    type: 'note',
    title: 'Note — Sam',
    date: '2026-04-02',
    text: 'Parent wants a specialist placement.',
  },
];

let n = 0;
const newId = () => `p${(n += 1)}`;

describe('groundDraft', () => {
  it('keeps supported passages, drops invented citations, and removes unsupported passages', () => {
    const grounded = groundDraft(
      {
        sections: [
          {
            key: 'needs',
            paragraphs: [
              {
                text: 'Communication needs are significant.',
                sourceIds: ['doc-1', 'made-up'],
              },
              {
                text: 'He also has a diagnosis of dyslexia.',
                sourceIds: ['nowhere'],
              },
              { text: '   ', sourceIds: ['doc-1'] },
            ],
            gap: null,
          },
          {
            key: 'placement',
            paragraphs: [
              { text: 'A specialist school is sought.', sourceIds: ['note-1'] },
            ],
            gap: 'No school has been named yet.',
          },
        ],
        missingInformation: [' The current Section F ', ''],
      },
      corpus,
      newId,
    );

    const needs = grounded.sections.find((s) => s.key === 'needs')!;
    expect(needs.paragraphs.map((p) => p.sourceIds)).toEqual([['doc-1']]);
    expect(grounded.removedUnsupported).toBe(1);

    const placement = grounded.sections.find((s) => s.key === 'placement')!;
    expect(placement.gap).toBe('No school has been named yet.');

    // Every section is present, in order; an uncovered one says so.
    expect(grounded.sections.map((s) => s.key)).toEqual([
      'background',
      'needs',
      'provision',
      'placement',
      'issues',
      'outcome',
    ]);
    expect(grounded.sections[0]!.gap).toMatch(/Nothing in the case file/);

    expect(grounded.sources.map((s) => s.id)).toEqual(['doc-1', 'note-1']);
    expect(grounded.missingInformation).toEqual(['The current Section F']);
  });
});

describe('draftPlainText', () => {
  it('renders headings and paragraphs without empty sections', () => {
    const text = draftPlainText('Position statement', [
      { key: 'background', heading: 'Background', paragraphs: [], gap: 'x' },
      {
        key: 'needs',
        heading: 'Needs',
        paragraphs: [
          { id: 'a', text: 'One.', sourceIds: ['d'], edited: false },
        ],
        gap: null,
      },
    ]);
    expect(text).toBe('Position statement\n\nNeeds\n\nOne.');
  });
});
