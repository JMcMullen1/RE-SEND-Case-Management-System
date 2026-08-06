DO $$ BEGIN
 CREATE TYPE "public"."ai_job_outcome" AS ENUM('success', 'refusal', 'error', 'disabled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_job_flags" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"job_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_job_flags_job_name_unique" UNIQUE("job_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"job_name" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"outcome" "ai_job_outcome" NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_job_runs_job_name" ON "ai_job_runs" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_job_runs_created_at" ON "ai_job_runs" USING btree ("created_at");--> statement-breakpoint
CREATE VIEW "ai_spend_by_job" AS
SELECT
  job_name,
  model,
  count(*) AS runs,
  count(*) FILTER (WHERE outcome = 'success') AS successes,
  count(*) FILTER (WHERE outcome = 'refusal') AS refusals,
  count(*) FILTER (WHERE outcome = 'error') AS errors,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  sum(cache_read_tokens) AS cache_read_tokens,
  sum(cache_write_tokens) AS cache_write_tokens,
  sum(cost_usd) AS cost_usd,
  max(created_at) AS last_run_at
FROM ai_job_runs
GROUP BY job_name, model;
