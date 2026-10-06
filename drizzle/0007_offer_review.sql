CREATE TYPE "public"."offer_review" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "review" "offer_review" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_review_idx" ON "offers" USING btree ("review","created_at");--> statement-breakpoint
-- Offers sent before admin review existed were already visible to brokers.
UPDATE "offers" SET "review" = 'approved';
