ALTER TABLE "email_inbox" ADD COLUMN "filing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_inbox" ADD COLUMN "encryption_key_id" text;