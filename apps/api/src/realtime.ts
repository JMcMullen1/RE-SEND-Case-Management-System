/**
 * Realtime fan-out. A single Postgres LISTEN connection (see entity-listener.ts)
 * feeds `dispatchEntityChange`, which maps an entity type to the TanStack Query
 * keys it affects through the registry below and pushes an invalidation to every
 * connected WebSocket client. Because the notification comes from Postgres, this
 * works unchanged with more than one API instance: every instance LISTENs and
 * fans out to its own clients.
 *
 * Presence (who else has a case open) is tracked per connection and is
 * per-instance; a multi-instance deployment would share it through the same
 * NOTIFY channel or a cache.
 */

import { invalidateAllCorpora, invalidateCorpus } from './corpus/cache';

type QueryKey = (string | number)[];

/** Entities whose changes must drop the cached corpus for their case. */
const CORPUS_ENTITIES = new Set([
  'cases',
  'case_notes',
  'documents',
  'emails',
  'case_schools',
]);

/** Entities read into many cases' corpora at once: a change drops them all. */
const CORPUS_WIDE_ENTITIES = new Set(['schools', 'school_contacts']);

interface EntityMapping {
  /** Query keys to invalidate, given the row id and its scope (case) id. */
  keys: (id: string | null, scopeId: string | null) => QueryKey[];
}

/**
 * Entity type → affected query keys. Adding an entity to live updates is one
 * entry here.
 */
const REGISTRY: Record<string, EntityMapping> = {
  cases: {
    keys: (id) => (id ? [['cases'], ['case-detail', id]] : [['cases']]),
  },
  case_notes: {
    keys: (_id, scopeId) =>
      scopeId
        ? [
            ['cases'],
            ['case-detail', scopeId],
            ['timeline', scopeId],
            ['time-summary', scopeId],
            ['time'],
          ]
        : [['cases']],
  },
  key_dates: {
    keys: (_id, scopeId) =>
      scopeId
        ? [['cases'], ['case-detail', scopeId], ['calendar']]
        : [['cases'], ['calendar']],
  },
  case_reviews: {
    keys: (_id, scopeId) =>
      scopeId ? [['cases'], ['case-detail', scopeId]] : [['cases']],
  },
  documents: {
    keys: (_id, scopeId) =>
      scopeId
        ? [
            ['cases'],
            ['case-detail', scopeId],
            ['documents', scopeId],
            // An email lists its attachments, so a deleted one disappears.
            ['emails', scopeId],
          ]
        : [],
  },
  email_inbox: {
    keys: () => [['email-inbox']],
  },
  // A filed email also files its attachments, so the documents list refreshes
  // with it.
  emails: {
    keys: (_id, scopeId) =>
      scopeId
        ? [
            ['emails', scopeId],
            ['documents', scopeId],
            ['case-detail', scopeId],
          ]
        : [],
  },
  // Drafts on a case: generating, ready, edited, approved (approval also
  // files a document, which refreshes through the documents entry).
  drafts: {
    keys: (_id, scopeId) => (scopeId ? [['drafts', scopeId]] : []),
  },
  // The schools directory, a school's contacts, and the schools on a case
  // (linking a current or proposed school also updates the child's details).
  schools: {
    keys: (id) =>
      id
        ? [['schools'], ['school', id], ['case-schools']]
        : [['schools'], ['case-schools']],
  },
  school_contacts: {
    keys: (_id, scopeId) =>
      scopeId
        ? [['schools'], ['school', scopeId], ['case-schools']]
        : [['schools']],
  },
  case_schools: {
    keys: (_id, scopeId) =>
      scopeId
        ? [
            ['case-schools', scopeId],
            ['case-detail', scopeId],
            ['schools'],
            ['cases'],
          ]
        : [['schools']],
  },
  // Recorded time: the case's billables and totals, and every "My time" page.
  time_entries: {
    keys: (_id, scopeId) =>
      scopeId
        ? [['timeline', scopeId], ['time-summary', scopeId], ['time']]
        : [['time']],
  },
};

interface Connection {
  send: (data: string) => void;
  /** Closes the socket (used when its signed-in user is marked as left). */
  close?: () => void;
  /** The signed-in user the socket was opened for (from the session). */
  sessionUserId?: string | null;
  userId?: string;
  displayName?: string;
  caseId?: string;
}

const connections = new Map<number, Connection>();
let sequence = 0;

export function addConnection(
  send: (data: string) => void,
  opts: { close?: () => void; sessionUserId?: string | null } = {},
): number {
  const id = (sequence += 1);
  connections.set(id, { send, ...opts });
  return id;
}

/** Record the signed-in user behind a connection (resolved after upgrade). */
export function setConnectionUser(id: number, userId: string | null): void {
  const conn = connections.get(id);
  if (conn) conn.sessionUserId = userId;
}

/**
 * Close every live connection opened by a user (on this instance) — e.g. when
 * they are marked as having left, so an open tab stops receiving updates.
 * Other instances drop theirs when the session gate refuses the reconnect.
 */
export function disconnectUser(userId: string): number {
  let closed = 0;
  for (const [id, conn] of connections) {
    if (conn.sessionUserId === userId) {
      connections.delete(id);
      if (conn.caseId) broadcastPresence(conn.caseId);
      conn.close?.();
      closed += 1;
    }
  }
  return closed;
}

export function removeConnection(id: number): void {
  const conn = connections.get(id);
  connections.delete(id);
  if (conn?.caseId) broadcastPresence(conn.caseId);
}

/** Handle a client → server message (presence join/leave). */
export function handleClientMessage(id: number, raw: string): void {
  const conn = connections.get(id);
  if (!conn) return;
  let msg: {
    type?: string;
    caseId?: string;
    userId?: string;
    displayName?: string;
  };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return;
  }
  if (msg.type === 'presence:join' && msg.caseId) {
    const previous = conn.caseId;
    conn.userId = msg.userId;
    conn.displayName = msg.displayName;
    conn.caseId = msg.caseId;
    if (previous && previous !== msg.caseId) broadcastPresence(previous);
    broadcastPresence(msg.caseId);
  } else if (msg.type === 'presence:leave') {
    const previous = conn.caseId;
    conn.caseId = undefined;
    if (previous) broadcastPresence(previous);
  }
}

function presenceUsers(
  caseId: string,
): { userId: string; displayName: string }[] {
  const byUser = new Map<string, string>();
  for (const conn of connections.values()) {
    if (conn.caseId === caseId && conn.userId) {
      byUser.set(conn.userId, conn.displayName ?? '');
    }
  }
  return [...byUser.entries()].map(([userId, displayName]) => ({
    userId,
    displayName,
  }));
}

function broadcastPresence(caseId: string): void {
  const data = JSON.stringify({
    type: 'presence',
    caseId,
    users: presenceUsers(caseId),
  });
  for (const conn of connections.values()) {
    if (conn.caseId === caseId) safeSend(conn, data);
  }
}

/** Fan a Postgres entity change out to every client as a query invalidation. */
export function dispatchEntityChange(
  entity: string,
  id: string | null,
  scopeId: string | null,
): void {
  // Keep the case corpus honest: any change to a case, its notes or its
  // documents drops the cached corpus for that case.
  const corpusCaseId = entity === 'cases' ? id : scopeId;
  if (corpusCaseId && CORPUS_ENTITIES.has(entity)) {
    invalidateCorpus(corpusCaseId);
  }
  if (CORPUS_WIDE_ENTITIES.has(entity)) invalidateAllCorpora();

  const mapping = REGISTRY[entity];
  if (!mapping) return;
  const queryKeys = mapping.keys(id, scopeId);
  if (queryKeys.length === 0) return;
  const data = JSON.stringify({
    type: 'invalidate',
    entity,
    caseId: scopeId ?? id,
    queryKeys,
  });
  for (const conn of connections.values()) safeSend(conn, data);
}

function safeSend(conn: Connection, data: string): void {
  try {
    conn.send(data);
  } catch {
    /* dropped connection; cleaned up on close */
  }
}
