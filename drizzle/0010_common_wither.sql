CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"price" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_tenant_idx" ON "order_items" USING btree ("tenant_id","service_id");--> statement-breakpoint
-- Переносим уже сделанные записи. У каждой ровно одна услуга, и она
-- обязана стать строкой: иначе вся прошлая история окажется «без услуг»,
-- а разрез по услугам будет считаться только с сегодняшнего дня.
--
-- Цена строки — прайсовая: list_price там, где он есть, и price у старых
-- записей, сделанных до появления скидок, где эти цены совпадали.
INSERT INTO "order_items" ("tenant_id", "order_id", "service_id", "service_name", "price", "sort")
SELECT "tenant_id", "id", "service_id", "service_name", coalesce("list_price", "price"), 0
FROM "orders";
