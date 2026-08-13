-- Document categories become free-text folders. Postgres cannot implicitly
-- cast the enum to text, so the USING clause is required; the now-unused enum
-- type is then dropped. Existing values are preserved verbatim as folder names.
ALTER TABLE "documents" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
DROP TYPE IF EXISTS "document_category";
