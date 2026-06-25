CREATE TABLE IF NOT EXISTS "email_consent" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"name" text,
	"consent_type" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_source" text NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"unsubscribe_source" text,
	"fulfilled_at" timestamp with time zone,
	"provider_name" text DEFAULT 'resend' NOT NULL,
	"provider_contact_id" text,
	"provider_segment_id" text,
	"provider_synced_at" timestamp with time zone,
	"provider_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "email_consent_email_consent_type_unique" UNIQUE("email","consent_type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_consent" ADD CONSTRAINT "email_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
