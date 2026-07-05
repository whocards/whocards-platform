CREATE TABLE "agent_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_slug" text NOT NULL,
	"question_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "app_organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "app_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_slug" text NOT NULL,
	"question_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_review" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_slug" text NOT NULL,
	"question_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_text" text NOT NULL,
	"proposed_edit" text,
	"decided_by" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_review_deck_question_unique" UNIQUE("deck_slug","question_id")
);
--> statement-breakpoint
CREATE TABLE "question_vote" (
	"id" serial PRIMARY KEY NOT NULL,
	"deck_slug" text NOT NULL,
	"question_id" text NOT NULL,
	"voter_id" text NOT NULL,
	"variant" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_vote_deck_question_voter_unique" UNIQUE("deck_slug","question_id","voter_id")
);
--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_account" ADD CONSTRAINT "app_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_invitation" ADD CONSTRAINT "app_invitation_organization_id_app_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."app_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_invitation" ADD CONSTRAINT "app_invitation_inviter_id_app_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_member" ADD CONSTRAINT "app_member_organization_id_app_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."app_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_member" ADD CONSTRAINT "app_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_comment" ADD CONSTRAINT "question_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review" ADD CONSTRAINT "question_review_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_vote" ADD CONSTRAINT "question_vote_voter_id_app_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_message_deck_question_idx" ON "agent_message" USING btree ("deck_slug","question_id");--> statement-breakpoint
CREATE INDEX "app_account_user_id_idx" ON "app_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_invitation_organization_id_idx" ON "app_invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "app_invitation_email_idx" ON "app_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "app_member_organization_id_idx" ON "app_member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "app_member_user_id_idx" ON "app_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_organization_slug_uidx" ON "app_organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "app_session_user_id_idx" ON "app_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_verification_identifier_idx" ON "app_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "question_comment_deck_question_idx" ON "question_comment" USING btree ("deck_slug","question_id");