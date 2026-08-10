/**
 * Демо-бизнес для ревью App Store.
 *
 * Печатает SQL, который создаёт отдельный бизнес с наполненной историей.
 * Не подключается к базе: боевой Postgres наружу не смотрит, а в образе
 * приложения нет ни tsx, ни этой папки. Готовый SQL уходит в контейнер:
 *
 *   npx tsx scripts/demo-account.ts > /tmp/demo.sql
 *   ssh contabo 'docker exec -i bazis-postgres psql -U bazis -d bazis' < /tmp/demo.sql
 *
 * Данные обязаны быть: ревьюер, увидевший пустые экраны, отклоняет по
 * Guideline 2.1 — приложение выглядит незаконченным. Поэтому здесь десять
 * дней работы, две смены, скидка, аренда и разовые расходы.
 *
 * Срок доступа — 2099 год. Демо, упёршееся в стену «срок истёк» ровно в
 * день ревью, стоит отказа, а ревью случается не тогда, когда его ждёшь.
 */
import { randomUUID } from 'node:crypto';
import { hashPin } from '../lib/pin';

const OWNER_PHONE = '+37499000000';
const STAFF_PHONE = '+37499000001';
const OWNER_PIN = '2468';
const STAFF_PIN = '1357';

/* Сначала здесь стоял 00 000 000 — код оператора, которого в Армении нет
   и который поэтому не может достаться живому человеку. Номер оказался
   непригоден: нормализатор читает ведущий ноль как местную запись 0XX и
   отбрасывает его, и +374 00 000 000 превращается в +374 0000000. Войти
   по такому нельзя вообще — ревьюер упёрся бы в «неверный телефон».

   Поэтому обычный красивый номер на живом коде 99. Теоретически он
   когда-нибудь достанется человеку, и тот увидит «номер занят»; лечится
   переносом демо на соседний. */

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const out: string[] = [];

const tenantId = randomUUID();
const ownerId = randomUUID();
const staffId = randomUUID();
const ownerAccountId = randomUUID();
const staffAccountId = randomUUID();

const services = [
  { id: randomUUID(), name: 'Կոմպլեքս', price: 5000, sort: 0 },
  { id: randomUUID(), name: 'Թափք', price: 3000, sort: 1 },
  { id: randomUUID(), name: 'Սալոն', price: 2500, sort: 2 },
  { id: randomUUID(), name: 'Քիմմաքրում', price: 12000, sort: 3 },
  { id: randomUUID(), name: 'Փայլեցում', price: 20000, sort: 4 },
];

/** Номера настоящего армянского вида: две цифры, две буквы, три цифры. */
const plates = [
  '34 SL 771', '22 OO 145', '07 AB 902', '55 TR 318', '11 KM 640',
  '93 LM 227', '48 GH 505', '76 ZZ 883', '19 QW 412', '61 NN 059',
];

/**
 * Смещения в часах от полуночи — рабочий день, а не ровный ряд.
 *
 * Семь непохожих дней, которые прокручиваются на весь месяц: и загруженные,
 * и почти пустые. Ровный график выдаёт подделку с первого взгляда.
 */
const week = [
  [9.5, 11, 12.25, 14, 16.5],
  [10, 11.5, 15, 17.75],
  [9.25, 10.75, 13.5, 14.25, 18],
  [11, 16],
  [9.75, 12, 13, 15.5, 17, 18.5],
  [10.5, 14.75],
  [9.5, 11.25, 12.5, 15, 16.25, 19],
];

/* Месяц, а не неделя. Аренда 300 000 начисляется за все тридцать дней, и
   против недели выручки она давала минус 173 000 — ревьюер решил бы, что
   продукт считает неправильно, и был бы прав в своём недоверии. */
const DAYS = 30;
const dayShape = Array.from({ length: DAYS }, (_, i) => week[i % week.length]);

async function main() {
  const ownerHash = await hashPin(OWNER_PIN);
  const staffHash = await hashPin(STAFF_PIN);

  out.push('begin;');
  out.push(`
-- Демо-бизнес для App Review. Отдельный tenant: ничего чужого он не видит.
insert into tenants (id, name, niche, client_id_label, client_id_type, staff_role, unit_one, plan, paid_until)
values (${q(tenantId)}, ${q('Tetrin Դեմո')}, 'carwash', ${q('Պետհամարանիշ')}, 'plate', ${q('Լվացող')}, ${q('մեքենա')}, 'active', timestamptz '2099-01-01 00:00:00+04');`);

  /* Человек заводится раньше участия: телефон и код принадлежат ему, а
     строка users — только его работе на этой мойке. Без этого демо
     осталось бы единственным местом в продукте, где участие висит без
     человека. */
  out.push(`
insert into accounts (id, phone, pin_hash) values
  (${q(ownerAccountId)}, ${q(OWNER_PHONE)}, ${q(ownerHash)}),
  (${q(staffAccountId)}, ${q(STAFF_PHONE)}, ${q(staffHash)});`);

  out.push(`
insert into users (id, tenant_id, account_id, phone, pin_hash, name, role, percent) values
  (${q(ownerId)}, ${q(tenantId)}, ${q(ownerAccountId)}, ${q(OWNER_PHONE)}, ${q(ownerHash)}, ${q('Արամ')}, 'owner', 0),
  (${q(staffId)}, ${q(tenantId)}, ${q(staffAccountId)}, ${q(STAFF_PHONE)}, ${q(staffHash)}, ${q('Դավիթ')}, 'staff', 40);`);

  out.push(`
insert into services (id, tenant_id, name, price, sort) values
${services.map((s) => `  (${q(s.id)}, ${q(tenantId)}, ${q(s.name)}, ${s.price}, ${s.sort})`).join(',\n')};`);

  /* Клиенты заводятся из записей, но счётчики визитов проще посчитать
     сразу: их обновляет апсерт при записи, а мы вставляем историю мимо
     него. */
  const clientRows: string[] = [];
  const orderRows: string[] = [];
  const visits = new Map<string, { id: string; visits: number; total: number }>();

  let plateIndex = 0;
  dayShape.forEach((hours, dayBack) => {
    // день 0 — самый ранний, последний элемент — сегодня
    const days = dayShape.length - 1 - dayBack;

    hours.forEach((hour, n) => {
      const plate = plates[plateIndex % plates.length];
      plateIndex += 1;

      let client = visits.get(plate);
      if (!client) {
        client = { id: randomUUID(), visits: 0, total: 0 };
        visits.set(plate, client);
      }

      const service = services[(plateIndex + n) % services.length];
      // одна запись в неделю со скидкой — иначе поле listPrice выглядит
      // мёртвым, а оно живое
      const discounted = plateIndex % 11 === 0;
      const price = discounted ? Math.round(service.price * 0.8) : service.price;
      // владелец тоже иногда моет сам — так виден смысл двух исполнителей
      const byOwner = plateIndex % 7 === 0;
      const payment = ['cash', 'cash', 'card', 'cash', 'transfer'][plateIndex % 5];

      client.visits += 1;
      client.total += price;

      orderRows.push(
        /* `least(..., now())` обязателен для сегодняшнего дня.

           Часы записей заданы по рабочему дню — девять утра, полдень,
           три часа. Если демо разворачивают в восемь утра, половина
           сегодняшних машин оказывается в будущем, и зарплата их не
           видит: она считает до «сейчас», иначе машина, записанная в
           момент нажатия «выплачено», молча пометилась бы оплаченной.
           Экран получался страшный — целый мойщик пропадал из списка
           вместе с причитающимися ему деньгами. */
        `  (${q(randomUUID())}, ${q(tenantId)}, ${q(client.id)}, ${q(byOwner ? ownerId : staffId)}, ${q(service.id)}, ${q(service.name)}, ${price}, ${service.price}, ${byOwner ? 0 : 40}, ${q(payment)}, ` +
          `least(date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '${days} days' + interval '${Math.round(hour * 60)} minutes', now() - interval '1 minute'))`,
      );
    });
  });

  for (const [plate, c] of visits) {
    clientRows.push(
      `  (${q(c.id)}, ${q(tenantId)}, ${q(plate)}, ${c.visits}, ${c.total})`,
    );
  }

  out.push(`
insert into clients (id, tenant_id, key, visits, total) values
${clientRows.join(',\n')};`);

  out.push(`
insert into orders (id, tenant_id, client_id, staff_id, service_id, service_name, price, list_price, staff_percent, payment, created_at) values
${orderRows.join(',\n')};`);

  out.push(`
-- Аренда действует с прошлого месяца, разовые расходы — на своих днях.
insert into expenses (tenant_id, amount, category, monthly, at) values
  (${q(tenantId)}, 300000, ${q('Վարձ')}, true, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '35 days'),
  (${q(tenantId)}, 18000, ${q('Քիմիա')}, false, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '4 days' + interval '11 hours'),
  (${q(tenantId)}, 6500, ${q('Ջուր')}, false, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '2 days' + interval '10 hours');`);

  out.push(`
-- Закрытые смены со сданной наличностью — без них экран истории дня пуст,
-- а он один из главных. Плюс открытая сегодня: тогда на «Այսօր» видно
-- зелёную точку «на мойке», иначе этот раздел ревьюеру не показать.
insert into shifts (tenant_id, user_id, opened_at, closed_at, cash_declared, cash_expected) values
  (${q(tenantId)}, ${q(staffId)}, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '2 days' + interval '9 hours', date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '2 days' + interval '20 hours', 14000, 14000),
  (${q(tenantId)}, ${q(staffId)}, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '1 days' + interval '9 hours', date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' - interval '1 days' + interval '19 hours', 11000, 12500);

insert into shifts (tenant_id, user_id, opened_at) values
  (${q(tenantId)}, ${q(staffId)}, date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan' + interval '9 hours');`);

  out.push('commit;');

  out.push(`
-- Проверка: сколько получилось.
select (select count(*) from orders where tenant_id = ${q(tenantId)}) as orders,
       (select count(*) from clients where tenant_id = ${q(tenantId)}) as clients,
       (select sum(price) from orders where tenant_id = ${q(tenantId)}) as revenue;`);

  console.log(out.join('\n'));
  console.error(`\nвладелец: ${OWNER_PHONE}  PIN ${OWNER_PIN}`);
  console.error(`сотрудник: ${STAFF_PHONE}  PIN ${STAFF_PIN}`);
  console.error(`tenant: ${tenantId}\n`);
}

main();
