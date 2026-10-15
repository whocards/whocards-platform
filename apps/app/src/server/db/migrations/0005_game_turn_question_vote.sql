ALTER TABLE "game_turn" ADD COLUMN IF NOT EXISTS "question_vote" smallint;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "game_turn" ADD CONSTRAINT "game_turn_question_vote_check" CHECK ("game_turn"."question_vote" in (-1, 1));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
