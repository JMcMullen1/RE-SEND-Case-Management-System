import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';

/**
 * Assisted drafting, network-stubbed: a ready draft is reviewed — sources
 * shown against each paragraph, a gap flagged — edited, and approved only
 * after the caseworker confirms they have checked it.
 */
const CASE_ID = '019fd7cc-0000-7000-8000-000000000001';
const DRAFT_ID = '019fd7cc-0000-7000-8000-0000000000a1';
const NOTE_ID = '019fd7cc-0000-7000-8000-0000000000b1';
const PARA_ID = '019fd7cc-0000-7000-8000-0000000000c1';

const caseDetail = {
  id: CASE_ID,
  caseReference: 'RS-2026-1001',
  appealNumber: null,
  status: 'Active',
  owner: { kind: 'queue', userId: null, displayName: null, queue: 'Enquiries' },
  shadowUserId: null,
  shadowUserName: null,
  team: [],
  dateOfEnquiry: '2026-04-01',
  methodOfEnquiry: null,
  originalQuery: null,
  currentWork: 'Section Appeal',
  consultStatus: 'not_required',
  supportLevel: null,
  aims: null,
  client: {
    id: 'c1',
    fullName: 'Test Parent',
    displayName: 'Parent, Test',
    preferredName: null,
    email: null,
    phone: null,
    mobile: null,
    otherContact: null,
    streetAddress: null,
    postcode: null,
    additionalNeeds: null,
    consentDataProcessingAt: null,
    consentInformationSharingAt: null,
    consentContactAt: null,
    consentPrivacyNoticeAt: null,
    paymentPlanRequired: false,
  },
  child: {
    id: 'ch1',
    fullName: 'Test Child',
    preferredName: null,
    dateOfBirth: '2015-01-01',
    schoolYear: null,
    currentSchoolName: null,
    currentSchoolAddress: null,
    desiredSchool: null,
    sendNeeds: null,
    la: null,
    laContacts: [],
  },
  keyDates: [],
  familyCases: [{ caseId: CASE_ID, childName: 'Test Child' }],
};

const sections = [
  'background',
  'needs',
  'provision',
  'placement',
  'issues',
  'outcome',
].map((key) => ({
  key,
  heading:
    key === 'provision' ? 'Special educational provision (Section F)' : key,
  paragraphs:
    key === 'provision'
      ? [
          {
            id: PARA_ID,
            text: 'The child needs weekly speech and language therapy.',
            sourceIds: [NOTE_ID],
            edited: false,
          },
        ]
      : [],
  gap:
    key === 'provision'
      ? null
      : 'Nothing in the case file supported this section.',
}));

function draft(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    caseId: CASE_ID,
    kind: 'position_statement',
    status,
    instructions: null,
    sections,
    missingInformation: ['The current Section F'],
    sources: [
      {
        id: NOTE_ID,
        type: 'note',
        title: 'Note — Case Worker',
        date: '2026-04-02',
        excerpt: 'The EP report says weekly SALT is needed.',
      },
    ],
    removedUnsupported: 1,
    failureReason: null,
    createdByName: 'Case Worker',
    createdAt: '2026-11-14T10:00:00.000Z',
    approvedByName: null,
    approvedAt: null,
    documentId: null,
    ...extra,
  };
}

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test('a draft is reviewed against its sources, edited, and approved', async ({
  page,
}) => {
  const me = {
    id: 'u1',
    displayName: 'Case Worker',
    role: 'caseworker',
    active: true,
  };
  let state = draft('ready');
  let saved: unknown = null;
  let approved = false;

  await page.route('**/api/auth/session', (r) => json(r, me));
  await page.route('**/api/me', (r) => json(r, me));
  await page.route('**/api/users', (r) => json(r, { users: [me] }));
  await page.route(`**/api/cases/${CASE_ID}/detail`, (r) =>
    json(r, caseDetail),
  );
  await page.route(`**/api/cases/${CASE_ID}/schools`, (r) =>
    json(r, { schools: [] }),
  );
  await page.route(`**/api/cases/${CASE_ID}/drafts`, (r) =>
    json(r, { drafts: [state] }),
  );
  await page.route(`**/api/drafts/${DRAFT_ID}`, async (r) => {
    saved = JSON.parse(r.request().postData() ?? '{}');
    return json(r, state);
  });
  await page.route(`**/api/drafts/${DRAFT_ID}/approve`, async (r) => {
    approved = true;
    state = draft('approved', {
      approvedByName: 'Case Worker',
      approvedAt: '2026-11-14T10:30:00.000Z',
      documentId: '019fd7cc-0000-7000-8000-0000000000d9',
    });
    return json(r, state);
  });

  await page.goto(`/cases/${CASE_ID}`);
  await page.getByRole('tab', { name: 'Drafting' }).click();
  await expect(
    page.getByRole('button', { name: 'Draft a position statement' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review' }).click();

  // Each paragraph shows its sources; gaps and removals are stated plainly.
  await expect(page.getByText('From [1]')).toBeVisible();
  await expect(
    page.getByText('The EP report says weekly SALT is needed.'),
  ).toBeVisible();
  await expect(
    page.getByText(/1 passage was removed because nothing in the file/),
  ).toBeVisible();
  await expect(page.getByText('The current Section F')).toBeVisible();

  // The review screen has no serious accessibility problems.
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
      ),
  ).toEqual([]);

  // Edit, then approve: approval needs the confirmation tick.
  await page
    .getByLabel('Special educational provision (Section F), paragraph 1')
    .fill('The child needs weekly speech and language therapy (EP report).');
  await page.getByRole('button', { name: 'Approve and file…' }).click();
  const dialog = page.getByRole('dialog', { name: /Approve this/ });
  const confirm = dialog.getByRole('button', { name: 'Approve and file' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await confirm.click();

  await expect(page.getByText(/Approved by Case Worker/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download the Word document' }),
  ).toBeVisible();
  expect(approved).toBe(true);
  // Unsaved edits were saved before approval.
  expect(JSON.stringify(saved)).toContain('(EP report)');
});
