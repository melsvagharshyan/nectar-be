ALTER TYPE "public"."request_stage" ADD VALUE 'pending_review' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."request_stage" ADD VALUE 'rejected' BEFORE 'in_progress';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;