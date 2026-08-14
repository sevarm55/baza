-- Наряд: машину приняли и отдали мойщику.
--
-- Отдельная таблица, а не статус у записи. Запись в `orders` — факт
-- заработанного: цена, оплата и процент там обязательны, из них считаются
-- выручка и зарплата. У принятой машины ничего этого ещё нет, и статус
-- «назначено» внутри `orders` заставил бы каждую сводку считать деньги,
-- которых не существует.
CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "client_key" text NOT NULL,
  "staff_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "service_id" uuid REFERENCES "services"("id") ON DELETE set null,
  "service_name" text,
  "note" text,
  "status" text DEFAULT 'assigned' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "done_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE set null
);
--> statement-breakpoint

-- Очередь владельца: незакрытые наряды по мойке, в порядке приёма.
CREATE INDEX IF NOT EXISTS "jobs_tenant_status_idx"
ON "jobs" ("tenant_id", "status", "created_at");
--> statement-breakpoint

-- Экран мойщика: только его машины и только незакрытые.
CREATE INDEX IF NOT EXISTS "jobs_staff_idx"
ON "jobs" ("tenant_id", "staff_id", "status");
