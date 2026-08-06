import { z } from 'zod';
import {
  ConsultationStateSchema,
  DiscountCodeSchema,
  DsplAreaSchema,
  EnquiryMethodSchema,
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
