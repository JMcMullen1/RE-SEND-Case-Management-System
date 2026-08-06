import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { createCase } from '../repositories/create-case';
import { getStorageProvider } from '../storage';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('create case with smart-fill intake', () => {
  it('attaches the submission, records key dates, and timestamps consents', async () => {
    const db = getDb();
    const [user] = (await db.execute(
      sql`SELECT id FROM users LIMIT 1`,
    )) as unknown as { id: string }[];

    // Stage the submission in storage, exactly as the extract endpoint would.
    const storageKey = `intake/${randomUUID()}`;
    await getStorageProvider().put({
      key: storageKey,
      body: Buffer.from('Enquiry from a parent about an annual review.'),
      contentType: 'text/plain',
    });

    const { caseId } = await createCase(
      {
        client: {
          fullName: 'Test Parent',
          consentContact: true,
          consentDataProcessing: true,
        },
        child: { fullName: 'Test Child', dateOfBirth: '2015-01-01' },
        case: {
          currentWork: 'Annual Review',
          appealLodged: true,
          aims: 'Secure provision',
        },
        keyDates: [
          {
            date: '2026-06-01',
            title: 'Tribunal hearing',
            type: 'hearing',
            confidence: 0.9,
          },
        ],
        intake: {
          storageKey,
          filename: 'enquiry.txt',
          mimeType: 'text/plain',
          byteSize: 44,
          sha256: 'placeholder',
        },
      },
      user!.id,
    );

    // The submission is attached as a document with extracted text.
    const docs = (await db.execute(
      sql`SELECT category, extracted_text FROM documents WHERE case_id = ${caseId}`,
    )) as unknown as { category: string; extracted_text: string | null }[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.category).toBe('Correspondence');
    expect(docs[0]!.extracted_text).toContain('annual review');

    // The implied key date is created, sourced from the form.
    const kd = (await db.execute(
      sql`SELECT source, title FROM key_dates WHERE case_id = ${caseId}`,
    )) as unknown as { source: string; title: string }[];
    expect(kd).toHaveLength(1);
    expect(kd[0]!.source).toBe('jotform');

    // Consents are timestamped only where granted; the case fields are set.
    const cases = (await db.execute(
      sql`SELECT appeal_lodged, aims FROM cases WHERE id = ${caseId}`,
    )) as unknown as { appeal_lodged: boolean; aims: string | null }[];
    expect(cases[0]!.appeal_lodged).toBe(true);
    expect(cases[0]!.aims).toBe('Secure provision');

    const clients = (await db.execute(sql`
      SELECT cl.consent_contact, cl.consent_contact_at, cl.consent_information_sharing
      FROM clients cl JOIN cases c ON c.client_id = cl.id WHERE c.id = ${caseId}
    `)) as unknown as {
      consent_contact: boolean;
      consent_contact_at: string | null;
      consent_information_sharing: boolean;
    }[];
    expect(clients[0]!.consent_contact).toBe(true);
    expect(clients[0]!.consent_contact_at).toBeTruthy();
    // An ungranted consent stays false with no timestamp.
    expect(clients[0]!.consent_information_sharing).toBe(false);
  });
});
