ALTER TABLE "children" ADD COLUMN "la" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "la_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;