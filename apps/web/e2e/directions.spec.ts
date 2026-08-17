import { expect, test, type Route } from '@playwright/test';

const CASE_ID = '019fd7cc-0000-7000-8000-000000000001';
const DOC_ID = '019fd7cc-0000-7000-8000-0000000000d0';

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
  },
  keyDates: [],
  familyCases: [{ caseId: CASE_ID, childName: 'Test Child' }],
};

const review = {
  status: 'ok',
  review: {
    documentId: DOC_ID,
    filename: 'directions-order.pdf',
    orderDate: '2026-04-01',
    summary: '1 new date, 1 date moved',
    counts: { new: 1, moved: 1, superseded: 0, unchanged: 0 },
    rows: [
      {
        class: 'new',
        existingKeyDateId: null,
        oldValue: null,
        newValue: { date: '2026-06-08', time: '10:00', title: 'Hearing' },
        category: 'Final Hearing',
        party: 'tribunal',
        obligation: 'The final hearing is listed for 8 June 2026 at 10am.',
        rawDateText: '8 June 2026',
        workingDays: false,
        explanation: null,
        paragraph: 1,
        confidence: 0.95,
        include: true,
      },
      {
        class: 'moved',
        existingKeyDateId: 'e1',
        oldValue: {
          date: '2026-05-01',
          time: null,
          title: 'Evidence deadline',
        },
        newValue: {
          date: '2026-05-22',
          time: '16:00',
          title: 'Evidence deadline',
        },
        category: 'Final Evidence Deadline',
        party: 'appellant',
        obligation:
          'The appellant shall file evidence no later than 4pm 10 working days before the hearing.',
        rawDateText: '10 working days before the hearing',
        workingDays: true,
        explanation:
          '10 working days before the hearing on 2026-06-08 (skipping weekends and 1 bank holiday: Spring bank holiday) = 2026-05-22 at 16:00',
        paragraph: 3,
        confidence: 0.9,
        include: true,
      },
    ],
  },
};

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

// Let the auth gate through: the smoke stubs a signed-in session.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', (r) =>
    json(r, {
      id: 'u1',
      displayName: 'Case Worker',
      role: 'caseworker',
      active: true,
    }),
  );
});

test('directions review renders the diff and applies it', async ({ page }) => {
  let applied: unknown = null;

  await page.route('**/api/me', (r) =>
    json(r, {
      id: 'u1',
      displayName: 'Case Worker',
      role: 'caseworker',
      active: true,
    }),
  );
  await page.route('**/api/users', (r) =>
    json(r, {
      users: [
        {
          id: 'u1',
          displayName: 'Case Worker',
          role: 'caseworker',
          active: true,
        },
      ],
    }),
  );
  await page.route(`**/api/cases/${CASE_ID}/detail`, (r) =>
    json(r, caseDetail),
  );
  await page.route(`**/api/cases/${CASE_ID}/documents`, (r) =>
    json(r, { documents: [] }),
  );
  await page.route(`**/api/cases/${CASE_ID}/timeline*`, (r) =>
    json(r, { items: [] }),
  );
  await page.route(`**/api/cases/${CASE_ID}/directions/extract`, (r) =>
    json(r, review),
  );
  await page.route(`**/api/cases/${CASE_ID}/directions/apply`, async (r) => {
    applied = JSON.parse(r.request().postData() ?? '{}');
    return json(r, {
      created: 1,
      superseded: 1,
      summary: '1 new date, 1 date moved',
    });
  });

  await page.goto(`/cases/${CASE_ID}`);

  // Upload a directions order via the hidden file input.
  await expect(
    page.getByRole('button', { name: 'Upload directions' }),
  ).toBeVisible();
  await page.setInputFiles('input[type="file"]', {
    name: 'directions-order.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake order'),
  });

  // The review modal opens with the plain summary and both rows.
  const dialog = page.getByRole('dialog', { name: 'Review directions' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('1 new date, 1 date moved')).toBeVisible();
  await expect(dialog.getByText('Spring bank holiday')).toBeVisible();
  // The source paragraph is quoted next to the row.
  await expect(dialog.getByText(/¶3:/)).toBeVisible();
  // Old and new value shown side by side for the moved row.
  await expect(dialog.getByText('2026-05-01')).toBeVisible();
  await expect(dialog.getByText('2026-05-22', { exact: false })).toBeVisible();

  // Apply the changes.
  await dialog.getByRole('button', { name: 'Apply changes' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Calendar updated/)).toBeVisible();

  // The apply payload carried both included rows to the API.
  expect(applied).toMatchObject({ documentId: DOC_ID });
  const rows = (applied as { rows: unknown[] }).rows;
  expect(rows).toHaveLength(2);
});
