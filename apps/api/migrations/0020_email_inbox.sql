DO $$ BEGIN
 CREATE TYPE "public"."email_inbox_status" AS ENUM('waiting', 'filed', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_inbox" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"dedup_key" text NOT NULL,
	"subject" text,
	"from_name" text,
	"from_address" text,
	"sent_at" timestamp with time zone,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "email_inbox_status" DEFAULT 'waiting' NOT NULL,
	"added_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"filed_case_id" uuid,
	"filed_email_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_filed_case_id_cases_id_fk" FOREIGN KEY ("filed_case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_inbox" ADD CONSTRAINT "email_inbox_filed_email_id_emails_id_fk" FOREIGN KEY ("filed_email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_inbox_status" ON "email_inbox" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_inbox_waiting_dedup_key" ON "email_inbox" USING btree ("dedup_key") WHERE "email_inbox"."status" = 'waiting';--> statement-breakpoint
CREATE TRIGGER "trg_email_inbox_updated_at" BEFORE UPDATE ON "email_inbox" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Live updates: the list of emails to file refreshes for everyone.
CREATE TRIGGER "trg_email_inbox_notify" AFTER INSERT OR UPDATE OR DELETE ON "email_inbox" FOR EACH ROW EXECUTE FUNCTION notify_entity_change();
