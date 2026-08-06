import { z } from 'zod';
import {
  ConsultationStateSchema,
  DiscountCodeSchema,
  DocumentCategorySchema,
  DsplAreaSchema,
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
  dsplArea: z.array(DsplAreaSchema).optional(),
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
  dsplArea: z.string().nullable(),
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
  dsplArea: z.string().nullable(),
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
    dsplArea: DsplAreaSchema.nullable().optional(),
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
