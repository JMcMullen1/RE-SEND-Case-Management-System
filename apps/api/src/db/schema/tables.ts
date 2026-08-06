import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, retention, softDelete, timestamps } from './columns';
import {
  aiJobOutcomeEnum,
  caseStatusEnum,
  consultationStateEnum,
  discountCodeEnum,
  documentCategoryEnum,
  dsplAreaEnum,
  emailDirectionEnum,
  enquiryMethodEnum,
  externalSyncStatusEnum,
  keyDateSourceEnum,
  keyDateTypeEnum,
  ownerQueueEnum,
  paymentCodeEnum,
  queryTypeEnum,
  schoolYearEnum,
  userRoleEnum,
  workTypeEnum,
} from './enums';

// --- users ------------------------------------------------------------------
// The staff list. Joiners and leavers toggle `active`; the app never reads a
// staff list from config.
export const users = pgTable('users', {
  id: primaryId(),
  entraObjectId: text('entra_object_id').unique(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  role: userRoleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
  // Opaque token authenticating this user's read-only iCal feed. Set lazily the
  // first time the user asks for their subscribe URL; rotating it revokes the
  // old feed. Two-way Graph sync, when added, lives in a separate mapping and
  // does not touch this column.
  icalToken: text('ical_token').unique(),
  ...timestamps,
});

// --- teams / case_teams -----------------------------------------------------
// A case belongs to one or more teams (many-to-many, not an enum): around one
// in ten cases sits with both TSA and ISA at once.
export const teams = pgTable('teams', {
  id: primaryId(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps,
});

export const caseTeams = pgTable(
  'case_teams',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => ({
    uniquePair: uniqueIndex('uq_case_teams_case_team').on(t.caseId, t.teamId),
    caseIdIdx: index('idx_case_teams_case_id').on(t.caseId),
    teamIdIdx: index('idx_case_teams_team_id').on(t.teamId),
  }),
);

// --- clients ----------------------------------------------------------------
export const clients = pgTable(
  'clients',
  {
    id: primaryId(),
    fullName: text('full_name').notNull(),
    displayName: text('display_name').notNull(),
    preferredName: text('preferred_name'),
    email: text('email'),
    phone: text('phone'),
    mobile: text('mobile'),
    otherContact: text('other_contact'),
    streetAddress: text('street_address'),
    city: text('city'),
    county: text('county'),
    postcode: text('postcode'),
    dsplArea: dsplAreaEnum('dspl_area'),
    additionalNeeds: text('additional_needs'),
    consentDataProcessing: boolean('consent_data_processing')
      .notNull()
      .default(false),
    consentDataProcessingAt: timestamp('consent_data_processing_at', {
      withTimezone: true,
    }),
    consentInformationSharing: boolean('consent_information_sharing')
      .notNull()
      .default(false),
    consentInformationSharingAt: timestamp('consent_information_sharing_at', {
      withTimezone: true,
    }),
    consentContact: boolean('consent_contact').notNull().default(false),
    consentContactAt: timestamp('consent_contact_at', { withTimezone: true }),
    consentPrivacyNotice: boolean('consent_privacy_notice')
      .notNull()
      .default(false),
    consentPrivacyNoticeAt: timestamp('consent_privacy_notice_at', {
      withTimezone: true,
    }),
    paymentPlanRequired: boolean('payment_plan_required')
      .notNull()
      .default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    dsplAreaIdx: index('idx_clients_dspl_area').on(t.dsplArea),
  }),
);

// --- children ---------------------------------------------------------------
export const children = pgTable('children', {
  id: primaryId(),
  fullName: text('full_name').notNull(),
  preferredName: text('preferred_name'),
  dateOfBirth: date('date_of_birth'),
  schoolYear: schoolYearEnum('school_year'),
  currentSchoolName: text('current_school_name'),
  currentSchoolAddress: text('current_school_address'),
  desiredSchool: text('desired_school'),
  sendNeeds: text('send_needs'),
  ...timestamps,
  ...softDelete,
});

// --- client_children --------------------------------------------------------
// Join table: siblings (one client, many children) and shared parental
// responsibility (one child, many clients) both occur.
export const clientChildren = pgTable(
  'client_children',
  {
    id: primaryId(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    relationship: text('relationship'),
    ...timestamps,
  },
  (t) => ({
    uniquePair: uniqueIndex('uq_client_children_client_child').on(
      t.clientId,
      t.childId,
    ),
    clientIdIdx: index('idx_client_children_client_id').on(t.clientId),
    childIdIdx: index('idx_client_children_child_id').on(t.childId),
  }),
);

// --- cases ------------------------------------------------------------------
// `client_id` / `child_id` name the primary client and child a case is about;
// the view and the whole UI hang off them.
export const cases = pgTable(
  'cases',
  {
    id: primaryId(),
    caseReference: text('case_reference').notNull().unique(),
    appealNumber: text('appeal_number'),
    dateOfEnquiry: date('date_of_enquiry').notNull(),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    childId: uuid('child_id').references(() => children.id, {
      onDelete: 'restrict',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    ownerQueue: ownerQueueEnum('owner_queue'),
    shadowUserId: uuid('shadow_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: caseStatusEnum('status').notNull().default('Enquiry'),
    originalQuery: queryTypeEnum('original_query'),
    currentWork: workTypeEnum('current_work'),
    methodOfEnquiry: enquiryMethodEnum('method_of_enquiry'),
    consultStatus: consultationStateEnum('consult_status')
      .notNull()
      .default('not_required'),
    supportLevel: text('support_level'),
    mediationStatus: text('mediation_status'),
    finalPlanIssuedDate: date('final_plan_issued_date'),
    appealLodged: boolean('appeal_lodged').notNull().default(false),
    representationWanted: boolean('representation_wanted')
      .notNull()
      .default(false),
    aims: text('aims'),
    closedDate: date('closed_date'),
    paymentCode: paymentCodeEnum('payment_code'),
    discountCode: discountCodeEnum('discount_code'),
    invoiceStatusText: text('invoice_status_text'),
    accountingNotes: text('accounting_notes'),
    ...retention,
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    // Owned by exactly one of: a named user OR a queue. Never both, never
    // neither.
    ownerXor: check(
      'ck_cases_owner_user_xor_queue',
      sql`num_nonnulls(${t.ownerUserId}, ${t.ownerQueue}) = 1`,
    ),
    clientIdIdx: index('idx_cases_client_id').on(t.clientId),
    childIdIdx: index('idx_cases_child_id').on(t.childId),
    ownerUserIdIdx: index('idx_cases_owner_user_id').on(t.ownerUserId),
    shadowUserIdIdx: index('idx_cases_shadow_user_id').on(t.shadowUserId),
    statusIdx: index('idx_cases_status').on(t.status),
  }),
);

// --- case_notes -------------------------------------------------------------
// One row per dated entry. Ends the legacy practice of keeping an entire case
// history in a single spreadsheet cell.
export const caseNotes = pgTable(
  'case_notes',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    entryDate: date('entry_date').notNull(),
    body: text('body').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_case_notes_case_id').on(t.caseId),
    authorUserIdIdx: index('idx_case_notes_author_user_id').on(t.authorUserId),
    caseEntryDateIdx: index('idx_case_notes_case_entry_date').on(
      t.caseId,
      t.entryDate,
    ),
  }),
);

// --- key_dates --------------------------------------------------------------
export const keyDates = pgTable(
  'key_dates',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    time: time('time'),
    title: text('title').notNull(),
    description: text('description'),
    type: keyDateTypeEnum('type').notNull(),
    source: keyDateSourceEnum('source').notNull().default('manual'),
    confidence: text('confidence'),
    sourceDocumentId: uuid('source_document_id').references(
      () => documents.id,
      { onDelete: 'set null' },
    ),
    sourceReference: text('source_reference'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id').references(
      (): AnyPgColumn => keyDates.id,
      { onDelete: 'set null' },
    ),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_key_dates_case_id').on(t.caseId),
    sourceDocumentIdIdx: index('idx_key_dates_source_document_id').on(
      t.sourceDocumentId,
    ),
    supersededByIdIdx: index('idx_key_dates_superseded_by_id').on(
      t.supersededById,
    ),
    // Supports "cases ordered by next upcoming key date": the soonest live,
    // non-superseded key date per case.
    caseNextIdx: index('idx_key_dates_case_next')
      .on(t.caseId, t.date)
      .where(sql`superseded_at IS NULL AND deleted_at IS NULL`),
  }),
);

// --- case_reviews -----------------------------------------------------------
export const caseReviews = pgTable(
  'case_reviews',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    reviewedByUserId: uuid('reviewed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text('note'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_case_reviews_case_id').on(t.caseId),
    reviewedByUserIdIdx: index('idx_case_reviews_reviewed_by_user_id').on(
      t.reviewedByUserId,
    ),
  }),
);

// --- documents --------------------------------------------------------------
export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    category: documentCategoryEnum('category').notNull(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    // Text pulled out of the file on upload (PDF, DOCX, plain text), fed to the
    // case corpus and Postgres full-text search. Null when extraction is not
    // possible for the type or failed; the raw file is always the source of truth.
    extractedText: text('extracted_text'),
    documentGroupId: uuid('document_group_id'),
    version: integer('version').notNull().default(1),
    supersededById: uuid('superseded_by_id').references(
      (): AnyPgColumn => documents.id,
      { onDelete: 'set null' },
    ),
    ...retention,
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_documents_case_id').on(t.caseId),
    uploadedByUserIdIdx: index('idx_documents_uploaded_by_user_id').on(
      t.uploadedByUserId,
    ),
    supersededByIdIdx: index('idx_documents_superseded_by_id').on(
      t.supersededById,
    ),
    documentGroupIdIdx: index('idx_documents_document_group_id').on(
      t.documentGroupId,
    ),
  }),
);

// --- audit_log --------------------------------------------------------------
// Append-only record of every mutation. Never holds personal data — the diff
// columns capture identifiers and outcomes, not people.
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ...timestamps,
  },
  (t) => ({
    actorUserIdIdx: index('idx_audit_log_actor_user_id').on(t.actorUserId),
    entityIdx: index('idx_audit_log_entity').on(t.entityType, t.entityId),
  }),
);

// --- emails (created now; nothing populates it yet) -------------------------
export const emails = pgTable(
  'emails',
  {
    id: primaryId(),
    internetMessageId: text('internet_message_id'),
    graphMessageId: text('graph_message_id'),
    subject: text('subject'),
    fromAddress: text('from_address'),
    toAddresses: text('to_addresses').array(),
    ccAddresses: text('cc_addresses').array(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    direction: emailDirectionEnum('direction').notNull(),
    caseId: uuid('case_id').references(() => cases.id, {
      onDelete: 'set null',
    }),
    rawDocumentId: uuid('raw_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    ...retention,
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_emails_case_id').on(t.caseId),
    rawDocumentIdIdx: index('idx_emails_raw_document_id').on(t.rawDocumentId),
  }),
);

// --- time_entries (created now; nothing populates it yet) -------------------
export const timeEntries = pgTable(
  'time_entries',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    entryDate: date('entry_date').notNull(),
    minutes: integer('minutes').notNull(),
    narrative: text('narrative'),
    billable: boolean('billable').notNull().default(true),
    externalSyncStatus: externalSyncStatusEnum('external_sync_status')
      .notNull()
      .default('not_synced'),
    externalId: text('external_id'),
    rateSnapshot: numeric('rate_snapshot', { precision: 10, scale: 2 }),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    caseIdIdx: index('idx_time_entries_case_id').on(t.caseId),
    userIdIdx: index('idx_time_entries_user_id').on(t.userId),
  }),
);

// --- ai_job_runs ------------------------------------------------------------
// Append-only cost-accounting log: one row per AI job invocation. Records what
// ran and what it cost — job name, model, token counts, latency and outcome —
// and NEVER the prompt or the response, both of which carry special category
// data about a child. Spend per job type over time reads from the
// ai_spend_by_job view built on this table.
export const aiJobRuns = pgTable(
  'ai_job_runs',
  {
    id: primaryId(),
    jobName: text('job_name').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    outcome: aiJobOutcomeEnum('outcome').notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 })
      .notNull()
      .default('0'),
    ...timestamps,
  },
  (t) => ({
    jobNameIdx: index('idx_ai_job_runs_job_name').on(t.jobName),
    createdAtIdx: index('idx_ai_job_runs_created_at').on(t.createdAt),
  }),
);

// --- ai_job_flags -----------------------------------------------------------
// Per-job on/off switch, toggled at runtime so an AI feature can be turned off
// without a deploy. Absence of a row means "use the job definition's default";
// the global AI_ENABLED env var overrides everything.
export const aiJobFlags = pgTable('ai_job_flags', {
  id: primaryId(),
  jobName: text('job_name').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
});

// --- saved_views ------------------------------------------------------------
// A stored case-list view. `owner_user_id` null means a shared view; the seeded
// starter views live in config and are served read-only alongside these.
export const savedViews = pgTable(
  'saved_views',
  {
    id: primaryId(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    state: jsonb('state').notNull(),
    ...timestamps,
  },
  (t) => ({
    ownerUserIdIdx: index('idx_saved_views_owner_user_id').on(t.ownerUserId),
  }),
);
