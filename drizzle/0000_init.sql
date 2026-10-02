CREATE TYPE "public"."company_kind" AS ENUM('rf', 'am');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('offers_sent', 'interest', 'transferred', 'returned', 'sold', 'started');--> statement-breakpoint
CREATE TYPE "public"."offer_close_reason" AS ENUM('sold', 'not_selected');--> statement-breakpoint
CREATE TYPE "public"."offer_disposition" AS ENUM('neutral', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offer_state" AS ENUM('sent', 'interested', 'transferred', 'closed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."property_availability" AS ENUM('active', 'draft', 'sold');--> statement-breakpoint
CREATE TYPE "public"."request_stage" AS ENUM('created', 'in_progress', 'has_offers', 'crm', 'sold');--> statement-breakpoint
CREATE TYPE "public"."transfer_state" AS ENUM('demo_transferred', 'returned', 'sold');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('broker', 'partner', 'admin');--> statement-breakpoint
CREATE SEQUENCE "public"."client_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."company_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."offer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."property_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."transfer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"company_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "company_kind" NOT NULL,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"request_id" text NOT NULL,
	"property_id" text NOT NULL,
	"company_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_request_id_property_id_pk" PRIMARY KEY("request_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reads" (
	"user_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	CONSTRAINT "event_reads_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "event_type" NOT NULL,
	"request_id" text NOT NULL,
	"property_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"property_id" text NOT NULL,
	"company_id" text NOT NULL,
	"state" "offer_state" DEFAULT 'sent' NOT NULL,
	"disposition" "offer_disposition" DEFAULT 'neutral' NOT NULL,
	"close_reason" "offer_close_reason",
	"match_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_request_property_uq" UNIQUE("request_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"availability" "property_availability" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"district" text NOT NULL,
	"price" integer NOT NULL,
	"area" double precision NOT NULL,
	"rooms" integer,
	"floor" integer,
	"floors" integer,
	"description" text DEFAULT '' NOT NULL,
	"private_notes" text DEFAULT '' NOT NULL,
	"internal_address" text DEFAULT '' NOT NULL,
	"media" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"stage" "request_stage" DEFAULT 'created' NOT NULL,
	"districts" text[] DEFAULT '{}' NOT NULL,
	"budget_min" integer DEFAULT 0 NOT NULL,
	"budget_max" integer DEFAULT 0 NOT NULL,
	"area_min" double precision DEFAULT 0 NOT NULL,
	"area_max" double precision DEFAULT 0 NOT NULL,
	"rooms" integer,
	"type" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"term" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"offer_ids" text[] NOT NULL,
	"state" "transfer_state" DEFAULT 'demo_transferred' NOT NULL,
	"sold_property_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company_id" text,
	"employee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reads" ADD CONSTRAINT "event_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reads" ADD CONSTRAINT "event_reads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sold_property_id_properties_id_fk" FOREIGN KEY ("sold_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_property_idx" ON "offers" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "properties_company_idx" ON "properties" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "requests_client_idx" ON "requests" USING btree ("client_id");