ALTER TABLE "orders" ADD COLUMN "client_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_client_ref_uniq" ON "orders" USING btree ("tenant_id","client_ref");