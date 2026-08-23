-- Живая лента бизнеса.
--
-- До неё продукт знал, ЧТО у мойки есть (машины, смены, расходы), но не
-- знал, что в ней ПРОИСХОДИТ: журнал `audit` писал только записи машин и
-- выплаты, вперемешку с действиями админки, и читала его одна админка.
-- Владелец, который хочет понять «что сейчас на мойке» без звонка,
-- ответа не получал.
--
-- Здесь лежат события с бизнес-смыслом: вышел на смену, записал машину,
-- вписал расход, поменял процент, продал абонемент. Щелчков по кнопкам
-- здесь нет и не будет: строка должна читаться как фраза, а не как лог.
--
-- Имя и роль действующего лица пишутся снимком. Человека могут
-- переименовать, уволить или снести вместе с участием, а лента за
-- прошлую неделю обязана читаться так же, как читалась тогда.
--
-- `data` хранит только то, что нужно для фразы: номер машины, услугу,
-- сумму, категорию. Секретов сюда не класть (см. lib/activity.ts).
CREATE TABLE "activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_name" text,
  "actor_role" text DEFAULT 'staff' NOT NULL,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_events_tenant_at_idx" ON "activity_events" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX "activity_events_tenant_type_idx" ON "activity_events" ("tenant_id", "event_type", "created_at");
