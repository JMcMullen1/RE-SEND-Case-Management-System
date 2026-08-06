import { beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../server';
import type { UserSummary } from '../repositories/users';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('case screen API', () => {
  let caseId = '';
  let users: UserSummary[] = [];
  const admin = () => users.find((u) => u.role === 'admin')!;
  const caseworker = () => users.find((u) => u.role === 'caseworker')!;
  const other = () => users.find((u) => u.role === 'read_only')!;

  beforeAll(async () => {
    const app = await buildServer();
    users = (await app.inject({ method: 'GET', url: '/api/users' })).json()
      .users;
    caseId = (
      await app.inject({ method: 'GET', url: '/api/cases?limit=1' })
    ).json().rows[0].id;
    await app.close();
  });

  it('returns full case detail', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: `/api/cases/${caseId}/detail`,
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.caseReference).toMatch(/^RS-/);
    expect(detail.client).toBeTruthy();
    expect(detail.child).toBeTruthy();
    expect(Array.isArray(detail.keyDates)).toBe(true);
    await app.close();
  });

  it('edits a case field in place', async () => {
    const app = await buildServer();
    await app.inject({
      method: 'PATCH',
      url: `/api/cases/${caseId}/fields`,
      payload: { supportLevel: 'High' },
    });
    const detail = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/detail` })
    ).json();
    expect(detail.supportLevel).toBe('High');
    await app.close();
  });

  it('adds and lists a key date', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/key-dates`,
      payload: { date: '2027-01-15', title: 'New hearing', type: 'hearing' },
    });
    expect(created.statusCode).toBe(200);
    const list = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/key-dates` })
    ).json();
    expect(
      list.keyDates.some((k: { title: string }) => k.title === 'New hearing'),
    ).toBe(true);
    await app.close();
  });

  it('adds a note and enforces edit permission', async () => {
    const app = await buildServer();
    const author = caseworker();
    const added = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/notes`,
      headers: { 'x-user-id': author.id },
      payload: { body: 'A fresh timeline note.' },
    });
    expect(added.statusCode).toBe(200);
    const noteId = added.json().item.id;

    // A different non-admin cannot edit.
    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { 'x-user-id': other().id },
      payload: { body: 'hijack' },
    });
    expect(denied.statusCode).toBe(403);

    // An admin can, and the edit is flagged.
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { 'x-user-id': admin().id },
      payload: { body: 'Corrected by admin.' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().item.edited).toBe(true);
    await app.close();
  });

  it('uploads a document and serves its content', async () => {
    const app = await buildServer();
    const boundary = '----resendtest';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\n`,
      ),
      Buffer.from('hello fixture world'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/documents?category=Other`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(up.statusCode).toBe(200);
    const docId = up.json().document.id;

    const content = await app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/content?download=1`,
    });
    expect(content.statusCode).toBe(200);
    expect(content.body).toBe('hello fixture world');
    await app.close();
  });
});
