import { caseReviews } from '../db/schema';
import { getDb } from '../db/client';
import { recordAudit } from './audit';

/**
 * Record that a case was walked through in the weekly review. Writes a
 * case_reviews row with the reviewer and timestamp; the case_reviews trigger
 * fans the change out live and updates "last reviewed".
 */
export async function recordReview(
  caseId: string,
  reviewerId: string,
  note: string | null,
): Promise<{ reviewedAt: string }> {
  const db = getDb();
  const [row] = await db
    .insert(caseReviews)
    .values({ caseId, reviewedByUserId: reviewerId, note })
    .returning({ reviewedAt: caseReviews.reviewedAt });
  await recordAudit(db, {
    actorUserId: reviewerId,
    action: 'case.review',
    entityType: 'case',
    entityId: caseId,
    after: { reviewedAt: row!.reviewedAt.toISOString() },
  });
  return { reviewedAt: row!.reviewedAt.toISOString() };
}
