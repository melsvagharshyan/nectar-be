CREATE INDEX "clients_company_created_idx" ON "clients" USING btree ("company_id","created_at","id");--> statement-breakpoint
CREATE INDEX "drafts_company_idx" ON "drafts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "events_request_idx" ON "events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "offers_company_idx" ON "offers" USING btree ("company_id","request_id");--> statement-breakpoint
CREATE INDEX "properties_availability_company_idx" ON "properties" USING btree ("availability","company_id");--> statement-breakpoint
CREATE INDEX "properties_district_idx" ON "properties" USING btree ("district");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "properties" USING btree ("price");--> statement-breakpoint
CREATE INDEX "properties_created_idx" ON "properties" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "requests_stage_idx" ON "requests" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "requests_created_idx" ON "requests" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "requests_districts_gin" ON "requests" USING gin ("districts");--> statement-breakpoint
CREATE INDEX "transfers_request_idx" ON "transfers" USING btree ("request_id");