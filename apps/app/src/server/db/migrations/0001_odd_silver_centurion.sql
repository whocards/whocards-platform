CREATE TABLE "deck" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "deck_question" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_slug" text NOT NULL,
	"question_id" text NOT NULL,
	"act_label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deck_question_deck_question_unique" UNIQUE("deck_slug","question_id")
);
--> statement-breakpoint
ALTER TABLE "deck_question" ADD CONSTRAINT "deck_question_deck_slug_deck_slug_fk" FOREIGN KEY ("deck_slug") REFERENCES "public"."deck"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_question" ADD CONSTRAINT "deck_question_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_question_deck_slug_idx" ON "deck_question" USING btree ("deck_slug");