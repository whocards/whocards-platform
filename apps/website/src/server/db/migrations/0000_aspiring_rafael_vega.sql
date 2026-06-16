CREATE TABLE IF NOT EXISTS "whocards_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"date" timestamp NOT NULL,
	"category" text NOT NULL,
	"netPrice" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whocards_shipping" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"company" text,
	"address" text NOT NULL,
	"address2" text,
	"zip" text NOT NULL,
	"city" text NOT NULL,
	"region" text,
	"quantity" integer NOT NULL,
	"country" text NOT NULL,
	"purchaseId" text NOT NULL,
	CONSTRAINT "whocards_shipping_purchaseId_unique" UNIQUE("purchaseId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whocards_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"oc_slug" text,
	"name" text NOT NULL,
	"newsletter" boolean DEFAULT false NOT NULL,
	CONSTRAINT "whocards_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whocards_purchase" ADD CONSTRAINT "whocards_purchase_user_id_whocards_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."whocards_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whocards_shipping" ADD CONSTRAINT "whocards_shipping_purchaseId_whocards_purchase_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."whocards_purchase"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
