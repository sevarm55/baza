CREATE TABLE "passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"total_uses" integer NOT NULL,
	"used_uses" integer DEFAULT 0 NOT NULL,
	"price" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"sold_by" uuid,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pass_id" uuid;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passes_tenant_idx" ON "passes" USING btree ("tenant_id","sold_at");--> statement-breakpoint
CREATE INDEX "passes_client_idx" ON "passes" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE set null ON UPDATE no action;