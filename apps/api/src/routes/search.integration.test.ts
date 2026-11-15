import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { SNIPPET_MATCH_START, snippetRuns } from '@re-send/shared';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('search inside documents and emails', () => {
  let users: UserSummary[] = [];
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const as = (u: { id: string }) => ({ 'x-user-id': u.id });
  // A made-up word unique to this run, so other tests' data never matches.
  const stamp = `zq${Date.now().toString(36)}`;
  let caseA = '';
  let caseB = '';

  async function upload(
    caseId: string,
    filename: string,
    text: string,
  ): Promise<string> {
    const app = await buildServer();
    const boundary = '----searchtest';
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/documents?category=Expert%20Report`,
      headers: {
        ...as(worker()),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from(text),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    await app.close();
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
    return (res.json().document?.id ?? res.json().id) as string;
  }

  async function search(body: Record<string, unknown>) {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      headers: as(worker()),
      payload: body,
    });
    await app.close();
    expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
    return res.json() as {
      hits: {
        kind: string;
        id: string;
        caseId: string;
        title: string;
        current: boolean;
        snippet: string;
      }[];
      total: number;
    };
  }

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    const make = async (child: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/cases',
          headers: as(worker()),
          payload: {
            client: { fullName: `${child} Parent` },
            child: { fullName: child },
            case: { currentWork: 'Section Appeal' },
          },
        })
      ).json().caseId as string;
    caseA = await make('Search Child A');
    caseB = await make('Search Child B');
    await app.close();
  });

  it('finds words in documents across the caseload, with word endings and highlights', async () => {
    await upload(
      caseA,
      `ep-report-${stamp}.txt`,
      `The educational psychologist assessed ${stamp} and recommends weekly speech therapy.`,
    );
    await upload(
      caseB,
      `school-${stamp}.txt`,
      `The school reports ${stamp} attends a mainstream class.`,
    );
    const all = await search({ q: stamp });
    expect(all.total).toBe(2);
    expect(new Set(all.hits.map((h) => h.caseId))).toEqual(
      new Set([caseA, caseB]),
    );
    // "assessment" finds "assessed" (English stemming), in one case only.
    const one = await search({ q: `${stamp} assessment`, caseId: caseA });
    expect(one.hits).toHaveLength(1);
    expect(one.hits[0]!.title).toBe(`ep-report-${stamp}.txt`);
    expect(one.hits[0]!.snippet).toContain(SNIPPET_MATCH_START);
    expect(
      snippetRuns(one.hits[0]!.snippet)
        .filter((r) => r.match)
        .map((r) => r.text.toLowerCase()),
    ).toEqual(expect.arrayContaining(['assessed']));
    // A phrase in quotes, and a word left out with a minus.
    expect((await search({ q: `"weekly speech" ${stamp}` })).total).toBe(1);
    expect((await search({ q: `${stamp} -mainstream` })).total).toBe(1);
  });

  it('leaves out earlier versions unless asked, and deleted documents', async () => {
    const first = await upload(
      caseA,
      `plan-${stamp}.txt`,
      `Draft plan ${stamp}x version one.`,
    );
    const second = await upload(
      caseA,
      `plan-${stamp}.txt`,
      `Draft plan ${stamp}x version two.`,
    );
    const found = await search({ q: `${stamp}x` });
    expect(found.hits.map((h) => h.id)).toEqual([second]);
    const withEarlier = await search({
      q: `${stamp}x`,
      includeEarlierVersions: true,
    });
    expect(new Set(withEarlier.hits.map((h) => h.id))).toEqual(
      new Set([first, second]),
    );
    expect(withEarlier.hits.find((h) => h.id === first)!.current).toBe(false);

    const app = await buildServer();
    await app.inject({
      method: 'DELETE',
      url: `/api/cases/${caseA}/documents`,
      headers: as(worker()),
      payload: { ids: [second] },
    });
    await app.close();
    expect(
      (await search({ q: `${stamp}x`, includeEarlierVersions: true })).total,
    ).toBe(0);
  });

  it('finds emails by subject, sender and body, but not their raw files', async () => {
    const db = getDb();
    const raw = await upload(
      caseB,
      `email-${stamp}y.eml`,
      `Subject: About ${stamp}y`,
    );
    await db.execute(sql`
      INSERT INTO emails (case_id, direction, subject, from_name, body_text, dedup_key, raw_document_id)
      VALUES (${caseB}, 'inbound', ${`Tribunal update ${stamp}y`}, 'Made Up Officer',
              'The local authority will respond by Friday.', ${`search:${stamp}`}, ${raw})`);
    const found = await search({ q: `${stamp}y` });
    expect(found.hits.map((h) => h.kind)).toEqual(['email']);
    expect(
      (await search({ q: `${stamp}y respond`, scope: 'emails' })).total,
    ).toBe(1);
    expect((await search({ q: `${stamp}y`, scope: 'documents' })).total).toBe(
      0,
    );
  });

  it('audits each search without the words searched for', async () => {
    await search({ q: `${stamp} audited`, caseId: caseA });
    const [row] = (await getDb().execute(
      sql`SELECT after FROM audit_log WHERE action = 'search.files' AND entity_id = ${caseA}
          ORDER BY created_at DESC LIMIT 1`,
    )) as unknown as { after: Record<string, unknown> }[];
    expect(row!.after).toMatchObject({ scope: 'all', results: 0 });
    expect(JSON.stringify(row!.after)).not.toContain(stamp);
  });

  it('saves and finds a very long document with many distinct words', async () => {
    // Before migration 0017, a text like this could not be saved at all.
    const words = Array.from({ length: 60000 }, (_, i) =>
      createHash('md5').update(`${stamp}${i}`).digest('hex'),
    );
    const id = await upload(
      caseB,
      `bundle-${stamp}.txt`,
      `${stamp}z ${words.join(' ')}`,
    );
    expect((await search({ q: `${stamp}z` })).hits.map((h) => h.id)).toEqual([
      id,
    ]);
  });
});
