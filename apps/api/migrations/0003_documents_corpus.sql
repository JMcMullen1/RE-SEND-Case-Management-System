ALTER TABLE "documents" ADD COLUMN "extracted_text" text;
--> statement-breakpoint
-- Full-text search over extracted document text. The expression index feeds
-- websearch_to_tsquery lookups; it is created in raw SQL because the tsvector
-- expression is not expressible in the Drizzle schema (and so is not tracked in
-- the snapshot — Drizzle will neither recreate nor drop it).
CREATE INDEX "idx_documents_extracted_text_fts" ON "documents" USING gin (to_tsvector('english', coalesce("extracted_text", '')));
--> statement-breakpoint
-- Documents join live updates: the same generic trigger, scoped to the owning
-- case. This flips the previously-inert `documents` realtime registry entry on.
CREATE TRIGGER trg_documents_notify AFTER INSERT OR UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
