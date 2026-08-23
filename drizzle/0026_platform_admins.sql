-- Админка платформы: свой вход, свои сессии, свой журнал.
--
-- До сих пор в админку пускала обычная cookie владельца плюс список
-- телефонов в переменной окружения. То есть у админки не было ни своей
-- сессии (выход из кабинета закрывал и админку, а кабинет мойки открывал
-- её), ни ролей, ни следа действий над ЛЮДЬМИ: журнал `audit` привязан к
-- бизнесу и не умеет записать «заблокирован аккаунт».
--
-- Теперь админ это отдельная сущность поверх человека (`accounts`):
-- роль, активность, последний вход. Сессия админки короткая и своя
-- (`admin_sessions`), cookie отдельная. Журнал админа (`admin_audit`)
-- хранит действие, цель, причину и снимок имени: админа могут удалить,
-- а ответ на «кто отключил клиента в июле» обязан остаться.
--
-- Список телефонов в окружении остаётся: он заводит первого админа
-- владельцем платформы при первом входе. Дальше админов заводят из
-- самой админки.
CREATE TABLE "platform_admins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "role" text DEFAULT 'support' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "platform_admins"("id") ON DELETE set null,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_account_uniq" ON "platform_admins" ("account_id");
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid NOT NULL REFERENCES "platform_admins"("id") ON DELETE cascade,
  "ip" text,
  "agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" ("admin_id", "revoked_at");
--> statement-breakpoint
CREATE TABLE "admin_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid REFERENCES "platform_admins"("id") ON DELETE set null,
  "admin_name" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "target_label" text,
  "reason" text,
  "data" jsonb,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_at_idx" ON "admin_audit" ("created_at");
--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit" ("target_type", "target_id");
--> statement-breakpoint
-- Блокировка человека целиком, а не одного участия. Уволить на одной
-- точке умел владелец; закрыть вход совсем (мошенничество, просьба
-- самого человека) не умел никто. Дата, а не флаг: отвечает и «когда».
ALTER TABLE "accounts" ADD COLUMN "blocked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "blocked_reason" text;
