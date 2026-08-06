import { asc, eq } from 'drizzle-orm';
import {
  CORPUS_ITEM_TYPE_VALUES,
  estimateTokenCount,
  renderCaseRecordText,
  serialiseCorpus,
  type CaseRecordInput,
  type CorpusItem,
  type CorpusItemType,
  type CorpusResult,
  type ExcludedCorpusItem,
} from '@re-send/shared';
import { getDb } from '../db/client';
import { caseNotes, documents, users } from '../db/schema';
import { getCaseDetail } from '../repositories/case-detail';
import { getCachedCorpus, setCachedCorpus } from './cache';

export interface CorpusOptions {
  /** Which item types to assemble. Defaults to every registered type. */
  include?: CorpusItemType[];
  /** Restrict document items to these ids (e.g. a feature needing one file). */
  documentIds?: string[];
}

export interface SingleDocument {
  id: string;
  title: string;
  date: string | null;
  text: string;
}

/**
 * Assemble a corpus from a single document that is not (yet) attached to a case
 * — the smart-fill path. It mirrors caseCorpus's `{ include: ['document'],
 * documentIds: [id] }` selection, sharing the exact serialisation and token
 * count, so extraction reads the same corpus surface a full-corpus feature will
 * use later. There is no database read because the document lives only in object
 * storage until the case is created.
 */
export function singleDocumentCorpus(doc: SingleDocument): CorpusResult {
  const items: CorpusItem[] = [
    {
      id: doc.id,
      type: 'document',
      title: doc.title,
      date: doc.date,
      text: doc.text,
    },
  ];
  const serialised = serialiseCorpus(items);
  return {
    caseId: '',
    items,
    excluded: [],
    registeredEmpty: [],
    serialised,
    tokenCount: estimateTokenCount(serialised),
  };
}

const PRODUCING: CorpusItemType[] = ['case_record', 'document', 'note'];
const REGISTERED_EMPTY: CorpusItemType[] = ['email', 'time_entry'];

/**
 * Assemble the case corpus: an ordered set of text items a model can read and
 * cite. Superseded document versions and soft-deleted rows are excluded
 * explicitly (reported in `excluded`, not dropped silently). Results are cached
 * per case and options, and invalidated whenever a constituent row changes.
 *
 * Every AI feature reads through this service — even one that needs a single
 * document passes `{ include: ['document'], documentIds: [id] }` rather than
 * touching the documents table directly.
 */
export async function caseCorpus(
  caseId: string,
  options: CorpusOptions = {},
): Promise<CorpusResult> {
  const include = normaliseInclude(options.include);
  const optionsKey = keyOf(include, options.documentIds);

  const cached = getCachedCorpus(caseId, optionsKey);
  if (cached) return cached;

  const want = (type: CorpusItemType) => include.includes(type);
  const items: CorpusItem[] = [];
  const excluded: ExcludedCorpusItem[] = [];

  if (want('case_record')) {
    const record = await buildCaseRecord(caseId);
    if (record) items.push(record);
  }
  if (want('note')) {
    await collectNotes(caseId, items, excluded);
  }
  if (want('document')) {
    await collectDocuments(caseId, options.documentIds, items, excluded);
  }

  sortChronologically(items);

  const serialised = serialiseCorpus(items);
  const result: CorpusResult = {
    caseId,
    items,
    excluded,
    registeredEmpty: REGISTERED_EMPTY.filter((t) => include.includes(t)),
    serialised,
    tokenCount: estimateTokenCount(serialised),
  };
  setCachedCorpus(caseId, optionsKey, result);
  return result;
}

// --- Item builders ----------------------------------------------------------

async function buildCaseRecord(caseId: string): Promise<CorpusItem | null> {
  const detail = await getCaseDetail(caseId);
  if (!detail) return null;
  const input: CaseRecordInput = {
    caseReference: detail.caseReference,
    status: detail.status,
    dateOfEnquiry: detail.dateOfEnquiry,
    originalQuery: detail.originalQuery,
    currentWork: detail.currentWork,
    team: detail.team,
    aims: detail.aims,
    supportLevel: detail.supportLevel,
    consultStatus: detail.consultStatus,
    client: detail.client
      ? {
          displayName: detail.client.displayName,
          additionalNeeds: detail.client.additionalNeeds,
        }
      : null,
    child: detail.child
      ? {
          fullName: detail.child.fullName,
          dateOfBirth: detail.child.dateOfBirth,
          schoolYear: detail.child.schoolYear,
          currentSchoolName: detail.child.currentSchoolName,
          desiredSchool: detail.child.desiredSchool,
          sendNeeds: detail.child.sendNeeds,
        }
      : null,
  };
  return {
    id: caseId,
    type: 'case_record',
    title: `Case record — ${detail.caseReference}`,
    date: detail.dateOfEnquiry,
    text: renderCaseRecordText(input),
  };
}

async function collectNotes(
  caseId: string,
  items: CorpusItem[],
  excluded: ExcludedCorpusItem[],
): Promise<void> {
  const rows = await getDb()
    .select({
      id: caseNotes.id,
      entryDate: caseNotes.entryDate,
      body: caseNotes.body,
      deletedAt: caseNotes.deletedAt,
      authorName: users.displayName,
    })
    .from(caseNotes)
    .leftJoin(users, eq(users.id, caseNotes.authorUserId))
    .where(eq(caseNotes.caseId, caseId))
    .orderBy(asc(caseNotes.entryDate));

  for (const r of rows) {
    if (r.deletedAt) {
      excluded.push({ id: r.id, type: 'note', reason: 'deleted' });
      continue;
    }
    items.push({
      id: r.id,
      type: 'note',
      title: `Note — ${r.authorName ?? 'Unknown'}`,
      date: r.entryDate,
      text: r.body,
    });
  }
}

async function collectDocuments(
  caseId: string,
  documentIds: string[] | undefined,
  items: CorpusItem[],
  excluded: ExcludedCorpusItem[],
): Promise<void> {
  const rows = await getDb()
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      uploadedAt: documents.uploadedAt,
      extractedText: documents.extractedText,
      deletedAt: documents.deletedAt,
      supersededById: documents.supersededById,
    })
    .from(documents)
    .where(eq(documents.caseId, caseId))
    .orderBy(asc(documents.uploadedAt));

  const wanted = documentIds ? new Set(documentIds) : null;
  for (const r of rows) {
    if (wanted && !wanted.has(r.id)) continue;
    if (r.deletedAt) {
      excluded.push({ id: r.id, type: 'document', reason: 'deleted' });
    } else if (r.supersededById) {
      excluded.push({ id: r.id, type: 'document', reason: 'superseded' });
    } else if (!r.extractedText || r.extractedText.trim().length === 0) {
      excluded.push({ id: r.id, type: 'document', reason: 'no-text' });
    } else {
      items.push({
        id: r.id,
        type: 'document',
        title: r.originalFilename,
        date: r.uploadedAt.toISOString().slice(0, 10),
        text: r.extractedText,
      });
    }
  }
}

// --- Helpers ----------------------------------------------------------------

function normaliseInclude(include?: CorpusItemType[]): CorpusItemType[] {
  const set = new Set(include ?? CORPUS_ITEM_TYPE_VALUES);
  // Preserve a stable, canonical order regardless of caller order.
  return CORPUS_ITEM_TYPE_VALUES.filter((t) => set.has(t));
}

function keyOf(
  include: CorpusItemType[],
  documentIds: string[] | undefined,
): string {
  const docs = documentIds ? [...documentIds].sort() : null;
  return JSON.stringify({ include, docs });
}

/** Oldest first; ties broken by producing-type order then id for stability. */
function sortChronologically(items: CorpusItem[]): void {
  const typeRank = (t: CorpusItemType) => PRODUCING.indexOf(t);
  items.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    if (a.type !== b.type) return typeRank(a.type) - typeRank(b.type);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
