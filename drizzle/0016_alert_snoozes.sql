-- Отложенные поводы колокольчика.
--
-- Только новая таблица: ничего не переписывается и не удаляется, старый
-- код о ней не знает и продолжает работать как раньше.
CREATE TABLE IF NOT EXISTS "alert_snoozes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "until" timestamp with time zone NOT NULL
);--> statement-breakpoint

-- Один повод — одна строка на человека: отложить дважды нельзя, второй
-- раз просто продлевает срок.
CREATE UNIQUE INDEX IF NOT EXISTS "alert_snoozes_user_key_uniq"
  ON "alert_snoozes" ("user_id", "key");
