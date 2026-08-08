-- Личность отъезжает из users в accounts.
--
-- Первая миграция в проекте, где рядом с DDL стоят рукописные запросы:
-- drizzle-kit переносить данные не умеет, а без переноса каждая строка
-- users осталась бы без человека.
--
-- Миграция ПОЛНОСТЬЮ аддитивна: ни одна колонка не удаляется, ни один
-- индекс не снимается, account_id пока допускает NULL. Старый код после
-- неё работает без единой правки, поэтому откат делается откатом кода и
-- отката базы не требует. Это условие, а не удача: снятие users_phone_uniq
-- и перевод push_tokens поедут вместе с кодом, который их переживёт.
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"pin_hash" text NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"trial_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Индекс до переноса, а не после: если в users каким-то образом лежат два
-- одинаковых телефона, миграция обязана упасть здесь и целиком, а не
-- оставить половину людей без аккаунта.
CREATE UNIQUE INDEX "accounts_phone_uniq" ON "accounts" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
-- Один человек на строку: users_phone_uniq ещё жив, значит телефоны в
-- users уникальны и соответствие получается ровно один к одному.
INSERT INTO "accounts" ("phone", "pin_hash", "token_version", "created_at")
SELECT "phone", "pin_hash", "token_version", "created_at" FROM "users";--> statement-breakpoint
UPDATE "users" u SET "account_id" = a."id"
FROM "accounts" a WHERE a."phone" = u."phone";--> statement-breakpoint
-- Пробный срок считается израсходованным тем, у кого уже есть свой
-- бизнес: он его и получил. Сотрудники не тратили — их наняли, а не
-- завели. Датой берётся создание первого бизнеса человека.
UPDATE "accounts" a SET "trial_used_at" = s."first_at"
FROM (
	SELECT u."account_id" AS aid, min(t."created_at") AS first_at
	FROM "users" u JOIN "tenants" t ON t."id" = u."tenant_id"
	WHERE u."role" = 'owner' AND u."account_id" IS NOT NULL
	GROUP BY u."account_id"
) s
WHERE a."id" = s."aid";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Дважды в одном бизнесе человека быть не может. NULL Postgres считает
-- различными, поэтому строки, которые заведёт старый код до следующего
-- выката, индексу не помешают.
CREATE UNIQUE INDEX "users_tenant_account_uniq" ON "users" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");
