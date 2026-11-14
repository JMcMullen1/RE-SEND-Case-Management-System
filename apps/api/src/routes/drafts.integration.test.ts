import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PositionStatementOutput } from '@re-send/shared';
import { getDb } from '../db/client';
import { buildServer } from '../server';
import { caseCorpus } from '../corpus/case-corpus';
import { invalidateCorpus } from '../corpus/cache';
import Anthropic from '@anthropic-ai/sdk';
import { AiJobError, AiJobRefusalError } from '../ai/errors';
import { setDraftRunnerForTests, settleDrafting } from '../drafting/generate';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('assisted drafting API', () => {
  let caseId = '';
  let users: UserSummary[] = [];
  const worker = () => users.find((u) => u.role === 'caseworker')!;
  const readOnly = () => users.find((u) => u.role === 'read_only')!;
  const as = (u: UserSummary) => ({ 'x-user-id': u.id });
  let lastInput = '';

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    // A fresh case with a note and an email-like note to draft from.
    caseId = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(worker()),
        payload: {
          client: { fullName: 'Draft Parent' },
          child: { fullName: 'Draft Child' },
          case: { currentWork: 'Section Appeal' },
        },
      })
    ).json().caseId;
    await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/notes`,
      headers: as(worker()),
      payload: {
        body: 'The EP report says the child needs weekly speech and language therapy.',
      },
    });
    await app.close();
  });

  afterAll(() => setDraftRunnerForTests(null));

  /** A fake model that cites the case's real note, plus an invented id. */
  async function fakeOutput(): Promise<PositionStatementOutput> {
    invalidateCorpus(caseId);
    const corpus = await caseCorpus(caseId);
    const note = corpus.items.find((i) => i.type === 'note')!;
    return {
      sections: [
        {
          key: 'provision',
          paragraphs: [
            {
              text: 'The child needs weekly speech and language therapy.',
              sourceIds: [note.id],
            },
            {
              text: 'The child attends a riding school.',
              sourceIds: ['invented'],
            },
          ],
          gap: null,
        },
      ],
      missingInformation: ['The current Section F'],
    };
  }

  it('drafts in the background, holds the draft to the file, and records who asked', async () => {
    const output = await fakeOutput();
    setDraftRunnerForTests(async (input) => {
      lastInput = input
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n');
      return {
        output,
        model: 'claude-opus-5-5',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        latencyMs: 1,
        costUsd: 0,
      };
    });
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/drafts`,
      headers: as(worker()),
      payload: { kind: 'position_statement', instructions: 'Focus on SALT.' },
    });
    expect(res.statusCode).toBe(202);
    // Written in the background: usually still generating when the request
    // returns (the stand-in model here can be faster than that).
    expect(['generating', 'ready']).toContain(res.json().status);
    await settleDrafting();

    // The model saw the case file (with item ids) and the caseworker's ask.
    expect(lastInput).toContain('<case_file>');
    expect(lastInput).toContain('weekly speech and language therapy');
    expect(lastInput).toContain('Focus on SALT.');

    const [draft] = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/drafts` })
    ).json().drafts;
    expect(draft.status).toBe('ready');
    expect(draft.createdByName).toBe(worker().displayName);
    const provision = draft.sections.find(
      (s: { key: string }) => s.key === 'provision',
    );
    expect(provision.paragraphs).toHaveLength(1);
    expect(draft.removedUnsupported).toBe(1);
    expect(draft.sources).toHaveLength(1);
    expect(draft.sources[0].excerpt).toContain('speech and language');
    expect(draft.missingInformation).toEqual(['The current Section F']);
    await app.close();
  });

  it('saves edits, then approves: locked, attributed, and filed as a Word document', async () => {
    const app = await buildServer();
    const [draft] = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/drafts` })
    ).json().drafts;
    const para = draft.sections.find(
      (s: { key: string }) => s.key === 'provision',
    ).paragraphs[0];

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/drafts/${draft.id}`,
      headers: as(worker()),
      payload: {
        baseUpdatedAt: draft.updatedAt,
        sections: [
          {
            key: 'provision',
            paragraphs: [
              { id: para.id, text: `${para.text} (Edited.)` },
              { text: 'A paragraph the caseworker wrote.' },
            ],
          },
        ],
      },
    });
    expect(edited.statusCode).toBe(200);

    // A second editor still working from the old copy is stopped, not
    // allowed to overwrite the save above.
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/drafts/${draft.id}`,
      headers: as(worker()),
      payload: {
        baseUpdatedAt: draft.updatedAt,
        sections: [{ key: 'provision', paragraphs: [] }],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().message).toMatch(/Someone else has changed/);
    const ps = edited
      .json()
      .sections.find((s: { key: string }) => s.key === 'provision').paragraphs;
    expect(ps.map((p: { edited: boolean }) => p.edited)).toEqual([true, true]);
    expect(ps[0].sourceIds).toEqual(para.sourceIds);
    expect(ps[1].sourceIds).toEqual([]);

    // Read-only users cannot approve.
    const denied = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draft.id}/approve`,
      headers: as(readOnly()),
    });
    expect(denied.statusCode).toBe(403);

    const approved = await app.inject({
      method: 'POST',
      url: `/api/drafts/${draft.id}/approve`,
      headers: as(worker()),
    });
    expect(approved.statusCode).toBe(200);
    const a = approved.json();
    expect(a.status).toBe('approved');
    expect(a.approvedByName).toBe(worker().displayName);
    expect(a.documentId).toBeTruthy();

    const content = await app.inject({
      method: 'GET',
      url: `/api/documents/${a.documentId}/content?download=1`,
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('wordprocessingml');
    expect(content.rawPayload.subarray(0, 2).toString()).toBe('PK');

    // Locked: no further edits, no second approval, no discarding.
    for (const [method, url, payload] of [
      [
        'PATCH',
        `/api/drafts/${draft.id}`,
        { baseUpdatedAt: a.updatedAt, sections: [] },
      ],
      ['POST', `/api/drafts/${draft.id}/approve`, undefined],
      ['DELETE', `/api/drafts/${draft.id}`, undefined],
    ] as const) {
      const r = await app.inject({
        method,
        url,
        headers: as(worker()),
        payload,
      });
      expect(r.statusCode).toBe(409);
    }
    const [audit] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${draft.id}
          AND action IN ('draft.request','draft.edit','draft.approve')`,
    )) as unknown as { n: number }[];
    expect(audit!.n).toBe(3);
    await app.close();
  });

  it('records a refusal or failure as a failed draft with a plain reason', async () => {
    const app = await buildServer();
    setDraftRunnerForTests(async () => {
      throw new AiJobRefusalError('draft_position_statement', 'bio');
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/drafts`,
      headers: as(worker()),
      payload: { kind: 'position_statement' },
    });
    await settleDrafting();
    const failed = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/drafts` })
    )
      .json()
      .drafts.find((d: { id: string }) => d.id === res.json().id);
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toMatch(/declined/);

    // A failed draft can be discarded.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/drafts/${failed.id}`,
      headers: as(worker()),
    });
    expect(del.statusCode).toBe(200);
    await app.close();
  });

  it('undoes an approval whose filing fails, so it can be approved again', async () => {
    const [row] = (await getDb().execute(
      sql`INSERT INTO drafts (case_id, kind, status, created_by_user_id, content)
          VALUES (${caseId}, 'position_statement', 'ready', ${worker().id},
            ${JSON.stringify({
              sections: [
                {
                  key: 'outcome',
                  heading: 'Outcome sought',
                  paragraphs: [
                    { id: 'x', text: 'An order.', sourceIds: [], edited: true },
                  ],
                  gap: null,
                },
              ],
              missingInformation: [],
              sources: [],
              removedUnsupported: 0,
            })}::jsonb)
          RETURNING id`,
    )) as unknown as { id: string }[];
    const { approveDraft, getDraft } = await import('../repositories/drafts');
    await expect(
      approveDraft(row!.id, worker().id, async () => {
        throw new Error('storage unavailable');
      }),
    ).rejects.toThrow('storage unavailable');
    const after = await getDraft(row!.id);
    expect(after?.status).toBe('ready');
    expect(after?.approvedByName).toBeNull();
    expect(after?.documentId).toBeNull();
    const [undo] = (await getDb().execute(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${row!.id} AND action = 'draft.approve_undone'`,
    )) as unknown as { n: number }[];
    expect(undo!.n).toBe(1);
  });

  it('never revives a draft that ran past its time limit', async () => {
    const [row] = (await getDb().execute(
      sql`INSERT INTO drafts (case_id, kind, status, created_by_user_id, created_at)
          VALUES (${caseId}, 'position_statement', 'generating', ${worker().id}, now() - interval '20 minutes')
          RETURNING id`,
    )) as unknown as { id: string }[];
    const { completeDraft } = await import('../repositories/drafts');
    const done = await completeDraft(row!.id, {
      sections: [],
      missingInformation: [],
      sources: [],
      removedUnsupported: 0,
    });
    expect(done).toBe(false);
    const app = await buildServer();
    const shown = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/drafts` })
    )
      .json()
      .drafts.find((d: { id: string }) => d.id === row!.id);
    expect(shown.status).toBe('failed');
    expect(shown.failureReason).toMatch(/took too long/);
    await app.close();
  });

  it('says plainly when the AI key cannot use the drafting model', async () => {
    const app = await buildServer();
    setDraftRunnerForTests(async () => {
      throw new AiJobError('draft_position_statement', 'not found', {
        cause: Object.create(Anthropic.NotFoundError.prototype),
      });
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/drafts`,
      headers: as(worker()),
      payload: { kind: 'position_statement' },
    });
    await settleDrafting();
    const failed = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/drafts` })
    )
      .json()
      .drafts.find((d: { id: string }) => d.id === res.json().id);
    expect(failed.failureReason).toMatch(
      /does not have access to claude-opus-5-5/,
    );
    await app.close();
  });

  it('refuses when drafting is switched off, or the case has nothing to draft from', async () => {
    const app = await buildServer();
    await getDb().execute(
      sql`INSERT INTO ai_job_flags (job_name, enabled) VALUES ('draft_position_statement', false)
          ON CONFLICT (job_name) DO UPDATE SET enabled = false`,
    );
    const off = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/drafts`,
      headers: as(worker()),
      payload: { kind: 'position_statement' },
    });
    expect(off.statusCode).toBe(409);
    expect(off.json().message).toMatch(/switched off/);
    await getDb().execute(
      sql`DELETE FROM ai_job_flags WHERE job_name = 'draft_position_statement'`,
    );

    const empty = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        headers: as(worker()),
        payload: {
          client: { fullName: 'Empty Parent' },
          child: { fullName: 'Empty Child' },
          case: { currentWork: 'Section Appeal' },
        },
      })
    ).json().caseId;
    const none = await app.inject({
      method: 'POST',
      url: `/api/cases/${empty}/drafts`,
      headers: as(worker()),
      payload: { kind: 'position_statement' },
    });
    expect(none.statusCode).toBe(409);
    expect(none.json().message).toMatch(/nothing on this case/);
    await app.close();
  });
});
