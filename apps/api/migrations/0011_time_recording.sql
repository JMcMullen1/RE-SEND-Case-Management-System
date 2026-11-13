DO $$ BEGIN
 CREATE TYPE "public"."rate_kind" AS ENUM('pay', 'work');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "rate_kind" NOT NULL,
	"rate_pence" integer NOT NULL,
	"effective_from" date NOT NULL,
	"set_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "note_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_rates" ADD CONSTRAINT "user_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_rates" ADD CONSTRAINT "user_rates_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_rates_user_kind_from" ON "user_rates" USING btree ("user_id","kind","effective_from");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_note_id_case_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."case_notes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_time_entries_note_id" ON "time_entries" USING btree ("note_id") WHERE "time_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_time_entries_user_date" ON "time_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "ck_time_entries_minutes_positive" CHECK ("minutes" > 0);
--> statement-breakpoint
ALTER TABLE "user_rates" ADD CONSTRAINT "ck_user_rates_rate_non_negative" CHECK ("rate_pence" >= 0);
--> statement-breakpoint
-- Live updates: recorded time refreshes its case and everyone's time pages.
CREATE TRIGGER trg_time_entries_notify AFTER INSERT OR UPDATE OR DELETE ON time_entries FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
