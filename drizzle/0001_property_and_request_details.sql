ALTER TABLE "properties" ADD COLUMN "ceiling" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "market" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "repair" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "furniture" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "parking" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bathroom" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "balcony" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "building" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "market" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "repair" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "furniture" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "parking" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "view" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;