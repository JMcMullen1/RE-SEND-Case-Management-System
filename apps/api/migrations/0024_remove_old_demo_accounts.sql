-- The first demonstration accounts (replaced by the real staff names) are
-- removed. Their own settings go with them; the audit trail keeps its entries,
-- with no actor, as they were demonstration accounts, not people. An account
-- that still owns case records (notes, documents, time) is left in place.
DO $$
DECLARE
  account record;
BEGIN
  FOR account IN
    SELECT id FROM users
    WHERE email IN ('ada@resend.demo', 'ben@resend.demo', 'dana@resend.demo', 'priya@resend.demo')
  LOOP
    BEGIN
      DELETE FROM saved_views WHERE owner_user_id = account.id;
      DELETE FROM user_rates WHERE user_id = account.id;
      UPDATE user_rates SET set_by_user_id = NULL WHERE set_by_user_id = account.id;
      UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = account.id;
      DELETE FROM users WHERE id = account.id;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'Kept a demonstration account that still owns case records.';
    END;
  END LOOP;
END $$;
