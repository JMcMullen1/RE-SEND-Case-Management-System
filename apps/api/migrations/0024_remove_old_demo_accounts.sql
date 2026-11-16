-- The first demonstration accounts (replaced by the real staff names) are
-- removed. Their own settings go with them; the audit trail keeps its entries,
-- with no actor, as they were demonstration accounts, not people. An account
-- that still owns or shadows case records (cases, notes, documents, time) is
-- left in place. Each removal is itself audited.
DO $$
DECLARE
  account record;
BEGIN
  -- Clearing the actor is not an edit of those entries.
  PERFORM set_config('resend.keep_updated_at', 'on', true);
  FOR account IN
    SELECT id, role FROM users
    WHERE email IN ('ada@resend.demo', 'ben@resend.demo', 'dana@resend.demo', 'priya@resend.demo')
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM cases WHERE shadow_user_id = account.id);
    BEGIN
      DELETE FROM saved_views WHERE owner_user_id = account.id;
      DELETE FROM user_rates WHERE user_id = account.id;
      UPDATE user_rates SET set_by_user_id = NULL WHERE set_by_user_id = account.id;
      UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = account.id;
      DELETE FROM users WHERE id = account.id;
      INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, before)
      VALUES (NULL, 'user.remove_demo_account', 'user', account.id,
              jsonb_build_object('role', account.role));
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'Kept a demonstration account that still owns case records.';
    END;
  END LOOP;
END $$;
