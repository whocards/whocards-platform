ALTER TABLE "answer" ADD COLUMN "platform" text;--> statement-breakpoint
CREATE INDEX "answer_platform_idx" ON "answer" USING btree ("platform");