-- Search inside documents and emails.
--
-- The old index covered the whole extracted text. Postgres refuses a search
-- vector over 1 MB, so a long document with many distinct words (schedules,
-- tables of codes) could not be saved at all. Both indexes below cover the
-- first 300,000 characters (SEARCH_INDEXED_CHARS), tested to stay well under
-- the limit for any text. The expressions must match those in
-- apps/api/src/repositories/search.ts exactly, or the indexes are not used.
-- Created in raw SQL: Drizzle cannot express them (so they are not in the
-- snapshot, and Drizzle will neither recreate nor drop them).
DROP INDEX IF EXISTS "idx_documents_extracted_text_fts";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_search" ON "documents" USING gin ((
  setweight(to_tsvector('english', coalesce("original_filename", '')), 'A') ||
  setweight(to_tsvector('english', left(coalesce("extracted_text", ''), 300000)), 'B')
));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emails_search" ON "emails" USING gin ((
  setweight(to_tsvector('english', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("from_name", '') || ' ' || coalesce("from_address", '')), 'B') ||
  setweight(to_tsvector('english', left(coalesce("body_text", ''), 300000)), 'C')
));
