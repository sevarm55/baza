-- Витринная мойка не должна пустеть.
--
-- Ту мойку, что открывают на встрече с хозяином автомойки, показывают в
-- произвольный день и в произвольный час. Наполненная один раз, назавтра
-- она встречает гостя нулём машин на главном экране — и разговор
-- начинается с объяснения, почему в продукте пусто.
--
-- Раз в час: скрипт смотрит, сколько машин полагается к этому часу, и
-- добавляет недостающие. Повторный запуск лишнего не сделает.
--
-- Отличие от `demo-topup.sql`, который держит демо для ревью Apple: там
-- заезды расставлены по всем суткам, потому что ревьюер сидит в Купертино
-- и работает, когда в Ереване ночь. Здесь смотрит местный хозяин мойки, и
-- круглосуточный график вызвал бы у него ровно один вопрос — «а кто у вас
-- в три ночи моет?». Поэтому рабочий день, с половины восьмого.
--
-- Записи добавляются только в уже прошедшие часы: заезд из будущего не
-- рисуется на графике и выглядит поломкой продукта.

\set ON_ERROR_STOP on

with demo as (
  select id, team_percent from tenants where name = 'Ավտոլվացում Արշակունյաց'
),
day_start as (
  select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at
),
-- Девятнадцать заездов на день, с 7:30 до 19:00 — мойка на два поста.
--
-- Первый рано: встреча случается и в восемь утра, а главный экран с
-- одной-единственной машиной продаёт хуже, чем с семью.
--
-- Последний в семь вечера, а не в девять: в 20:00 по времени бизнеса
-- продукт закрывает забытые смены сам, и машина, записанная позже,
-- осталась бы за пределами смены, в которую её мыли.
--
-- Третья колонка — совместная мойка: длинную работу вроде химчистки
-- делают вдвоём, и на сегодняшнем дне это должно быть видно, а не только
-- в истории.
slots as (
  select * from (values
    (7.5, false), (8.2, false), (8.9, true),  (9.5, false), (10.1, false),
    (10.8, false), (11.4, false), (12.0, false), (12.7, false), (13.3, false),
    (14.0, false), (14.6, true), (15.2, false), (15.9, false), (16.5, false),
    (17.1, false), (17.8, true), (18.4, false), (19.0, false)
  ) as t(hour, team)
),
passed as (
  select row_number() over (order by hour) as rn, hour, team
  from slots
  where hour * 60 <= extract(epoch from (now() - (select at from day_start))) / 60
),
have as (
  select count(*)::int as n
  from orders o, demo d, day_start s
  where o.tenant_id = d.id and o.created_at >= s.at
),
pick as (
  select p.rn, p.hour, p.team from passed p, have h where p.rn > h.n
),
-- Класс машины: седанов большинство, микроавтобус — редкость. Индекс
-- отсюда идёт и в название класса, и в цену: они обязаны совпасть, иначе
-- на джипе стояла бы цена седана.
tiered as (
  select p.rn, p.hour, p.team,
         (array[0, 0, 1, 0, 1, 2])[1 + (p.rn * 7)::int % 6] as tier_idx
  from pick p
),
ins as (
  insert into orders (
    tenant_id, client_id, staff_id, service_id,
    service_name, tier, price, list_price, staff_percent, payment, created_at
  )
  select
    d.id, c.id, u.id, sv.id, sv.name,
    (select tiers ->> p.tier_idx from tenants where id = d.id),
    coalesce((sv.tier_prices ->> p.tier_idx)::int, sv.price),
    coalesce((sv.tier_prices ->> p.tier_idx)::int, sv.price),
    case when p.team then d.team_percent else u.percent end,
    (array['cash', 'cash', 'card', 'transfer', 'card'])[1 + (p.rn * 3)::int % 5],
    s.at + (p.hour * interval '1 hour')
  from tiered p
  cross join demo d
  cross join day_start s
  -- исполнитель, услуга и клиент выбираются по номеру заезда, чтобы день
  -- не выглядел копией одной и той же записи
  join lateral (
    select id, percent from users
    where tenant_id = d.id and role = 'staff' and active
    order by id offset (p.rn::int % 2) limit 1
  ) u on true
  join lateral (
    /* Услуга по номеру заезда, но не по остатку от деления: он давал
       ровный цикл, и дорогие позиции прайса выпадали каждое утро в один
       и тот же час — две полировки по двадцать тысяч до полудня. Здесь
       расписан весь день сразу, в тех долях, в каких услуги берут на
       самом деле: комплекс и кузов — основной поток, химчистка и
       полировка — редкость.

       Совместная мойка — всегда химчистка: салон вдвоём чистят, это и
       есть тот случай, ради которого в продукте есть общий процент. */
    select id, name, price, tier_prices from services
    where tenant_id = d.id and active
      and (not p.team or name = 'Քիմմաքրում')
    order by sort
    offset (case when p.team then 0
                 else (array[0,1,0,2,1,0,3,1,2,0,1,0,2,1,0,4,1,2,0])[p.rn::int]
            end)
    limit 1
  ) sv on true
  join lateral (
    /* Сегодня приезжают в основном свои — те, кто ездит чаще всех. База
       мойки на несколько сотен машин, и случайная выборка из неё дала бы
       день из одних незнакомцев: у постоянных счётчик визитов стоял бы
       на месте, хотя именно на них мойка и держится. */
    select id from clients
    where tenant_id = d.id
    order by visits desc, id
    offset ((p.rn * 3)::int % 25) limit 1
  ) c on true
  returning id, tenant_id, client_id, staff_id, service_name, price, staff_percent, payment, created_at
),
-- Кому причитается за машину. Ведомость и экран смены ходят к деньгам
-- через `order_shares`, а не через `orders.staff_id`: без этих строк
-- начисленное не увидит никто.
--
-- Доли пишутся из того же запроса, что и записи (`returning`), а не
-- отдельным проходом «найди сегодняшнее без долей». Отдельный проход
-- пришлось бы учить отличать совместную мойку от одиночной по ставке —
-- а ставку владелец меняет в настройках, и однажды она совпала бы с
-- личной.
shares as (
insert into order_shares (tenant_id, order_id, staff_id, earned, sort)
select i.tenant_id, i.id, sh.staff_id, sh.earned, sh.sort
from ins i
cross join lateral (
  -- одиночная: весь фонд автору записи
  select i.staff_id as staff_id, floor(i.price * i.staff_percent / 100.0)::int as earned, 0 as sort
  where i.staff_percent <> (select team_percent from demo)

  union all

  -- совместная: фонд пополам, остаток от деления — первому. Иначе один
  -- драм пропадал бы, и ведомость не сходилась бы с начисленным.
  select i.staff_id,
         floor(i.price * i.staff_percent / 100.0)::int
           - floor(floor(i.price * i.staff_percent / 100.0)::int / 2), 0
  where i.staff_percent = (select team_percent from demo)

  union all

  select partner.id, floor(floor(i.price * i.staff_percent / 100.0)::int / 2), 1
  from lateral (
    select id from users
    where tenant_id = i.tenant_id and role = 'staff' and active and id <> i.staff_id
    order by id limit 1
  ) partner
  where i.staff_percent = (select team_percent from demo)
) sh
on conflict (order_id, staff_id) do nothing
returning 1
),
-- Счётчики клиента. В продукте их двигает тот же апсерт, что заводит
-- запись; здесь записи вставляются мимо него, и без этого шага у машины,
-- помытой сегодня, в карточке стояло бы «был вчера», а число визитов не
-- сдвинулось бы вовсе.
--
-- Считается по `ins` — по тем строкам, что вставил ЭТОТ запуск. Повторный
-- запуск не вставляет ничего, значит и прибавлять ему нечего: задача
-- ходит раз в час и обязана быть безвредной на второй раз.
bump as (
  update clients c
  set visits = c.visits + x.n,
      total = c.total + x.sum,
      last_seen_at = greatest(c.last_seen_at, x.last)
  from (
    select client_id, count(*)::int as n, sum(price)::int as sum, max(created_at) as last
    from ins group by client_id
  ) x
  where c.id = x.client_id
  returning 1
)
-- Живая лента. Она читает `activity_events`, а не записи: мойка, не
-- попавшая сюда, на главном экране показывает «пока ничего не
-- происходило» при полной кассе. Для встречи это худший из экранов —
-- продукт выглядит выключенным.
insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, data, created_at
)
select
  i.tenant_id, i.staff_id, u.name, 'staff', 'car.created', 'car', i.id,
  jsonb_build_object('key', c.key, 'service', i.service_name, 'amount', i.price, 'payment', i.payment)
    || case
         when i.staff_percent = (select team_percent from demo)
           then jsonb_build_object('crew', jsonb_build_array(u.name, partner.name))
         else '{}'::jsonb
       end,
  i.created_at
from ins i
join users u on u.id = i.staff_id
join clients c on c.id = i.client_id
left join lateral (
  select name from users
  where tenant_id = i.tenant_id and role = 'staff' and active and id <> i.staff_id
  order by id limit 1
) partner on true;

-- Смены на сегодня: без них на «Այսօր» нет зелёной точки «на мойке», а
-- это один из разделов, ради которых продукт и открывают.
--
-- Открываются в 7:20, за десять минут до первого заезда: машина,
-- записанная раньше открытия смены, не попала бы в сдачу наличных при её
-- закрытии. И не раньше «сейчас» — смена с будущим временем показывала бы
-- отрицательную длительность.
with opened as (
  insert into shifts (tenant_id, user_id, opened_at)
  select d.id, u.id, least(s.at + interval '440 minutes', now())
  from (select id from tenants where name = 'Ավտոլվացում Արշակունյաց') d,
       (select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at) s,
       lateral (
         select id from users
         where tenant_id = d.id and role = 'staff' and active
       ) u
  where not exists (
    select 1 from shifts x
    where x.tenant_id = d.id and x.user_id = u.id and x.opened_at >= s.at
  )
  returning id, tenant_id, user_id, opened_at
)
-- Выход на смену — первая строка ленты за день, и по ней же на главном
-- экране зажигается «на мойке».
insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, created_at
)
select o.tenant_id, o.user_id, u.name, 'staff', 'shift.started', 'shift', o.id, o.opened_at
from opened o join users u on u.id = o.user_id;

-- Сдача кассы вечером.
--
-- В 20:00 по времени бизнеса продукт закрывает забытые смены сам, и
-- делает это правильно: помечает, что наличные не заявлены. На витрине
-- такая пометка появлялась бы каждый вечер, и гость видел бы в ленте
-- жёлтое «не сдал» — то есть ровно ту беду, от которой продукт спасает.
--
-- Поэтому смену закрывает сам мойщик, в 19:20: рабочий день кончился в
-- семь, деньги пересчитаны и сданы. К автозакрытию в 20:07 закрывать уже
-- нечего.
with demo as (
  select id from tenants where name = 'Ավտոլվացում Արշակունյաց'
),
day_start as (
  select date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' as at
),
closing as (
  select s.at + interval '1160 minutes' as at from day_start s
),
-- Наличные спрашиваются с автора записи: деньги взял тот, кто их взял.
-- Делится потом заработок, а не касса.
cash as (
  select o.staff_id as user_id, sum(o.price)::int as sum
  from orders o, demo d, day_start s, closing c
  where o.tenant_id = d.id
    and o.payment = 'cash'
    and o.canceled_at is null
    and o.created_at >= s.at and o.created_at < c.at
  group by o.staff_id
),
/* Суммы берутся скалярным подзапросом, а не join-ом в FROM: на целевую
   таблицу UPDATE из FROM сослаться нельзя, и первая версия падала на
   «invalid reference to FROM-clause entry for table sh». */
closed as (
  update shifts sh
  set closed_at = (select at from closing),
      cash_expected = coalesce((select sum from cash where cash.user_id = sh.user_id), 0),
      cash_declared = coalesce((select sum from cash where cash.user_id = sh.user_id), 0)
  where sh.tenant_id = (select id from demo)
    and sh.closed_at is null
    and sh.opened_at >= (select at from day_start)
    and now() >= (select at from closing)
  returning sh.id, sh.tenant_id, sh.user_id, sh.closed_at, sh.cash_expected, sh.cash_declared
)
insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, data, created_at
)
select c.tenant_id, c.user_id, u.name, 'staff', 'shift.finished', 'shift', c.id,
       jsonb_build_object('cashExpected', c.cash_expected, 'cashDeclared', c.cash_declared),
       c.closed_at
from closed c join users u on u.id = c.user_id;
