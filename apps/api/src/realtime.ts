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

type QueryKey = (string | number)[];

interface EntityMapping {
  /** Query keys to invalidate, given the row id and its scope (case) id. */
  keys: (id: string | null, scopeId: string | null) => QueryKey[];
}

/**
 * Entity type → affected query keys. Adding an entity to live updates is one
 * entry here. `documents`, `emails` and `time_entries` are registered but inert
 * until their tables carry the trigger and their screens read live.
 */
const REGISTRY: Record<string, EntityMapping> = {
  cases: {
    keys: (id) => (id ? [['cases'], ['case-detail', id]] : [['cases']]),
  },
  case_notes: {
    keys: (_id, scopeId) =>
      scopeId
        ? [['cases'], ['case-detail', scopeId], ['timeline', scopeId]]
        : [['cases']],
  },
  key_dates: {
    keys: (_id, scopeId) =>
      scopeId ? [['cases'], ['case-detail', scopeId]] : [['cases']],
  },
  case_reviews: {
    keys: (_id, scopeId) =>
      scopeId ? [['cases'], ['case-detail', scopeId]] : [['cases']],
  },
  // Inert registry entries — wire a trigger and query keys to switch them on.
  documents: { keys: () => [] },
  emails: { keys: () => [] },
  time_entries: { keys: () => [] },
};

interface Connection {
  send: (data: string) => void;
  userId?: string;
  displayName?: string;
  caseId?: string;
}

const connections = new Map<number, Connection>();
let sequence = 0;

export function addConnection(send: (data: string) => void): number {
  const id = (sequence += 1);
  connections.set(id, { send });
  return id;
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
