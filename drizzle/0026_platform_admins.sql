-- Админка платформы: свой вход, свои сессии, свой журнал.
--
-- До сих пор в админку пускала обычная cookie владельца плюс список
-- телефонов в переменной окружения. То есть у админки не было ни своей
-- сессии (выход из кабинета закрывал и админку, а кабинет мойки открывал
-- её), ни следа действий над ЛЮДЬМИ: журнал `audit` привязан к бизнесу
-- и не умеет записать «заблокирован аккаунт».
--
-- Вход теперь один и принадлежит владельцу платформы лично: логин и
-- пароль в переменных окружения (ADMIN_LOGIN, ADMIN_PASSWORD или
-- ADMIN_PASSWORD_HASH). В базе учётных данных НЕТ: чтобы попасть в
-- админку, мало добраться до базы. Поэтому таблицы админов нет тоже:
-- сессия несёт логин снимком, журнал подписан им же.
CREATE TABLE "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "login" text NOT NULL,
  "ip" text,
  "agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "admin_sessions_login_idx" ON "admin_sessions" ("login", "revoked_at");
--> statement-breakpoint
CREATE TABLE "admin_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
