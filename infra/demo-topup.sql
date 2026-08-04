-- Демо-бизнес не должен пустеть.
--
-- Сутки в продукте считаются по времени бизнеса и в полночь начинаются
-- заново. Демо, наполненное один раз, назавтра показывает ревьюеру ноль
-- машин, «данных пока нет» и убыток размером с дневную долю аренды —
-- ровно тот пустой экран, из-за которого отклоняют по Guideline 2.1.
--
-- Заезды расставлены по всем суткам, а не по рабочему дню с девяти до
-- семи. Причина не в правдоподобии, а в географии: ревьюер сидит в
-- Купертино, и его рабочий день — это ночь и раннее утро в Ереване.
-- Первая версия наполняла демо с 9:30, и всё время, пока в Калифорнии
-- работают, приложение показывало нули. Круглосуточная мойка вопросов не
-- вызывает, пустой экран — вызывает.
--
-- Записи добавляются только в уже прошедшие часы: запись из будущего не
-- рисуется на графике и выглядит поломкой продукта.
--
-- Идемпотентен: сколько раз ни запусти, лишнего не добавит.

\set ON_ERROR_STOP on

with demo as (
  select id from tenants where name = 'Tetrin Դեմո'
),
day_start as (
  select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at
),
-- Восемь заездов на сутки, первый через шесть минут после полуночи.
--
-- Шесть, а не двадцать: задача ходит в :17 каждого часа, и заезд,
-- назначенный на 00:20, к запуску в 00:17 ещё не наступит — демо
-- простояло бы пустым до 01:17. Теперь пустое окно только до первого
-- запуска задачи.
slots as (
  select * from (values (0.1), (2.5), (5.0), (8.0), (11.0), (14.0), (17.0), (20.5)) as t(hour)
),
passed as (
  select row_number() over (order by hour) as rn, hour
  from slots
  where hour * 60 <= extract(epoch from (now() - (select at from day_start))) / 60
),
have as (
  select count(*)::int as n
  from orders o, demo d, day_start s
  where o.tenant_id = d.id and o.created_at >= s.at
),
pick as (
  select p.hour from passed p, have h where p.rn > h.n
)
insert into orders (
  tenant_id, client_id, staff_id, service_id,
  service_name, price, list_price, staff_percent, payment, created_at
)
select
  d.id, c.id, u.id, sv.id, sv.name, sv.price, sv.price, u.percent,
  (array['cash', 'cash', 'card', 'transfer'])[1 + (p.hour * 3)::int % 4],
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
--
-- Открываем в 00:10, а не в девять утра: в девять утра смена, открытая
-- «в будущем», показывала бы время, которое ещё не наступило.
insert into shifts (tenant_id, user_id, opened_at)
select d.id, u.id, s.at + interval '10 minutes'
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
