CREATE TABLE "game_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_feedback_player_id_unique" UNIQUE("player_id"),
	CONSTRAINT "game_feedback_rating_check" CHECK ("game_feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "game_pair" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_pair_player" (
	"pair_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_pair_player_pair_id_player_id_pk" PRIMARY KEY("pair_id","player_id"),
	CONSTRAINT "game_pair_player_round_player_unique" UNIQUE("round_id","player_id"),
	CONSTRAINT "game_pair_player_pair_slot_unique" UNIQUE("pair_id","slot"),
	CONSTRAINT "game_pair_player_slot_check" CHECK ("game_pair_player"."slot" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "game_player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"token_hash" text NOT NULL,
	"pair_code" text NOT NULL,
	"email" text,
	"consent_transcript" boolean DEFAULT false NOT NULL,
	"consent_recap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_player_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "game_player_game_pair_code_unique" UNIQUE("game_id","pair_code"),
	CONSTRAINT "game_player_language_check" CHECK ("game_player"."language" in ('en', 'hu'))
);
--> statement-breakpoint
CREATE TABLE "game_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"language" text NOT NULL,
	"transcript" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "game_response_turn_id_unique" UNIQUE("turn_id"),
	CONSTRAINT "game_response_language_check" CHECK ("game_response"."language" in ('en', 'hu'))
);
--> statement-breakpoint
CREATE TABLE "game_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"deck_slug" text NOT NULL,
	"turn_seconds" integer NOT NULL,
	"odd_rule" text DEFAULT 'trio' NOT NULL,
	"overtime" text DEFAULT 'nudge' NOT NULL,
	"overtime_seconds" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_round_game_n_unique" UNIQUE("game_id","n"),
	CONSTRAINT "game_round_status_check" CHECK ("game_round"."status" in ('pending', 'live', 'done')),
	CONSTRAINT "game_round_odd_rule_check" CHECK ("game_round"."odd_rule" in ('trio', 'sitout')),
	CONSTRAINT "game_round_overtime_check" CHECK ("game_round"."overtime" in ('nudge', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "game_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "game_turn_pair_player_unique" UNIQUE("pair_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "hosted_game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"settings" jsonb DEFAULT '{"round":{}}'::jsonb NOT NULL,
	"created_by" text,
	"host_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_game_code_unique" UNIQUE("code"),
	CONSTRAINT "hosted_game_status_check" CHECK ("hosted_game"."status" in ('lobby', 'live', 'ended'))
);
--> statement-breakpoint
ALTER TABLE "game_feedback" ADD CONSTRAINT "game_feedback_game_id_hosted_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."hosted_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_feedback" ADD CONSTRAINT "game_feedback_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pair" ADD CONSTRAINT "game_pair_round_id_game_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."game_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pair_player" ADD CONSTRAINT "game_pair_player_pair_id_game_pair_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."game_pair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pair_player" ADD CONSTRAINT "game_pair_player_round_id_game_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."game_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_pair_player" ADD CONSTRAINT "game_pair_player_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_game_id_hosted_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."hosted_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_response" ADD CONSTRAINT "game_response_turn_id_game_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_response" ADD CONSTRAINT "game_response_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_round" ADD CONSTRAINT "game_round_game_id_hosted_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."hosted_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turn" ADD CONSTRAINT "game_turn_pair_id_game_pair_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."game_pair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turn" ADD CONSTRAINT "game_turn_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_feedback_game_id_idx" ON "game_feedback" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_pair_round_id_idx" ON "game_pair" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "game_pair_player_player_id_idx" ON "game_pair_player" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "game_response_player_id_idx" ON "game_response" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_round_one_live_idx" ON "game_round" USING btree ("game_id") WHERE "game_round"."status" = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX "game_turn_one_open_idx" ON "game_turn" USING btree ("pair_id") WHERE "game_turn"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "game_turn_player_id_idx" ON "game_turn" USING btree ("player_id");