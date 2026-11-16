-- Consultation is one simple field: Incomplete (the default), Completed or
-- N/A. Held becomes Completed; everything else (Referred, Booked, and the
-- old default Not required) becomes Incomplete.
ALTER TABLE "cases" ALTER COLUMN "consult_status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "consultation_state" RENAME TO "consultation_state_old";--> statement-breakpoint
CREATE TYPE "consultation_state" AS ENUM ('incomplete', 'completed', 'not_applicable');--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "consult_status" TYPE "consultation_state"
  USING (CASE "consult_status"::text WHEN 'held' THEN 'completed' ELSE 'incomplete' END)::"consultation_state";--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "consult_status" SET DEFAULT 'incomplete';--> statement-breakpoint
DROP TYPE "consultation_state_old";--> statement-breakpoint
-- Saved views filtering on the old values now filter on the new ones.
UPDATE "saved_views"
   SET "state" = jsonb_set("state", '{filters,consultationState}',
     (SELECT coalesce(jsonb_agg(DISTINCT CASE v WHEN 'held' THEN 'completed' ELSE 'incomplete' END), '[]'::jsonb)
        FROM jsonb_array_elements_text("state"->'filters'->'consultationState') AS v))
 WHERE jsonb_typeof("state"->'filters'->'consultationState') = 'array';
