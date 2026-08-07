ALTER TABLE "orders" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tier_prices" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "tier_label" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "tiers" jsonb;