ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "encryption_key_id" text;--> statement-breakpoint
-- A change that only re-stores a value in another form (the encryption pass
-- encrypting or re-encrypting it) is not an edit: when the transaction sets
-- resend.keep_updated_at, a row's updated_at is left as it was, so records do
-- not all look "updated today" after the pass.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  IF current_setting('resend.keep_updated_at', true) = 'on' THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
