-- UUID v7 primary keys. gen_random_uuid() is core since PostgreSQL 13; this
-- overlays the high 48 bits with a millisecond timestamp and sets the version
-- 7 / variant bits, giving time-ordered UUIDs.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
BEGIN
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;
--> statement-breakpoint
-- Keeps updated_at current on every row update.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."case_status" AS ENUM('Active', 'Enquiry', 'Allocation', 'Payment/Billing', 'Dormant', 'Closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."consultation_state" AS ENUM('not_required', 'referred', 'booked', 'held');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."discount_code" AS ENUM('AE20', 'AEPB', 'AENP', 'BF25', 'SIB10', 'RTA25', 'PL22', 'PLF23', 'PLJ23');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."document_category" AS ENUM('EHCP Draft', 'EHCP Amended', 'EHCP Final', 'Evidence', 'Expert Report', 'Correspondence', 'Tribunal Order', 'Working Document', 'School Report', 'Medical Report', 'Financial', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."dspl_area" AS ENUM('DSPL1', 'DSPL2', 'DSPL3', 'DSPL4', 'DSPL5', 'DSPL6', 'DSPL7', 'DSPL8', 'DSPL9');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enquiry_method" AS ENUM('Phone', 'Email - Enquiries', 'Email - Admin', 'Email - Other', 'Website', 'Query Form', 'Facebook', 'Face to Face', 'Referral', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."external_sync_status" AS ENUM('not_synced', 'pending', 'synced', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."key_date_source" AS ENUM('manual', 'directions_order', 'jotform');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."key_date_type" AS ENUM('hearing', 'evidence_deadline', 'annual_review', 'working_document', 'mediation', 'consultation', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."owner_queue" AS ENUM('Enquiries', 'TSA Team');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_code" AS ENUM('PM', 'POC', 'CP1', 'CP2', 'CP3', 'CP4', 'PP', 'REF', 'NA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."query_type" AS ENUM('New Application', 'Draft Review', 'Review Draft Plan', 'Annual Review', 'DLA', 'PIP', 'Appeal - Assess', 'Appeal - Issue', 'Appeal - Section', 'General Query', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."school_year" AS ENUM('Nursery/Pre-school', 'Reception', 'Yr1', 'Yr2', 'Yr3', 'Yr4', 'Yr5', 'Yr6', 'Yr7', 'Yr8', 'Yr9', 'Yr10', 'Yr11', 'Yr12', 'Yr13', 'Yr14', 'Post19');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('admin', 'caseworker', 'finance', 'read_only');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."work_type" AS ENUM('Annual Review', 'Draft Review', 'Section Appeal', 'Section B F & I', 'CAP', 'DLA', 'RTA', 'Personal Budget', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_teams" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_reference" text NOT NULL,
	"appeal_number" text,
	"date_of_enquiry" date NOT NULL,
	"client_id" uuid,
	"child_id" uuid,
	"owner_user_id" uuid,
	"owner_queue" "owner_queue",
	"shadow_user_id" uuid,
	"status" "case_status" DEFAULT 'Enquiry' NOT NULL,
	"original_query" "query_type",
	"current_work" "work_type",
	"method_of_enquiry" "enquiry_method",
	"consult_status" "consultation_state" DEFAULT 'not_required' NOT NULL,
	"support_level" text,
	"mediation_status" text,
	"final_plan_issued_date" date,
	"appeal_lodged" boolean DEFAULT false NOT NULL,
	"representation_wanted" boolean DEFAULT false NOT NULL,
	"aims" text,
	"closed_date" date,
	"payment_code" "payment_code",
	"discount_code" "discount_code",
	"invoice_status_text" text,
	"accounting_notes" text,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cases_case_reference_unique" UNIQUE("case_reference")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "children" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"full_name" text NOT NULL,
	"preferred_name" text,
	"date_of_birth" date,
	"school_year" "school_year",
	"current_school_name" text,
	"current_school_address" text,
	"desired_school" text,
	"send_needs" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_children" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"client_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"relationship" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text NOT NULL,
	"preferred_name" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"other_contact" text,
	"street_address" text,
	"city" text,
	"county" text,
	"postcode" text,
	"dspl_area" "dspl_area",
	"additional_needs" text,
	"consent_data_processing" boolean DEFAULT false NOT NULL,
	"consent_data_processing_at" timestamp with time zone,
	"consent_information_sharing" boolean DEFAULT false NOT NULL,
	"consent_information_sharing_at" timestamp with time zone,
	"consent_contact" boolean DEFAULT false NOT NULL,
	"consent_contact_at" timestamp with time zone,
	"consent_privacy_notice" boolean DEFAULT false NOT NULL,
	"consent_privacy_notice_at" timestamp with time zone,
	"payment_plan_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" "document_category" NOT NULL,
	"case_id" uuid NOT NULL,
	"document_group_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emails" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"internet_message_id" text,
	"graph_message_id" text,
	"subject" text,
	"from_address" text,
	"to_addresses" text[],
	"cc_addresses" text[],
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"body_text" text,
	"body_html" text,
	"direction" "email_direction" NOT NULL,
	"case_id" uuid,
	"raw_document_id" uuid,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "key_dates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" time,
	"title" text NOT NULL,
	"description" text,
	"type" "key_date_type" NOT NULL,
	"source" "key_date_source" DEFAULT 'manual' NOT NULL,
	"confidence" text,
	"source_document_id" uuid,
	"source_reference" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"narrative" text,
	"billable" boolean DEFAULT true NOT NULL,
	"external_sync_status" "external_sync_status" DEFAULT 'not_synced' NOT NULL,
	"external_id" text,
	"rate_snapshot" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"entra_object_id" text,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_object_id_unique" UNIQUE("entra_object_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_teams" ADD CONSTRAINT "case_teams_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_teams" ADD CONSTRAINT "case_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cases" ADD CONSTRAINT "cases_shadow_user_id_users_id_fk" FOREIGN KEY ("shadow_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_children" ADD CONSTRAINT "client_children_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_children" ADD CONSTRAINT "client_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_id_documents_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emails" ADD CONSTRAINT "emails_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emails" ADD CONSTRAINT "emails_raw_document_id_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_dates" ADD CONSTRAINT "key_dates_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_dates" ADD CONSTRAINT "key_dates_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_dates" ADD CONSTRAINT "key_dates_superseded_by_id_key_dates_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."key_dates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_actor_user_id" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_case_id" ON "case_notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_author_user_id" ON "case_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_case_entry_date" ON "case_notes" USING btree ("case_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_reviews_case_id" ON "case_reviews" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_reviews_reviewed_by_user_id" ON "case_reviews" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_case_teams_case_team" ON "case_teams" USING btree ("case_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_teams_case_id" ON "case_teams" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_teams_team_id" ON "case_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_client_id" ON "cases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_child_id" ON "cases" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_owner_user_id" ON "cases" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_shadow_user_id" ON "cases" USING btree ("shadow_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_status" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_children_client_child" ON "client_children" USING btree ("client_id","child_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_children_client_id" ON "client_children" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_children_child_id" ON "client_children" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_dspl_area" ON "clients" USING btree ("dspl_area");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_case_id" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_uploaded_by_user_id" ON "documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_superseded_by_id" ON "documents" USING btree ("superseded_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_document_group_id" ON "documents" USING btree ("document_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_case_id" ON "emails" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_raw_document_id" ON "emails" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_key_dates_case_id" ON "key_dates" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_key_dates_source_document_id" ON "key_dates" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_key_dates_superseded_by_id" ON "key_dates" USING btree ("superseded_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_key_dates_case_next" ON "key_dates" USING btree ("case_id","date") WHERE superseded_at IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_time_entries_case_id" ON "time_entries" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_time_entries_user_id" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
-- A case is owned by exactly one of a named user OR a queue; never both,
-- never neither.
ALTER TABLE "cases" ADD CONSTRAINT "ck_cases_owner_user_xor_queue" CHECK (num_nonnulls("owner_user_id", "owner_queue") = 1);
--> statement-breakpoint
CREATE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_teams_updated_at" BEFORE UPDATE ON "teams" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_case_teams_updated_at" BEFORE UPDATE ON "case_teams" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_clients_updated_at" BEFORE UPDATE ON "clients" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_children_updated_at" BEFORE UPDATE ON "children" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_client_children_updated_at" BEFORE UPDATE ON "client_children" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_cases_updated_at" BEFORE UPDATE ON "cases" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_case_notes_updated_at" BEFORE UPDATE ON "case_notes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_key_dates_updated_at" BEFORE UPDATE ON "key_dates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_case_reviews_updated_at" BEFORE UPDATE ON "case_reviews" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_documents_updated_at" BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_audit_log_updated_at" BEFORE UPDATE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_emails_updated_at" BEFORE UPDATE ON "emails" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "trg_time_entries_updated_at" BEFORE UPDATE ON "time_entries" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- The two standing teams (see @re-send/shared TEAM_VALUES). Membership is
-- many-to-many via case_teams.
INSERT INTO "teams" ("code", "name") VALUES ('TSA', 'TSA'), ('ISA', 'ISA') ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- case_list_view — the case list row shape. "Next key date" is the soonest
-- key date on or after today that is not superseded and not soft-deleted.
CREATE VIEW "case_list_view" AS
  SELECT
    c.id AS case_id,
    cl.display_name AS client_display_name,
    ch.preferred_name AS child_preferred_name,
    c.current_work AS current_work,
    c.original_query AS original_query,
    ou.display_name AS owner_display_name,
    c.owner_queue AS owner_queue,
    c.status AS status,
    nkd.date AS next_key_date,
    nkd.title AS next_key_date_title,
    nkd.type AS next_key_date_type,
    mrn.most_recent_note_date AS most_recent_note_date
  FROM cases c
  LEFT JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
  LEFT JOIN children ch ON ch.id = c.child_id AND ch.deleted_at IS NULL
  LEFT JOIN users ou ON ou.id = c.owner_user_id
  LEFT JOIN LATERAL (
    SELECT kd.date, kd.title, kd.type
    FROM key_dates kd
    WHERE kd.case_id = c.id
      AND kd.deleted_at IS NULL
      AND kd.superseded_at IS NULL
      AND kd.date >= CURRENT_DATE
    ORDER BY kd.date ASC, kd.time ASC NULLS FIRST
    LIMIT 1
  ) nkd ON true
  LEFT JOIN LATERAL (
    SELECT max(cn.entry_date) AS most_recent_note_date
    FROM case_notes cn
    WHERE cn.case_id = c.id AND cn.deleted_at IS NULL
  ) mrn ON true
  WHERE c.deleted_at IS NULL;
