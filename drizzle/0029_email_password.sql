-- Вход по почте и паролю вместо телефона и кода из SMS.
--
-- Написана руками, а не сгенерирована: снимок drizzle отстал от базы —
-- часть прежних миграций тоже писали руками, — и `drizzle-kit generate`
-- предложил создать заново девять существующих таблиц. Такая миграция
-- падает на старте контейнера, а падение на старте выглядит как «сайт не
-- ответил». Здесь только настоящая разница, и каждый шаг переносит
-- повторный запуск.

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;--> statement-breakpoint

-- Прежний секрет больше не обязателен: у сотрудника, которому владелец
-- ещё не выдал пароль, нет ни того ни другого.
ALTER TABLE "accounts" ALTER COLUMN "pin_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "pin_hash" DROP NOT NULL;--> statement-breakpoint

-- Заявка на подтверждение теперь адресуется почтой; телефон остаётся
-- обнуляемым, чтобы старые незакрытые заявки дожили свой срок.
ALTER TABLE "auth_challenges" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_uniq"
  ON "accounts" USING btree (lower("email")) WHERE "email" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_email_idx"
  ON "auth_challenges" USING btree ("email","purpose","created_at");
