-- Один автомобиль не должен становиться двумя клиентами из-за пробелов:
-- `77GG477`, `77 GG 477` и `77-GG-477` приводятся к `77 GG 477`.
--
-- Сначала запоминаем группы и итоговые счётчики, затем переносим ссылки
-- заказов и абонементов на одну строку. Только после этого удаляем дубль:
-- история, контакты и действующие абонементы не теряются.
CREATE TEMP TABLE "_plate_client_merge" ON COMMIT DROP AS
WITH "normalized" AS (
  SELECT
    "id",
    "tenant_id",
    substring("compact", 1, 2) || ' ' ||
      substring("compact", 3, 2) || ' ' ||
      substring("compact", 5, 3) AS "canonical",
    "name",
    "phone",
    "note",
    "visits",
    "total",
    "first_seen_at",
    "last_seen_at"
  FROM (
    SELECT *, regexp_replace(upper("key"), '[[:space:]-]+', '', 'g') AS "compact"
    FROM "clients"
  ) "raw"
  WHERE "compact" ~ '^[0-9]{2}[A-Z]{2}[0-9]{3}$'
),
"grouped" AS (
  SELECT
    *,
    first_value("id") OVER (
      PARTITION BY "tenant_id", "canonical"
      ORDER BY "first_seen_at", "id"::text
    ) AS "keeper_id",
    sum("visits") OVER (PARTITION BY "tenant_id", "canonical")::int AS "merged_visits",
    sum("total") OVER (PARTITION BY "tenant_id", "canonical")::int AS "merged_total",
    min("first_seen_at") OVER (PARTITION BY "tenant_id", "canonical") AS "merged_first_seen_at",
    max("last_seen_at") OVER (PARTITION BY "tenant_id", "canonical") AS "merged_last_seen_at",
    max("name") OVER (PARTITION BY "tenant_id", "canonical") AS "merged_name",
    max("phone") OVER (PARTITION BY "tenant_id", "canonical") AS "merged_phone",
    max("note") OVER (PARTITION BY "tenant_id", "canonical") AS "merged_note"
  FROM "normalized"
)
SELECT * FROM "grouped";
--> statement-breakpoint

UPDATE "orders" AS "o"
SET "client_id" = "m"."keeper_id"
FROM "_plate_client_merge" AS "m"
WHERE "o"."client_id" = "m"."id" AND "m"."id" <> "m"."keeper_id";
--> statement-breakpoint

UPDATE "passes" AS "p"
SET "client_id" = "m"."keeper_id"
FROM "_plate_client_merge" AS "m"
WHERE "p"."client_id" = "m"."id" AND "m"."id" <> "m"."keeper_id";
--> statement-breakpoint

DELETE FROM "clients" AS "c"
USING "_plate_client_merge" AS "m"
WHERE "c"."id" = "m"."id" AND "m"."id" <> "m"."keeper_id";
--> statement-breakpoint

UPDATE "clients" AS "c"
SET
  "key" = "m"."canonical",
  "visits" = "m"."merged_visits",
  "total" = "m"."merged_total",
  "first_seen_at" = "m"."merged_first_seen_at",
  "last_seen_at" = "m"."merged_last_seen_at",
  "name" = coalesce("m"."merged_name", "c"."name"),
  "phone" = coalesce("m"."merged_phone", "c"."phone"),
  "note" = coalesce("m"."merged_note", "c"."note")
FROM (
  SELECT DISTINCT ON ("keeper_id") *
  FROM "_plate_client_merge"
  ORDER BY "keeper_id"
) AS "m"
WHERE "c"."id" = "m"."keeper_id";
--> statement-breakpoint

-- Страховка на уровне базы: даже старая версия приложения больше не
-- сможет снова создать такой дубль.
CREATE UNIQUE INDEX IF NOT EXISTS "clients_tenant_plate_canonical_uniq"
ON "clients" (
  "tenant_id",
  regexp_replace(upper("key"), '[[:space:]-]+', '', 'g')
)
WHERE regexp_replace(upper("key"), '[[:space:]-]+', '', 'g')
  ~ '^[0-9]{2}[A-Z]{2}[0-9]{3}$';
