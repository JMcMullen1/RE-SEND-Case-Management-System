/**
 * drafting.ts — assisted drafting: the structured output the model returns, the
 * draft a caseworker reviews, and the grounding rule that makes the drafting
 * safe to use: every passage must rest on items actually in the case file.
 *
 * The model is an assistant to a professional. Nothing it writes is filed,
 * sent or saved until a caseworker has read, edited and approved it.
 */

import { z } from 'zod';
import {
  DRAFTING_ROLES,
  POSITION_STATEMENT_SECTIONS,
  POSITION_STATEMENT_SECTION_KEYS,
  type CorpusItemType,
  type DraftKind,
  type DraftStatus,
  type PositionStatementSectionKey,
} from './config';
import type { CorpusItem } from './corpus';

// --- What the model returns ----------------------------------------------------

export const DraftOutputParagraphSchema = z.object({
  /** The paragraph, in plain prose, as it would appear in the statement. */
  text: z.string(),
  /**
   * The ids of the case-file items (as given in the file) this paragraph
   * rests on. Every paragraph needs at least one.
   */
  sourceIds: z.array(z.string()),
});

export const PositionStatementOutputSchema = z.object({
  sections: z.array(
    z.object({
      key: z.enum(POSITION_STATEMENT_SECTION_KEYS),
      paragraphs: z.array(DraftOutputParagraphSchema),
      /**
       * When the file gives no basis for the section (or part of it): what is
       * missing, in one or two sentences. Null when the section is covered.
       */
      gap: z.string().nullable(),
    }),
  ),
  /** Information a caseworker should obtain to complete the statement. */
  missingInformation: z.array(z.string()),
});
export type PositionStatementOutput = z.infer<
  typeof PositionStatementOutputSchema
>;

// --- The draft a caseworker reviews --------------------------------------------

export interface DraftParagraph {
  id: string;
  text: string;
  sourceIds: string[];
  /** Changed by a caseworker since the model wrote it. */
  edited: boolean;
}

export interface DraftSection {
  key: PositionStatementSectionKey;
  heading: string;
  paragraphs: DraftParagraph[];
  /** What the file did not support, as the model reported it. */
  gap: string | null;
}

/** A case-file item a draft cites, so the reviewer can check it. */
export interface DraftSource {
  id: string;
  type: CorpusItemType;
  title: string;
  date: string | null;
  /** The start of the item's text, for a quick check without opening it. */
  excerpt: string;
}

export interface Draft {
  id: string;
  caseId: string;
  kind: DraftKind;
  status: DraftStatus;
  /** What the caseworker asked the draft to focus on, if anything. */
  instructions: string | null;
  sections: DraftSection[];
  missingInformation: string[];
  sources: DraftSource[];
  /** Passages the model wrote that cited nothing in the file, and were removed. */
  removedUnsupported: number;
  failureReason: string | null;
  createdByName: string | null;
  createdAt: string;
  /** Last change, sent back with edits so one person's save never silently overwrites another's. */
  updatedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  /** The case document filed on approval. */
  documentId: string | null;
}

/** Whether a role may request, edit and approve drafts. */
export function canDraft(role: string | undefined): boolean {
  return (DRAFTING_ROLES as readonly string[]).includes(role ?? '');
}

// --- Grounding -------------------------------------------------------------------

const EXCERPT_CHARS = 280;

export interface GroundedDraft {
  sections: DraftSection[];
  missingInformation: string[];
  sources: DraftSource[];
  removedUnsupported: number;
}

/**
 * Hold the model's output to the case file. A citation is kept only if it
 * names an item actually in the file; a paragraph left with no valid citation
 * is removed (and counted) rather than shown as if it were supported. Sections
 * come back in the statement's order, every section present, so an empty one
 * is visibly empty. `newId` gives each paragraph a stable id for editing.
 */
export function groundDraft(
  output: PositionStatementOutput,
  corpus: readonly CorpusItem[],
  newId: () => string,
): GroundedDraft {
  const byId = new Map(corpus.map((item) => [item.id, item]));
  const cited = new Set<string>();
  let removed = 0;

  const sections: DraftSection[] = POSITION_STATEMENT_SECTIONS.map((def) => {
    const fromModel = output.sections.filter((s) => s.key === def.key);
    const paragraphs: DraftParagraph[] = [];
    const gaps: string[] = [];
    for (const section of fromModel) {
      if (section.gap?.trim()) gaps.push(section.gap.trim());
      for (const p of section.paragraphs) {
        const text = p.text.trim();
        if (!text) continue;
        const sourceIds = [...new Set(p.sourceIds)].filter((id) =>
          byId.has(id),
        );
        if (sourceIds.length === 0) {
          removed += 1;
          continue;
        }
        sourceIds.forEach((id) => cited.add(id));
        paragraphs.push({ id: newId(), text, sourceIds, edited: false });
      }
    }
    return {
      key: def.key,
      heading: def.heading,
      paragraphs,
      gap:
        gaps.join(' ') ||
        (paragraphs.length === 0
          ? 'Nothing in the case file supported this section.'
          : null),
    };
  });

  const sources: DraftSource[] = corpus
    .filter((item) => cited.has(item.id))
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      date: item.date,
      excerpt:
        item.text.length > EXCERPT_CHARS
          ? `${item.text.slice(0, EXCERPT_CHARS).trimEnd()}…`
          : item.text,
    }));

  return {
    sections,
    missingInformation: output.missingInformation
      .map((m) => m.trim())
      .filter(Boolean),
    sources,
    removedUnsupported: removed,
  };
}

/** The approved statement as plain text: headings and paragraphs, no citations. */
export function draftPlainText(
  title: string,
  sections: readonly DraftSection[],
): string {
  const parts = [title, ''];
  for (const s of sections) {
    if (s.paragraphs.length === 0) continue;
    parts.push(s.heading, '');
    for (const p of s.paragraphs) parts.push(p.text, '');
  }
  return parts.join('\n').trim();
}
