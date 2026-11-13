ALTER TABLE "emails" ADD COLUMN "dedup_key" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "from_name" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "attachment_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "filed_by_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emails" ADD CONSTRAINT "emails_filed_by_user_id_users_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_emails_case_dedup_key" ON "emails" USING btree ("case_id","dedup_key") WHERE "emails"."deleted_at" IS NULL;--> statement-breakpoint
-- Live updates: filed emails notify their case like every other case-owned row.
CREATE TRIGGER trg_emails_notify AFTER INSERT OR UPDATE OR DELETE ON emails FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
