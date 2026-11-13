import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { addConnection, removeConnection } from './realtime';
import { startEntityListener } from './entity-listener';
import { getDb } from './db/client';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

interface WsMessage {
  type: string;
  entity?: string;
  queryKeys?: (string | number)[][];
}

async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms)
      throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}

run('live updates end to end', () => {
  it('propagates a case change from Postgres to a connected client', async () => {
    const received: WsMessage[] = [];
    const connId = addConnection((data) =>
      received.push(JSON.parse(data) as WsMessage),
    );
    const stop = await startEntityListener();
    await new Promise((r) => setTimeout(r, 200)); // let LISTEN settle

    const rows = await getDb().execute(sql`SELECT id FROM cases LIMIT 1`);
    const caseId = (rows as unknown as { id: string }[])[0]!.id;
    await getDb().execute(
      sql`UPDATE cases SET updated_at = now() WHERE id = ${caseId}`,
    );

    // Other test files mutate the shared cases table concurrently, so more than
    // one 'cases' invalidation can arrive on this connection. Wait for and
    // select the message for THIS case, not merely the first one seen.
    const isForThisCase = (m: WsMessage): boolean =>
      m.type === 'invalidate' &&
      m.entity === 'cases' &&
      (m.queryKeys?.some((k) => k[0] === 'case-detail' && k[1] === caseId) ??
        false);
    await waitFor(() => received.some(isForThisCase));
    const msg = received.find(isForThisCase)!;
    expect(msg.queryKeys?.some((k) => k[0] === 'cases')).toBe(true);
    expect(
      msg.queryKeys?.some((k) => k[0] === 'case-detail' && k[1] === caseId),
    ).toBe(true);

    removeConnection(connId);
    await stop();
  });

  it('scopes a note change to its case timeline', async () => {
    const received: WsMessage[] = [];
    const connId = addConnection((data) =>
      received.push(JSON.parse(data) as WsMessage),
    );
    const stop = await startEntityListener();
    await new Promise((r) => setTimeout(r, 200));

    const rows = await getDb().execute(
      sql`SELECT c.id AS case_id, u.id AS user_id FROM cases c, users u LIMIT 1`,
    );
    const { case_id, user_id } = (
      rows as unknown as { case_id: string; user_id: string }[]
    )[0]!;
    await getDb().execute(
      sql`INSERT INTO case_notes (case_id, author_user_id, entry_date, body) VALUES (${case_id}, ${user_id}, current_date, 'live-update test note')`,
    );

    // Other test files add notes concurrently; wait for the message about
    // THIS case rather than the first note change seen.
    const isForThisCase = (m: WsMessage): boolean =>
      m.entity === 'case_notes' &&
      (m.queryKeys?.some((k) => k[0] === 'timeline' && k[1] === case_id) ??
        false);
    await waitFor(() => received.some(isForThisCase));
    expect(received.find(isForThisCase)).toBeDefined();

    removeConnection(connId);
    await stop();
  });

  it("refreshes a case's emails and documents when an email is filed", async () => {
    const received: WsMessage[] = [];
    const connId = addConnection((data) =>
      received.push(JSON.parse(data) as WsMessage),
    );
    const stop = await startEntityListener();
    await new Promise((r) => setTimeout(r, 200));

    const rows = await getDb().execute(sql`SELECT id FROM cases LIMIT 1`);
    const caseId = (rows as unknown as { id: string }[])[0]!.id;
    await getDb().execute(
      sql`INSERT INTO emails (case_id, direction, subject, dedup_key) VALUES (${caseId}, 'inbound', 'live-update test', ${`test:${Date.now()}`})`,
    );

    const isForThisCase = (m: WsMessage): boolean =>
      m.entity === 'emails' &&
      (m.queryKeys?.some((k) => k[0] === 'emails' && k[1] === caseId) ?? false);
    await waitFor(() => received.some(isForThisCase));
    const msg = received.find(isForThisCase)!;
    expect(
      msg.queryKeys?.some((k) => k[0] === 'emails' && k[1] === caseId),
    ).toBe(true);
    expect(
      msg.queryKeys?.some((k) => k[0] === 'documents' && k[1] === caseId),
    ).toBe(true);

    removeConnection(connId);
    await stop();
  });
});
