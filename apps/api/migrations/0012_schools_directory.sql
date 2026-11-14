DO $$ BEGIN
 CREATE TYPE "public"."case_school_role" AS ENUM('current', 'proposed', 'named_in_plan', 'previous');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."school_funding" AS ENUM('maintained', 'academy', 'free_school', 'independent', 'non_maintained_special');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."school_provision" AS ENUM('mainstream', 'mainstream_resource_base', 'specialist', 'alternative_provision');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_schools" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"case_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"role" "case_school_role" NOT NULL,
	"contact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schools" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"urn" text,
	"address" text,
	"postcode" text,
	"local_authority" text,
	"phone" text,
	"email" text,
	"website" text,
	"funding" "school_funding",
	"provision" "school_provision",
	"section_41" boolean DEFAULT false NOT NULL,
	"age_from" integer,
	"age_to" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_schools" ADD CONSTRAINT "case_schools_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_schools" ADD CONSTRAINT "case_schools_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_contacts" ADD CONSTRAINT "school_contacts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_schools_case_id" ON "case_schools" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_schools_school_id" ON "case_schools" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_case_schools_case_school_role" ON "case_schools" USING btree ("case_id","school_id","role") WHERE "case_schools"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_school_contacts_school_id" ON "school_contacts" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_schools_urn" ON "schools" USING btree ("urn") WHERE "schools"."urn" IS NOT NULL AND "schools"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_schools_name_key" ON "schools" USING btree ("name_key");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "ck_schools_age_range" CHECK ("age_from" IS NULL OR "age_to" IS NULL OR "age_from" <= "age_to");
--> statement-breakpoint
-- Live updates: the directory, its contacts, and the schools linked to each case.
CREATE TRIGGER trg_schools_notify AFTER INSERT OR UPDATE OR DELETE ON schools FOR EACH ROW EXECUTE FUNCTION notify_entity_change();
--> statement-breakpoint
CREATE TRIGGER trg_school_contacts_notify AFTER INSERT OR UPDATE OR DELETE ON school_contacts FOR EACH ROW EXECUTE FUNCTION notify_entity_change('school_id');
--> statement-breakpoint
CREATE TRIGGER trg_case_schools_notify AFTER INSERT OR UPDATE OR DELETE ON case_schools FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
