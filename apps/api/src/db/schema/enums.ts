import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AI_JOB_OUTCOME_VALUES,
  CONSULTATION_STATE_VALUES,
  DISCOUNT_CODE_VALUES,
  DOCUMENT_CATEGORY_VALUES,
  EMAIL_DIRECTION_VALUES,
  ENQUIRY_METHOD_VALUES,
  EXTERNAL_SYNC_STATUS_VALUES,
  KEY_DATE_SOURCE_VALUES,
  KEY_DATE_TYPE_VALUES,
  OWNER_QUEUE_VALUES,
  PAYMENT_CODE_VALUES,
  QUERY_TYPE_VALUES,
  SCHOOL_YEAR_VALUES,
  STATUS_VALUES,
  USER_ROLE_VALUES,
  WORK_TYPE_VALUES,
} from '@re-send/shared';

/**
 * PostgreSQL enum types. Every set of allowed values is imported from
 * `@re-send/shared` config — this file names the database types, it does not
 * redeclare the vocabularies.
 */
export const userRoleEnum = pgEnum('user_role', USER_ROLE_VALUES);
export const ownerQueueEnum = pgEnum('owner_queue', OWNER_QUEUE_VALUES);
export const caseStatusEnum = pgEnum('case_status', STATUS_VALUES);
export const queryTypeEnum = pgEnum('query_type', QUERY_TYPE_VALUES);
export const workTypeEnum = pgEnum('work_type', WORK_TYPE_VALUES);
export const enquiryMethodEnum = pgEnum(
  'enquiry_method',
  ENQUIRY_METHOD_VALUES,
);
export const paymentCodeEnum = pgEnum('payment_code', PAYMENT_CODE_VALUES);
export const discountCodeEnum = pgEnum('discount_code', DISCOUNT_CODE_VALUES);
export const schoolYearEnum = pgEnum('school_year', SCHOOL_YEAR_VALUES);
export const keyDateTypeEnum = pgEnum('key_date_type', KEY_DATE_TYPE_VALUES);
export const keyDateSourceEnum = pgEnum(
  'key_date_source',
  KEY_DATE_SOURCE_VALUES,
);
export const documentCategoryEnum = pgEnum(
  'document_category',
  DOCUMENT_CATEGORY_VALUES,
);
export const consultationStateEnum = pgEnum(
  'consultation_state',
  CONSULTATION_STATE_VALUES,
);
export const emailDirectionEnum = pgEnum(
  'email_direction',
  EMAIL_DIRECTION_VALUES,
);
export const externalSyncStatusEnum = pgEnum(
  'external_sync_status',
  EXTERNAL_SYNC_STATUS_VALUES,
);
export const aiJobOutcomeEnum = pgEnum('ai_job_outcome', AI_JOB_OUTCOME_VALUES);
