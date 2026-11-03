ALTER TABLE "email_consent" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
-- Rows from before double opt-in were accepted single opt-ins; keep them subscribed (#360).
UPDATE "email_consent" SET "confirmed_at" = "consented_at" WHERE "confirmed_at" IS NULL;
