/**
 * История демо-бизнеса за четыре месяца.
 *
 * Печатает SQL, который стирает у демо всё нажитое и насыпает заново.
 * К базе не подключается: боевой Postgres наружу не смотрит.
 *
 *   npx tsx scripts/demo-history.ts > /tmp/demo-history.sql
 *   ssh contabo 'docker exec -i bazis-postgres psql -U bazis -d bazis' < /tmp/demo-history.sql
 *
 * Тенант и учётки НЕ трогаются: телефоны и PIN-коды выданы и ревьюеру
 * Apple, и на показах. Стираются только записи, клиенты, расходы, смены и
 * выплаты — всё, что можно нажить заново.
 *
 * Зачем четыре месяца. Вкладки стали календарными: «этот месяц» сравнивается
 * с прошлым по то же число, «прошлый» — с позапрошлым целиком. Одному
 * месяцу истории сравнивать не с чем, и половина экрана молчит.
 *
 * Случайность детерминированная. Прогон должен давать те же цифры: иначе
 * невозможно ни сверить арифметику, ни повторить чужую жалобу.
 */
import { randomUUID } from 'node:crypto';

const TENANT = 'Tetrin Դեմո';
const MONTHS = 4;
const DAYS = MONTHS * 30 + 15; // с запасом, чтобы накрыть четыре календарных

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Момент внутри дня N суток назад, в поясе бизнеса. */
const at = (daysAgo: number, minutes: number) =>
  `date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan'` +
  ` - interval '${daysAgo} days' + interval '${minutes} minutes'`;

/** mulberry32: детерминированный шум, чтобы прогон повторялся. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const services = [
  { name: 'Կոմպլեքս', price: 5000, weight: 34 },
  { name: 'Թափք', price: 3000, weight: 26 },
  { name: 'Սալոն', price: 2500, weight: 18 },
  { name: 'Քիմմաքրում', price: 12000, weight: 15 },
  { name: 'Փայլեցում', price: 20000, weight: 7 },
];

/* Номера армянского вида. Пул большой, но с перекосом: часть машин ездит
   постоянно, часть заезжает раз. Без повторов «база клиентов» пуста, а это
   один из разделов продукта. */
const plates = [
  '34 SL 771', '22 OO 145', '07 AB 902', '55 TR 318', '11 KM 640',
  '93 LM 227', '48 GH 505', '76 ZZ 883', '19 QW 412', '61 NN 059',
  '25 HH 300', '88 VV 141', '13 PL 627', '40 RS 019', '72 DK 458',
  '05 MM 812', '67 TT 233', '29 BC 706', '51 FG 194', '96 XY 380',
];

/**
 * Загрузка по дням недели.
 *
 * Суббота — пик, понедельник — провал. Ради этого рельефа сравнение
 * «сегодня» и делается с тем же днём недели неделю назад: суббота против
 * пятницы отличается вдвое, и разница сообщала бы про календарь.
 * Индекс — как у `Date.getDay()`: 0 воскресенье.
 */
const byWeekday = [1.15, 0.62, 0.78, 0.85, 0.95, 1.1, 1.35];

/**
 * Ход по месяцам: рост, один слабый месяц, снова рост.
 *
 * Ровная линия делает сравнение месяцев бессмысленным — всегда «плюс-минус
 * ничего». Провал в середине нужен, чтобы было видно, что цифра живая.
 * Индекс 0 — самый давний месяц.
 */
const byMonth = [0.82, 1.0, 0.88, 1.12];

function main() {
  const rand = rng(20260807);
  const out: string[] = [];

  out.push(`\\set ON_ERROR_STOP on
begin;

-- Тенант и пользователи остаются: их телефоны и PIN выданы наружу.
create temporary table demo as select id from tenants where name = ${q(TENANT)};

do $$
begin
  if not exists (select 1 from demo) then
    raise exception 'демо-бизнес ${TENANT} не найден';
  end if;
end $$;

-- Стираем всё нажитое. Порядок по зависимостям.
delete from audit    where tenant_id in (select id from demo);
delete from payouts  where tenant_id in (select id from demo);
delete from shifts   where tenant_id in (select id from demo);
delete from orders   where tenant_id in (select id from demo);
delete from clients  where tenant_id in (select id from demo);
delete from expenses where tenant_id in (select id from demo);

-- Второй мойщик: с одним исполнителем раздел «кто сколько намыл» — это
-- одна строка, и смысл процентов на экране не читается.
insert into users (tenant_id, phone, pin_hash, name, role, percent)
select id, '+37499000002',
       (select pin_hash from users where phone = '+37499000001'),
       'Գագո', 'staff', 45
from demo
on conflict (phone) do nothing;`);

  // идентификаторы берём из базы по телефонам — они там уже есть
  out.push(`
create temporary table ids as
select (select id from demo) as tenant,
       (select id from users where phone = '+37499000000') as owner,
       (select id from users where phone = '+37499000001') as staff1,
       (select id from users where phone = '+37499000002') as staff2;`);

  out.push(`
-- Услуги могли остаться с прошлого посева; если их нет — заводим.
insert into services (tenant_id, name, price, sort)
select (select tenant from ids), v.name, v.price, v.sort
from (values
${services.map((s, i) => `  (${q(s.name)}, ${s.price}, ${i})`).join(',\n')}
) as v(name, price, sort)
where not exists (
  select 1 from services s
  where s.tenant_id = (select tenant from ids) and s.name = v.name
);`);

  /* ── записи ── */
  const clients = new Map<string, { id: string; visits: number; total: number; last: number }>();
  const orderRows: string[] = [];
  // наличные по дню и исполнителю — из них считается сдача смены
  const cashBy = new Map<string, number>();

  const pickService = () => {
    const total = services.reduce((n, s) => n + s.weight, 0);
    let r = rand() * total;
    for (const s of services) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return services[0];
  };

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const day = new Date(Date.now() - daysAgo * 86_400_000);
    const monthBucket = Math.min(MONTHS - 1, Math.floor((DAYS - daysAgo) / 30));
    const load = byWeekday[day.getDay()] * byMonth[monthBucket];

    // 12–34 машины в день с шумом
    const cars = Math.max(6, Math.round(18 * load + (rand() - 0.5) * 7));

    for (let i = 0; i < cars; i++) {
      /* Постоянные клиенты берутся из первой трети пула — так у части
         машин набирается история визитов, а у части остаётся один заезд. */
      const regular = rand() < 0.55;
      const plate = regular
        ? plates[Math.floor(rand() * 7)]
        : plates[Math.floor(rand() * plates.length)];

      let c = clients.get(plate);
      if (!c) {
        c = { id: randomUUID(), visits: 0, total: 0, last: daysAgo };
        clients.set(plate, c);
      }

      const svc = pickService();
      // раз в двадцатую запись — скидка, иначе поле цены по прайсу мёртвое
      const discount = rand() < 0.05;
      const price = discount ? Math.round(svc.price * 0.85) : svc.price;

      // владелец иногда моет сам, но редко: у него процент ноль
      const r = rand();
      const who = r < 0.45 ? 'staff1' : r < 0.9 ? 'staff2' : 'owner';
      const percent = who === 'staff1' ? 40 : who === 'staff2' ? 45 : 0;

      const p = rand();
      const payment = p < 0.45 ? 'cash' : p < 0.85 ? 'card' : 'transfer';

      // заезды с 9:00 до 20:00, гуще к вечеру
      const minutes = Math.round(540 + rand() ** 0.8 * 660);

      c.visits += 1;
      c.total += price;
      c.last = Math.min(c.last, daysAgo);

      if (payment === 'cash' && who !== 'owner') {
        const key = `${daysAgo}|${who}`;
        cashBy.set(key, (cashBy.get(key) ?? 0) + price);
      }

      orderRows.push(
        `  ((select tenant from ids), ${q(c.id)}, (select ${who} from ids), ` +
          `(select id from services where tenant_id = (select tenant from ids) and name = ${q(svc.name)} limit 1), ` +
          `${q(svc.name)}, ${price}, ${svc.price}, ${percent}, ${q(payment)}, ${at(daysAgo, minutes)})`,
      );
    }
  }

  out.push(`
insert into clients (id, tenant_id, key, visits, total) values
${[...clients.entries()]
  .map(([plate, c]) => `  (${q(c.id)}, (select tenant from ids), ${q(plate)}, ${c.visits}, ${c.total})`)
  .join(',\n')};`);

  // порциями: один insert на две с половиной тысячи строк psql переварит,
  // но читать его при отладке невозможно
  for (let i = 0; i < orderRows.length; i += 400) {
    out.push(`
insert into orders (tenant_id, client_id, staff_id, service_id, service_name, price, list_price, staff_percent, payment, created_at) values
${orderRows.slice(i, i + 400).join(',\n')};`);
  }

  /* ── смены ── */
  const shiftRows: string[] = [];
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    for (const who of ['staff1', 'staff2'] as const) {
      const expected = cashBy.get(`${daysAgo}|${who}`) ?? 0;
      if (expected === 0) continue;

      /* Недостача раз в семь смен, и небольшая. Это то, ради чего в кассовом
         бизнесе вообще ставят учёт, и на демо она должна быть видна — но
         как исключение, а не как правило. */
      const short = rand() < 0.14 ? Math.round(expected * (0.04 + rand() * 0.08) / 100) * 100 : 0;
      shiftRows.push(
        `  ((select tenant from ids), (select ${who} from ids), ${at(daysAgo, 540)}, ${at(daysAgo, 1230)}, ${expected - short}, ${expected})`,
      );
    }
  }
  out.push(`
insert into shifts (tenant_id, user_id, opened_at, closed_at, cash_declared, cash_expected) values
${shiftRows.join(',\n')};`);

  out.push(`
-- Открытая смена на сегодня: без неё на «Այսօր» пуст раздел «на мойке»,
-- а зелёная точка «сейчас работает» — половина смысла этого экрана.
insert into shifts (tenant_id, user_id, opened_at) values
  ((select tenant from ids), (select staff1 from ids), ${at(0, 540)});`);

  /* ── расходы ── */
  const oneOff: string[] = [];
  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo -= 1) {
    if (rand() < 0.12) {
      const kind = rand() < 0.6 ? { name: 'Քիմիա', base: 18000 } : { name: 'Ջուր', base: 6500 };
      const amount = Math.round((kind.base * (0.7 + rand() * 0.8)) / 500) * 500;
      oneOff.push(
        `  ((select tenant from ids), ${amount}, ${q(kind.name)}, false, ${at(daysAgo, 600)})`,
      );
    }
  }
  out.push(`
-- Аренда действует весь период целиком: в календарном месяце она входит
-- полной суммой, внутри суток — дневной долей.
insert into expenses (tenant_id, amount, category, monthly, at) values
  ((select tenant from ids), 300000, ${q('Վարձ')}, true, ${at(DAYS + 5, 0)}),
  ((select tenant from ids), 45000, ${q('Հոսանք')}, true, ${at(DAYS + 5, 0)}),
${oneOff.join(',\n')};`);

  /* ── выплаты ── */
  const payoutRows: string[] = [];
  for (let daysAgo = DAYS - 14; daysAgo >= 14; daysAgo -= 14) {
    for (const who of ['staff1', 'staff2'] as const) {
      payoutRows.push(
        `  ((select tenant from ids), (select ${who} from ids), ${at(daysAgo + 14, 0)}, ${at(daysAgo, 0)}, ` +
          `(select coalesce(sum(floor(price * staff_percent / 100.0)), 0)::int from orders ` +
          `where tenant_id = (select tenant from ids) and staff_id = (select ${who} from ids) ` +
          `and canceled_at is null and created_at >= ${at(daysAgo + 14, 0)} and created_at < ${at(daysAgo, 0)}), ` +
          `${at(daysAgo, 1200)})`,
      );
    }
  }
  out.push(`
-- Выплаты раз в две недели: без них «начислено» и «к выплате» совпадают, и
-- смысл раздела зарплат не виден.
insert into payouts (tenant_id, staff_id, period_from, period_to, amount, paid_at) values
${payoutRows.join(',\n')};`);

  out.push(`
commit;

select
  (select count(*) from orders   where tenant_id = (select id from demo)) as записей,
  (select count(*) from clients  where tenant_id = (select id from demo)) as клиентов,
  (select count(*) from shifts   where tenant_id = (select id from demo)) as смен,
  (select count(*) from expenses where tenant_id = (select id from demo)) as расходов,
  (select to_char(min(created_at) at time zone 'Asia/Yerevan', 'DD.MM.YYYY') from orders where tenant_id = (select id from demo)) as с,
  (select to_char(max(created_at) at time zone 'Asia/Yerevan', 'DD.MM.YYYY') from orders where tenant_id = (select id from demo)) as по,
  (select sum(price) from orders where tenant_id = (select id from demo)) as выручка;`);

  console.log(out.join('\n'));
  console.error(`\nдней: ${DAYS}, записей: ${orderRows.length}, клиентов: ${clients.size}`);
  console.error(`смен: ${shiftRows.length}, выплат: ${payoutRows.length}\n`);
}

main();
