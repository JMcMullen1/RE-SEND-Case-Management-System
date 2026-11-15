-- Search vectors stored on each row (replacing 0017's expression indexes), so
-- ranking reads the stored vector instead of re-parsing every matching text.
--
-- Postgres refuses a search vector over 1 MB. `resend_search_text` keeps the
-- first 300,000 characters (SEARCH_INDEXED_CHARS), or 150,000 if those take
-- more than 600,000 bytes (text in 4-byte scripts), so no text can pass it.
--
-- Adding a stored generated column rewrites the table under an exclusive
-- lock. It runs here, before go-live, while the tables hold little; on a large
-- live table this kind of change belongs out of hours.
CREATE OR REPLACE FUNCTION resend_search_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN octet_length(left(coalesce(t, ''), 300000)) <= 600000
      THEN left(coalesce(t, ''), 300000)
    ELSE left(coalesce(t, ''), 150000)
  END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_documents_search";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_emails_search";
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("original_filename", '')), 'A') ||
    setweight(to_tsvector('english', resend_search_text("extracted_text")), 'B')
  ) STORED;
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("from_name", '') || ' ' || coalesce("from_address", '')), 'B') ||
    setweight(to_tsvector('english', resend_search_text("body_text")), 'C')
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_search_vector" ON "documents" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_search_vector" ON "emails" USING gin ("search_vector");
