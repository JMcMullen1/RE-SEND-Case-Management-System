DROP INDEX IF EXISTS "idx_clients_dspl_area";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN IF EXISTS "dspl_area";--> statement-breakpoint
DROP TYPE IF EXISTS "dspl_area";