import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('create case API', () => {
  it('creates a case with a new client and child, then serves it', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/cases',
      payload: {
        client: {
          fullName: 'Dana Testerson',
          email: 'dana.test@example.invalid',
        },
        child: { fullName: 'Robin Testerson', dateOfBirth: '2016-05-04' },
        case: { currentWork: 'Section Appeal', team: ['TSA'] },
        firstNote: 'Phone enquiry taken.',
      },
    });
    expect(res.statusCode).toBe(200);
    const { caseId, caseReference } = res.json();
    expect(caseReference).toMatch(/^RS-\d{4}-\d+$/);

    const detail = (
      await app.inject({ method: 'GET', url: `/api/cases/${caseId}/detail` })
    ).json();
    expect(detail.client.fullName).toBe('Dana Testerson');
    expect(detail.client.displayName).toBe('Testerson, Dana');
    expect(detail.child.fullName).toBe('Robin Testerson');
    expect(detail.team).toContain('TSA');
    // Owner defaulted to a queue since none was given.
    expect(detail.owner.kind).toBe('queue');
    await app.close();
  });

  it('detects duplicates by email and by child name + DOB', async () => {
    const app = await buildServer();
    await app.inject({
      method: 'POST',
      url: '/api/cases',
      payload: {
        client: {
          fullName: 'Uniq Person',
          email: 'uniq.person@example.invalid',
        },
        child: { fullName: 'Uniq Child', dateOfBirth: '2014-03-03' },
        case: { currentWork: 'Other' },
      },
    });

    const byEmail = (
      await app.inject({
        method: 'GET',
        url: '/api/matches?email=uniq.person@example.invalid',
      })
    ).json();
    expect(byEmail.clientMatches.length).toBeGreaterThan(0);
    expect(byEmail.clientMatches[0].displayName).toBe('Person, Uniq');

    const byChild = (
      await app.inject({
        method: 'GET',
        url: '/api/matches?childName=Uniq%20Child&dob=2014-03-03',
      })
    ).json();
    expect(byChild.childMatches.length).toBeGreaterThan(0);
    expect(byChild.childMatches[0].fullName).toBe('Uniq Child');
    await app.close();
  });

  it('attaches a new case to an existing client', async () => {
    const app = await buildServer();
    const first = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        payload: {
          client: {
            fullName: 'Shared Parent',
            email: 'shared.parent@example.invalid',
          },
          child: { fullName: 'First Sibling', dateOfBirth: '2015-01-01' },
          case: { currentWork: 'Other' },
        },
      })
    ).json();
    const firstDetail = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${first.caseId}/detail`,
      })
    ).json();
    const clientId = firstDetail.client.id as string;

    const second = (
      await app.inject({
        method: 'POST',
        url: '/api/cases',
        payload: {
          existingClientId: clientId,
          child: { fullName: 'Second Sibling', dateOfBirth: '2018-02-02' },
          case: { currentWork: 'DLA' },
        },
      })
    ).json();
    const secondDetail = (
      await app.inject({
        method: 'GET',
        url: `/api/cases/${second.caseId}/detail`,
      })
    ).json();
    expect(secondDetail.client.id).toBe(clientId);
    expect(secondDetail.child.fullName).toBe('Second Sibling');

    const client = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}`,
    });
    expect(client.statusCode).toBe(200);
    expect(client.json().displayName).toBe('Parent, Shared');
    await app.close();
  });
});
