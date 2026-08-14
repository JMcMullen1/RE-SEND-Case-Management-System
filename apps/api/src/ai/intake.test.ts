import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../storage';
import { singleDocumentCorpus } from '../corpus/case-corpus';
import type { MessagesClient } from './client';
import { runIntakeExtraction } from './intake';
import {
  IntakeExtractionSchema,
  mapExtraction,
  type IntakeExtraction,
} from './intake-job';

type F = { value: unknown; confidence: number | null; reason: string | null };
const val = (value: unknown, confidence = 0.9): F => ({
  value,
  confidence,
  reason: null,
});
const miss = (reason: string): F => ({ value: null, confidence: null, reason });

/** A fully-populated extraction with every field absent, for overriding. */
function baseExtraction(): IntakeExtraction {
  const keys = [
    'parentFullName',
    'parentDisplayName',
    'parentPreferredName',
    'contactPhone',
    'contactMobile',
    'email',
    'addressLine',
    'postcode',
    'parentAdditionalNeeds',
    'childFullName',
    'childPreferredName',
    'dateOfBirth',
    'schoolName',
    'schoolAddress',
    'sendNeeds',
    'serviceRequired',
    'enquiryRoute',
    'finalPlanReceived',
    'finalPlanIssuedDate',
    'mediationStatus',
    'appealLodged',
    'representationWanted',
    'supportLevel',
    'aims',
    'consentDataProcessing',
    'consentInformationSharing',
    'consentContact',
    'consentPrivacyNotice',
    'paymentPlanRequired',
  ];
  const obj: Record<string, unknown> = { keyDates: [] };
  for (const k of keys) obj[k] = miss('not present');
  return obj as unknown as IntakeExtraction;
}

describe('singleDocumentCorpus', () => {
  it('builds one document item and serialises it with its id', () => {
    const corpus = singleDocumentCorpus({
      id: 'doc-1',
      title: 'form.pdf',
      date: '2026-01-02',
      text: 'Parent: Sam Rivers',
    });
    expect(corpus.items).toHaveLength(1);
    expect(corpus.serialised).toContain('id=doc-1');
    expect(corpus.serialised).toContain('Parent: Sam Rivers');
    expect(corpus.tokenCount).toBeGreaterThan(0);
  });
});

describe('IntakeExtractionSchema resilience', () => {
  it('rescues malformed fields instead of failing the whole extraction', () => {
    const raw = {
      ...baseExtraction(),
      parentFullName: val('Alex Morgan'),
      // An out-of-vocabulary service code and a stringy boolean would each fail
      // a strict schema; they must be rescued to null, not abort the parse.
      serviceRequired: val('Something Not In The List'),
      consentContact: val('yes'),
      keyDates: [
        // An unknown type and an out-of-range confidence are coerced, not fatal.
        { date: '2026-03-01', title: 'Hearing', type: 'court', confidence: 5 },
      ],
    };
    const parsed = IntakeExtractionSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.parentFullName.value).toBe('Alex Morgan');
      expect(parsed.data.serviceRequired.value).toBeNull();
      expect(parsed.data.consentContact.value).toBeNull();
      expect(parsed.data.keyDates[0]!.type).toBe('other');
      expect(parsed.data.keyDates[0]!.confidence).toBe(0.5);
    }
  });

  it('tolerates omitted and wrongly-shaped fields', () => {
    // A sparse, imperfect response: most fields omitted entirely, one returned
    // as a bare value instead of the {value,confidence,reason} envelope, and no
    // keyDates key at all. This must still parse — a real model does this.
    const raw = {
      parentFullName: val('Alex Morgan'),
      email: 'alex@example.com',
    };
    const parsed = IntakeExtractionSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.parentFullName.value).toBe('Alex Morgan');
      expect(parsed.data.email.value).toBeNull(); // bare value → absent
      expect(parsed.data.paymentPlanRequired.value).toBeNull(); // omitted → absent
      expect(parsed.data.keyDates).toEqual([]); // omitted → empty
    }
  });
});

describe('mapExtraction', () => {
  const ref = {
    storageKey: 'intake/x',
    filename: 'f.pdf',
    mimeType: 'application/pdf',
    byteSize: 10,
    sha256: 'abc',
  };

  it('maps fields, derives method/year, and collects misses', () => {
    const raw = {
      ...baseExtraction(),
      parentFullName: val('Alex Morgan'),
      email: val('alex@example.com'),
      childFullName: val('Robin Morgan'),
      dateOfBirth: val('2015-05-01', 0.8),
      postcode: val('AL1 2AB', 0.7),
      serviceRequired: val('Annual Review', 0.55),
      enquiryRoute: val('New Application'),
      consentContact: val(true, 0.95),
      childPreferredName: miss('not stated'),
      keyDates: [
        {
          date: '2026-03-01',
          title: 'Tribunal hearing',
          type: 'hearing',
          confidence: 0.9,
        },
        { date: 'unknown', title: 'bad', type: 'other', confidence: 0.5 },
      ],
    } as IntakeExtraction;

    const result = mapExtraction(raw, {
      source: 'form',
      today: '2026-01-15',
      ref,
    });

    expect(result.client.fullName?.value).toBe('Alex Morgan');
    expect(result.child.fullName?.value).toBe('Robin Morgan');
    expect(result.case.currentWork?.value).toBe('Annual Review');
    expect(result.case.currentWork?.confidence).toBe(0.55);
    // Method derived from the known source.
    expect(result.case.methodOfEnquiry).toEqual({
      value: 'Query Form',
      confidence: 1,
    });
    // School year derived from DOB (carrying DOB confidence).
    expect(result.child.schoolYear?.value).toBeTruthy();
    expect(result.child.schoolYear?.confidence).toBe(0.8);
    // Consent boolean carried as a string.
    expect(result.client.consentContact?.value).toBe('true');
    // Invalid key date dropped; valid one kept.
    expect(result.keyDates).toHaveLength(1);
    expect(result.keyDates[0]!.title).toBe('Tribunal hearing');
    // Missing field reason recorded.
    expect(result.missing.some((m) => m.reason === 'not stated')).toBe(true);
  });

  it('uses the email method when the source is an email', () => {
    const result = mapExtraction(baseExtraction(), {
      source: 'email',
      today: '2026-01-15',
      ref,
    });
    expect(result.case.methodOfEnquiry?.value).toBe('Email - Enquiries');
  });
});

describe('runIntakeExtraction', () => {
  it('extracts, stores the submission, and maps the result', async () => {
    const puts: { key: string }[] = [];
    const storage = {
      put: async (o: { key: string }) => {
        puts.push(o);
      },
      get: async () => null,
      delete: async () => {},
      getSignedUrl: async () => '',
      exists: async () => false,
    } as unknown as StorageProvider;

    const extraction = {
      ...baseExtraction(),
      parentFullName: val('Jamie Lee'),
      childFullName: val('Sky Lee'),
      serviceRequired: val('Draft Review'),
    };
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'record_extract_intake',
              input: extraction,
            },
          ],
          usage: {
            input_tokens: 300,
            output_tokens: 50,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        }),
      },
    } as unknown as MessagesClient;

    const result = await runIntakeExtraction(
      {
        bytes: Buffer.from('Parent name: Jamie Lee\nChild: Sky Lee'),
        filename: 'enquiry.txt',
        mimeType: 'text/plain',
        source: 'form',
      },
      {
        storage,
        today: '2026-01-15',
        jobOverrides: {
          client,
          record: async () => {},
          getFlag: async () => null,
          globalEnabled: true,
        },
      },
    );

    expect(result.client.fullName?.value).toBe('Jamie Lee');
    expect(result.case.currentWork?.value).toBe('Draft Review');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toMatch(/^intake\//);
    expect(result.ref.storageKey).toBe(puts[0]!.key);
  });

  it('hands Claude the PDF itself when a PDF yields no extractable text', async () => {
    const storage = {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
      getSignedUrl: async () => '',
      exists: async () => false,
    } as unknown as StorageProvider;

    const create = vi.fn().mockResolvedValue({
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't1',
          name: 'record_extract_intake',
          input: baseExtraction(),
        },
      ],
      usage: {
        input_tokens: 300,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    const client = {
      messages: { create },
    } as unknown as MessagesClient;

    // A "scanned" PDF: valid %PDF header, no text layer the extractor can read.
    const scanned = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf8'),
      Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
    ]);

    await runIntakeExtraction(
      {
        bytes: scanned,
        filename: 'reSENDQueryForm.pdf',
        mimeType: 'application/pdf',
        source: 'form',
      },
      {
        storage,
        today: '2026-01-15',
        jobOverrides: {
          client,
          record: async () => {},
          getFlag: async () => null,
          globalEnabled: true,
        },
      },
    );

    const content = create.mock.calls[0]![0].messages[0].content as unknown[];
    expect(Array.isArray(content)).toBe(true);
    const doc = (content as { type: string }[]).find(
      (b) => b.type === 'document',
    ) as { source: { media_type: string; type: string } } | undefined;
    expect(doc?.source.media_type).toBe('application/pdf');
    expect(doc?.source.type).toBe('base64');
  });
});
