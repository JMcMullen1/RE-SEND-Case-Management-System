import { z } from 'zod';
import {
  ConsultationStateSchema,
  CorpusItemTypeSchema,
  DiscountCodeSchema,
  DocumentCategorySchema,
  EnquiryMethodSchema,
  KeyDateSourceSchema,
  OptionalColumnSchema,
  OwnerQueueSchema,
  PaymentCodeSchema,
  QueryTypeSchema,
  SchoolYearSchema,
  SortSchema,
  StatusSchema,
  TeamSchema,
  WorkTypeSchema,
  KeyDateTypeSchema,
  DirectionPartySchema,
} from '@re-send/shared';

/** Mirrors the shared CaseFilters type; validates every facet value. */
export const CaseFiltersSchema = z.object({
  mine: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  staff: z.array(z.string()).optional(),
  dealingShadow: z.array(z.string()).optional(),
  status: z.array(StatusSchema).optional(),
  team: z.array(TeamSchema).optional(),
  workType: z.array(WorkTypeSchema).optional(),
  queryType: z.array(QueryTypeSchema).optional(),
  enquiryMethod: z.array(EnquiryMethodSchema).optional(),
  enquiryYear: z.array(z.number()).optional(),
  paymentCode: z.array(PaymentCodeSchema).optional(),
  discountCode: z.array(DiscountCodeSchema).optional(),
  schoolYear: z.array(SchoolYearSchema).optional(),
  consultationState: z.array(ConsultationStateSchema).optional(),
  noNoteInDays: z.number().optional(),
  notReviewedInDays: z.number().optional(),
  keyDatePassed: z.boolean().optional(),
  keyDateWithinDays: z.number().optional(),
  noKeyDate: z.boolean().optional(),
  missingConsent: z.boolean().optional(),
});

// --- DTOs -------------------------------------------------------------------

export const KeyDateLiteSchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string().nullable(),
  type: KeyDateTypeSchema,
  title: z.string(),
});

export const CaseOwnerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    userId: z.string(),
    displayName: z.string(),
  }),
  z.object({ kind: z.literal('queue'), queue: OwnerQueueSchema }),
]);

export const CaseListRowSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  childName: z.string().nullable(),
  currentWork: z.string().nullable(),
  originalQuery: z.string().nullable(),
  owner: CaseOwnerSchema,
  status: StatusSchema,
  shadowUserName: z.string().nullable(),
  team: z.array(TeamSchema),
  dateOfEnquiry: z.string().nullable(),
  methodOfEnquiry: EnquiryMethodSchema.nullable(),
  schoolYear: z.string().nullable(),
  paymentCode: z.string().nullable(),
  discountCode: z.string().nullable(),
  invoiceStatusText: z.string().nullable(),
  consultStatus: ConsultationStateSchema,
  mostRecentNoteDate: z.string().nullable(),
  lastReviewedAt: z.string().nullable(),
  keyDates: z.array(KeyDateLiteSchema),
});

export const CaseListResponseSchema = z.object({
  rows: z.array(CaseListRowSchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
  facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

// --- View state / saved views ----------------------------------------------

export const ViewStateSchema = z.object({
  mode: z.enum(['simple', 'advanced']),
  sort: SortSchema,
  density: z.enum(['comfortable', 'compact']),
  search: z.string(),
  columns: z.array(OptionalColumnSchema),
  filters: CaseFiltersSchema,
});

export const SavedViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string().nullable(),
  shared: z.boolean(),
  state: ViewStateSchema,
});

export const SavedViewSeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['simple', 'advanced']),
  sort: SortSchema,
  filters: z.record(z.string(), z.unknown()),
});

// --- Users ------------------------------------------------------------------

export const UserSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.string(),
  active: z.boolean(),
});

// --- Requests ---------------------------------------------------------------

export const CaseListQuerystringSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .passthrough();

export const OwnerTargetSchema = z
  .object({
    ownerUserId: z.string().uuid().optional(),
    ownerQueue: OwnerQueueSchema.optional(),
  })
  .refine(
    (v) => (v.ownerUserId ? 1 : 0) + (v.ownerQueue ? 1 : 0) === 1,
    'Provide exactly one of ownerUserId or ownerQueue.',
  );

// --- Case screen: DTOs ------------------------------------------------------

export const KeyDateFullSchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  type: KeyDateTypeSchema,
  source: KeyDateSourceSchema,
  confidence: z.string().nullable(),
  sourceReference: z.string().nullable(),
});

export const CaseClientDetailSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  displayName: z.string(),
  preferredName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  otherContact: z.string().nullable(),
  streetAddress: z.string().nullable(),
  city: z.string().nullable(),
  county: z.string().nullable(),
  postcode: z.string().nullable(),
  additionalNeeds: z.string().nullable(),
  consentDataProcessing: z.boolean(),
  consentInformationSharing: z.boolean(),
  consentContact: z.boolean(),
  consentPrivacyNotice: z.boolean(),
  paymentPlanRequired: z.boolean(),
});

export const CaseChildDetailSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  preferredName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  schoolYear: SchoolYearSchema.nullable(),
  currentSchoolName: z.string().nullable(),
  currentSchoolAddress: z.string().nullable(),
  desiredSchool: z.string().nullable(),
  sendNeeds: z.string().nullable(),
});

export const CaseDetailSchema = z.object({
  id: z.string(),
  caseReference: z.string(),
  appealNumber: z.string().nullable(),
  status: StatusSchema,
  owner: z.object({
    kind: z.enum(['user', 'queue']),
    userId: z.string().nullable(),
    displayName: z.string().nullable(),
    queue: OwnerQueueSchema.nullable(),
  }),
  shadowUserId: z.string().nullable(),
  shadowUserName: z.string().nullable(),
  team: z.array(TeamSchema),
  dateOfEnquiry: z.string().nullable(),
  methodOfEnquiry: EnquiryMethodSchema.nullable(),
  originalQuery: QueryTypeSchema.nullable(),
  currentWork: WorkTypeSchema.nullable(),
  consultStatus: ConsultationStateSchema,
  supportLevel: z.string().nullable(),
  aims: z.string().nullable(),
  client: CaseClientDetailSchema.nullable(),
  child: CaseChildDetailSchema.nullable(),
  keyDates: z.array(KeyDateFullSchema),
});

export const DocumentInfoSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  category: DocumentCategorySchema,
  uploadedByName: z.string().nullable(),
  uploadedAt: z.string(),
  version: z.number(),
  versionCount: z.number(),
});

export const DocumentVersionInfoSchema = z.object({
  id: z.string(),
  version: z.number(),
  byteSize: z.number(),
  uploadedByName: z.string().nullable(),
  uploadedAt: z.string(),
  isCurrent: z.boolean(),
});

export const DocumentUploadResultSchema = z.object({
  document: DocumentInfoSchema,
  outcome: z.enum(['created', 'version', 'duplicate']),
});

export const CorpusItemSchema = z.object({
  id: z.string(),
  type: CorpusItemTypeSchema,
  title: z.string(),
  date: z.string().nullable(),
  text: z.string(),
});

const IntakeFieldValueSchema = z.object({
  value: z.string(),
  confidence: z.number(),
});

export const IntakeResultSchema = z.object({
  source: z.enum(['form', 'email']),
  client: z.record(IntakeFieldValueSchema),
  child: z.record(IntakeFieldValueSchema),
  case: z.record(IntakeFieldValueSchema),
  keyDates: z.array(
    z.object({
      date: z.string(),
      title: z.string(),
      type: z.string(),
      confidence: z.number(),
    }),
  ),
  missing: z.array(z.object({ field: z.string(), reason: z.string() })),
  ref: z.object({
    storageKey: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    byteSize: z.number(),
    sha256: z.string(),
  }),
});

export const IntakeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: IntakeResultSchema }),
  z.object({ status: z.literal('disabled') }),
  z.object({ status: z.literal('refused') }),
  z.object({ status: z.literal('error'), message: z.string() }),
]);

export const AiJobFlagSchema = z.object({
  jobName: z.string(),
  enabled: z.boolean(),
});

// --- Directions ingestion ---------------------------------------------------

const DiffClassSchema = z.enum(['new', 'moved', 'superseded', 'unchanged']);

const DirectionValueSchema = z.object({
  date: z.string(),
  time: z.string().nullable(),
  title: z.string(),
});

export const DirectionDiffRowSchema = z.object({
  class: DiffClassSchema,
  existingKeyDateId: z.string().nullable(),
  oldValue: DirectionValueSchema.nullable(),
  newValue: DirectionValueSchema.nullable(),
  type: KeyDateTypeSchema,
  party: DirectionPartySchema,
  obligation: z.string(),
  rawDateText: z.string(),
  workingDays: z.boolean(),
  explanation: z.string().nullable(),
  paragraph: z.number().nullable(),
  confidence: z.number(),
  include: z.boolean(),
});

const DiffCountsSchema = z.object({
  new: z.number(),
  moved: z.number(),
  superseded: z.number(),
  unchanged: z.number(),
});

export const DirectionsReviewSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  orderDate: z.string().nullable(),
  summary: z.string(),
  counts: DiffCountsSchema,
  rows: z.array(DirectionDiffRowSchema),
});

export const DirectionsResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), review: DirectionsReviewSchema }),
  z.object({ status: z.literal('disabled') }),
  z.object({ status: z.literal('refused') }),
  z.object({ status: z.literal('error'), message: z.string() }),
]);

export const DirectionApplyRowSchema = z.object({
  class: DiffClassSchema,
  include: z.boolean(),
  existingKeyDateId: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  title: z.string(),
  type: KeyDateTypeSchema,
  obligation: z.string(),
  sourceReference: z.string().nullable(),
  confidence: z.number().optional(),
});

export const ApplyDirectionsRequestSchema = z.object({
  documentId: z.string().uuid().nullable(),
  rows: z.array(DirectionApplyRowSchema),
});

export const DirectionsApplyResultSchema = z.object({
  created: z.number(),
  superseded: z.number(),
  summary: z.string(),
});

// --- Calendar ---------------------------------------------------------------

export const CalendarEventSchema = z.object({
  keyDateId: z.string(),
  caseId: z.string(),
  caseReference: z.string(),
  childName: z.string().nullable(),
  title: z.string(),
  type: KeyDateTypeSchema,
  date: z.string(),
  time: z.string().nullable(),
  status: StatusSchema,
  ownerUserId: z.string().nullable(),
  ownerName: z.string().nullable(),
  teamCodes: z.array(TeamSchema),
  superseded: z.boolean(),
  sourceReference: z.string().nullable(),
});

export const CalendarQuerySchema = z.object({
  scope: z.enum(['mine', 'all', 'user']).default('all'),
  userId: z.string().optional(),
  team: TeamSchema.optional(),
  /** Comma-separated key-date types. */
  types: z.string().optional(),
  /** Comma-separated case statuses. */
  statuses: z.string().optional(),
  includeSuperseded: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const CalendarCaseMatchSchema = z.object({
  id: z.string(),
  caseReference: z.string(),
  childName: z.string().nullable(),
  clientName: z.string().nullable(),
});

export const BankHolidaysResponseSchema = z.object({
  source: z.enum(['feed', 'snapshot']),
  events: z.array(z.object({ date: z.string(), title: z.string() })),
});

export const AiSpendByJobSchema = z.object({
  jobName: z.string(),
  model: z.string(),
  runs: z.number(),
  successes: z.number(),
  refusals: z.number(),
  errors: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.string(),
  lastRunAt: z.string(),
});

export const CorpusResultSchema = z.object({
  caseId: z.string(),
  items: z.array(CorpusItemSchema),
  excluded: z.array(
    z.object({
      id: z.string(),
      type: CorpusItemTypeSchema,
      reason: z.enum(['superseded', 'deleted', 'no-text']),
    }),
  ),
  registeredEmpty: z.array(CorpusItemTypeSchema),
  serialised: z.string(),
  tokenCount: z.number(),
});

const TimelineBase = {
  id: z.string(),
  occurredOn: z.string(),
  createdAt: z.string(),
  authorUserId: z.string().nullable(),
  authorName: z.string().nullable(),
};

export const TimelineItemSchema = z.discriminatedUnion('type', [
  z.object({
    ...TimelineBase,
    type: z.literal('note'),
    body: z.string(),
    canEdit: z.boolean(),
    edited: z.boolean(),
  }),
  z.object({
    ...TimelineBase,
    type: z.literal('time_entry'),
    minutes: z.number(),
    narrative: z.string().nullable(),
    billable: z.boolean(),
  }),
  z.object({
    ...TimelineBase,
    type: z.literal('email'),
    subject: z.string().nullable(),
    direction: z.string(),
  }),
  z.object({
    ...TimelineBase,
    type: z.literal('document'),
    filename: z.string(),
    category: z.string(),
  }),
  z.object({
    ...TimelineBase,
    type: z.literal('key_date_change'),
    summary: z.string(),
  }),
]);

// --- Case screen: requests --------------------------------------------------

export const CaseFieldsPatchSchema = z
  .object({
    appealNumber: z.string().nullable().optional(),
    status: StatusSchema.optional(),
    methodOfEnquiry: EnquiryMethodSchema.nullable().optional(),
    originalQuery: QueryTypeSchema.nullable().optional(),
    currentWork: WorkTypeSchema.nullable().optional(),
    consultStatus: ConsultationStateSchema.optional(),
    supportLevel: z.string().nullable().optional(),
    aims: z.string().nullable().optional(),
    dateOfEnquiry: z.string().optional(),
    shadowUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const ClientFieldsPatchSchema = z
  .object({
    fullName: z.string().optional(),
    displayName: z.string().optional(),
    preferredName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    otherContact: z.string().nullable().optional(),
    streetAddress: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    county: z.string().nullable().optional(),
    postcode: z.string().nullable().optional(),
    additionalNeeds: z.string().nullable().optional(),
    consentDataProcessing: z.boolean().optional(),
    consentInformationSharing: z.boolean().optional(),
    consentContact: z.boolean().optional(),
    consentPrivacyNotice: z.boolean().optional(),
    paymentPlanRequired: z.boolean().optional(),
  })
  .strict();

export const ChildFieldsPatchSchema = z
  .object({
    fullName: z.string().optional(),
    preferredName: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    schoolYear: SchoolYearSchema.nullable().optional(),
    currentSchoolName: z.string().nullable().optional(),
    currentSchoolAddress: z.string().nullable().optional(),
    desiredSchool: z.string().nullable().optional(),
    sendNeeds: z.string().nullable().optional(),
  })
  .strict();

export const KeyDateCreateSchema = z.object({
  date: z.string(),
  time: z.string().nullable().optional(),
  title: z.string().min(1),
  type: KeyDateTypeSchema,
  description: z.string().nullable().optional(),
  source: KeyDateSourceSchema.optional(),
  confidence: z.string().nullable().optional(),
  sourceReference: z.string().nullable().optional(),
});

export const KeyDatePatchSchema = KeyDateCreateSchema.partial();

export const NoteCreateSchema = z.object({ body: z.string().min(1) });
export const NoteEditSchema = z.object({ body: z.string().min(1) });
export const SetTeamsSchema = z.object({ team: z.array(TeamSchema) });

// --- Create case ------------------------------------------------------------

const CreateClientSchema = z
  .object({
    fullName: z.string().min(1),
    displayName: z.string().optional(),
    preferredName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    otherContact: z.string().nullable().optional(),
    streetAddress: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    county: z.string().nullable().optional(),
    postcode: z.string().nullable().optional(),
    additionalNeeds: z.string().nullable().optional(),
    consentDataProcessing: z.boolean().optional(),
    consentInformationSharing: z.boolean().optional(),
    consentContact: z.boolean().optional(),
    consentPrivacyNotice: z.boolean().optional(),
    paymentPlanRequired: z.boolean().optional(),
  })
  .strict();

const CreateChildSchema = z
  .object({
    fullName: z.string().min(1),
    preferredName: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    schoolYear: SchoolYearSchema.nullable().optional(),
    currentSchoolName: z.string().nullable().optional(),
    currentSchoolAddress: z.string().nullable().optional(),
    desiredSchool: z.string().nullable().optional(),
    sendNeeds: z.string().nullable().optional(),
  })
  .strict();

export const CreateCaseSchema = z
  .object({
    existingClientId: z.string().uuid().optional(),
    client: CreateClientSchema.optional(),
    existingChildId: z.string().uuid().optional(),
    child: CreateChildSchema.optional(),
    case: z
      .object({
        dateOfEnquiry: z.string().optional(),
        currentWork: WorkTypeSchema,
        originalQuery: QueryTypeSchema.nullable().optional(),
        methodOfEnquiry: EnquiryMethodSchema.nullable().optional(),
        team: z.array(TeamSchema).optional(),
        ownerUserId: z.string().uuid().nullable().optional(),
        ownerQueue: OwnerQueueSchema.nullable().optional(),
        status: StatusSchema.optional(),
        consultStatus: ConsultationStateSchema.optional(),
        supportLevel: z.string().nullable().optional(),
        paymentCode: PaymentCodeSchema.nullable().optional(),
        discountCode: DiscountCodeSchema.nullable().optional(),
        aims: z.string().nullable().optional(),
        finalPlanIssuedDate: z.string().nullable().optional(),
        mediationStatus: z.string().nullable().optional(),
        appealLodged: z.boolean().optional(),
        representationWanted: z.boolean().optional(),
      })
      .strict(),
    firstNote: z.string().optional(),
    keyDates: z
      .array(
        z.object({
          date: z.string(),
          title: z.string(),
          type: KeyDateTypeSchema,
          confidence: z.number().optional(),
        }),
      )
      .optional(),
    intake: z
      .object({
        storageKey: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        byteSize: z.number(),
        sha256: z.string(),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.existingClientId) || Boolean(v.client), {
    message: 'Provide a client or an existing client id.',
  })
  .refine((v) => Boolean(v.existingChildId) || Boolean(v.child), {
    message: 'Provide a child or an existing child id.',
  });

const CaseRefSchema = z.object({
  caseId: z.string(),
  caseReference: z.string(),
});

export const MatchResultSchema = z.object({
  clientMatches: z.array(
    z.object({
      clientId: z.string(),
      displayName: z.string(),
      email: z.string().nullable(),
      cases: z.array(
        CaseRefSchema.pick({ caseReference: true }).extend({
          caseId: z.string(),
        }),
      ),
    }),
  ),
  childMatches: z.array(
    z.object({
      childId: z.string(),
      fullName: z.string(),
      dateOfBirth: z.string().nullable(),
      clientId: z.string().nullable(),
      clientDisplayName: z.string().nullable(),
      cases: z.array(
        z.object({ caseId: z.string(), caseReference: z.string() }),
      ),
    }),
  ),
});
