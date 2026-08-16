-- Подтверждение номера, одноразовые коды, знакомые устройства и журнал
-- безопасности.
--
-- Ни одна строка здесь ничего не отбирает у живых людей: телефон у всех
-- существующих аккаунтов остаётся НЕподтверждённым (null), и это не
-- мешает им входить. Разница только в том, что восстановление PIN по SMS
-- им недоступно, пока номер не подтверждён — иначе восстановление само
-- стало бы способом угнать непроверенный аккаунт.

ALTER TABLE "accounts" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_hash" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purpose" text NOT NULL,
  "phone" text NOT NULL,
  "code_hash" text NOT NULL,
  "payload" jsonb,
  "attempts" integer DEFAULT 0 NOT NULL,
  "resends" integer DEFAULT 0 NOT NULL,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "next_resend_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_challenges_phone_idx" ON "auth_challenges" ("phone","purpose","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_expires_idx" ON "auth_challenges" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "known_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "fingerprint" text NOT NULL,
  "label" text,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "known_devices_account_fp_uniq" ON "known_devices" ("account_id","fingerprint");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "security_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event" text NOT NULL,
  "level" text DEFAULT 'info' NOT NULL,
  "phone" text,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "ip" text,
  "agent" text,
  "data" jsonb,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "security_events_at_idx" ON "security_events" ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_events_event_idx" ON "security_events" ("event","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_events_phone_idx" ON "security_events" ("phone","at");
