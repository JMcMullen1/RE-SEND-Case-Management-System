-- Live updates: one generic trigger function, applied per table.
--
-- The function emits a NOTIFY on the 'entity_change' channel carrying the
-- table name (entity type), the row id, and — for rows that belong to a case —
-- the owning case id read from an optional scope column named in TG_ARGV[0].
-- Adding a table to live updates is a single CREATE TRIGGER line below; the
-- function is never duplicated.
CREATE OR REPLACE FUNCTION notify_entity_change() RETURNS trigger AS $$
DECLARE
  rec jsonb := to_jsonb(coalesce(NEW, OLD));
  scope_col text := TG_ARGV[0];
BEGIN
  PERFORM pg_notify(
    'entity_change',
    json_build_object(
      'entity', TG_TABLE_NAME,
      'id', rec ->> 'id',
      'scopeId', CASE WHEN scope_col IS NOT NULL THEN rec ->> scope_col ELSE NULL END,
      'op', TG_OP
    )::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_cases_notify AFTER INSERT OR UPDATE OR DELETE ON cases FOR EACH ROW EXECUTE FUNCTION notify_entity_change();
--> statement-breakpoint
CREATE TRIGGER trg_case_notes_notify AFTER INSERT OR UPDATE OR DELETE ON case_notes FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
--> statement-breakpoint
CREATE TRIGGER trg_key_dates_notify AFTER INSERT OR UPDATE OR DELETE ON key_dates FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
--> statement-breakpoint
CREATE TRIGGER trg_case_reviews_notify AFTER INSERT OR UPDATE OR DELETE ON case_reviews FOR EACH ROW EXECUTE FUNCTION notify_entity_change('case_id');
