-- A full import rewrites every row in one transaction. Rather than one live
-- update per row, the restore sets resend.quiet_notify for its transaction and
-- afterwards asks every open screen to refresh once.
CREATE OR REPLACE FUNCTION notify_entity_change() RETURNS trigger AS $$
DECLARE
  rec jsonb;
  scope_col text := TG_ARGV[0];
BEGIN
  IF current_setting('resend.quiet_notify', true) = 'on' THEN
    RETURN NULL;
  END IF;
  rec := to_jsonb(coalesce(NEW, OLD));
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
