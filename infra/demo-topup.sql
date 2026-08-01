-- Демо-бизнес не должен пустеть.
--
-- Сутки в продукте считаются по времени бизнеса и в полночь начинаются
-- заново. Демо, наполненное один раз, назавтра показывает ревьюеру ноль
-- машин, «данных пока нет» и убыток размером с дневную долю аренды —
-- ровно тот пустой экран, из-за которого отклоняют по Guideline 2.1.
--
-- Скрипт добавляет сегодняшние записи до нужного числа и только в уже
-- прошедшие часы: запись из будущего не нарисуется на графике и будет
-- выглядеть ошибкой продукта.
--
-- Идемпотентен: сколько раз ни запусти за час, лишнего не добавит.

\set ON_ERROR_STOP on

with demo as (
  select id from tenants where name = 'Tetrin Դեմո'
),
day_start as (
  select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at
),
-- Сколько машин должно быть к этому часу: примерно одна за два часа
-- работы, начиная с девяти утра. К вечеру набирается пять.
target as (
  select greatest(0, least(6, floor((extract(hour from now() at time zone 'Asia/Yerevan') - 9) / 2 + 1)::int)) as n
),
have as (
  select count(*)::int as n
  from orders o, demo d, day_start s
  where o.tenant_id = d.id and o.created_at >= s.at
),
-- Часы заездов: те же неровные, что и в основном наборе.
slots as (
  select * from (values (9.5), (11.25), (13.0), (15.5), (17.25), (19.0)) as t(hour)
),
missing as (
  select row_number() over (order by hour) as rn, hour
  from slots
  where hour * 60 <= extract(epoch from (now() - (select at from day_start))) / 60
),
pick as (
  select m.hour
  from missing m, have h, target t
  where m.rn > h.n and m.rn <= t.n
)
insert into orders (
  tenant_id, client_id, staff_id, service_id,
  service_name, price, list_price, staff_percent, payment, created_at
)
select
  d.id,
  c.id,
  u.id,
  sv.id,
  sv.name,
  sv.price,
  sv.price,
  u.percent,
  (array['cash', 'cash', 'card', 'transfer'])[1 + (p.hour * 2)::int % 4],
  s.at + (p.hour * interval '1 hour')
from pick p
cross join demo d
cross join day_start s
-- работник, услуга и клиент выбираются по часу, чтобы день не выглядел
-- копией одной и той же записи
join lateral (
  select id, percent from users
  where tenant_id = d.id and role = 'staff' and active
  order by id limit 1
) u on true
join lateral (
  select id, name, price from services
  where tenant_id = d.id and active
  order by sort offset ((p.hour * 2)::int % 5) limit 1
) sv on true
join lateral (
  select id from clients
  where tenant_id = d.id
  order by id offset ((p.hour * 3)::int % 10) limit 1
) c on true;

-- Смена на сегодня: без неё на «Ամփոփում» нет зелёной точки «на мойке»,
-- а это один из разделов, ради которых продукт и открывают.
insert into shifts (tenant_id, user_id, opened_at)
select d.id, u.id, s.at + interval '9 hours'
from (select id from tenants where name = 'Tetrin Դեմո') d,
     (select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at) s,
     lateral (
       select id from users
       where tenant_id = d.id and role = 'staff' and active
       order by id limit 1
     ) u
where not exists (
  select 1 from shifts x
  where x.tenant_id = d.id and x.user_id = u.id and x.opened_at >= s.at
);
