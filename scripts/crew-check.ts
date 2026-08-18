/**
 * Сквозной прогон совместной мойки — по слою данных, а не по HTTP.
 *
 * Запуск:  set -a; . ./.env.local; set +a; npx tsx scripts/crew-check.ts
 *
 * Переменные читаются ИЗ ОКРУЖЕНИЯ, а не из файла самим скриптом:
 * `lib/db` смотрит на `DATABASE_URL` в момент импорта, а импорты в
 * модуле поднимаются выше любого кода — прочитанный в теле файл
 * `.env.local` опоздал бы, и прогон молча ушёл бы в пустой PGlite,
 * где «все проверки проходят», потому что таблиц нет вовсе.
 *
 * Проверяет ровно то, ради чего совместная мойка и делалась, и ровно то,
 * что при ней легче всего сломать:
 *
 *   — одиночная запись считается КАК РАНЬШЕ, до драма;
 *   — фонд совместной делится без потери остатка;
 *   — машина остаётся ОДНОЙ: число машин и выручка не удваиваются;
 *   — каждый участник видит запись у себя и видит СВОЮ долю;
 *   — правка процента не переписывает прошлые зарплаты;
 *   — чужого, уволенного и человека из другого бизнеса сервер не берёт;
 *   — отмена уносит начисления у всех сразу.
 *
 * Данные создаёт свои и в конце уносит целиком: прогон по общей
 * dev-базе ничего чужого не трогает.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { accounts, orders, orderShares, services, shifts, tenants, users } from '../lib/db/schema';
import { createOrder, cancelOrder, setOrderCrew } from '../lib/orders';
import { saveTeamPercent } from '../lib/catalog';
import {
  getPeriodStats,
  getShift,
  getUnsettledByDay,
  getUnsettledOrderLines,
} from '../lib/queries';
import { formatMoney } from '../lib/money';

let failures = 0;
let checks = 0;

function is(what: string, got: unknown, want: unknown) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}: ${JSON.stringify(got)}${ok ? '' : ` ≠ ${JSON.stringify(want)}`}`);
}

async function rejects(what: string, run: () => Promise<unknown>) {
  checks++;
  try {
    await run();
    failures++;
    console.log(`  FAIL ${what}: прошло, а не должно было`);
  } catch (e) {
    console.log(`  ok   ${what}: отказ «${e instanceof Error ? e.message : e}»`);
  }
}

const money = (n: number) => formatMoney(n, 'AMD', 'ru');

async function main() {
  const stamp = Date.now();

  /* ---------------- владелец заводит мойку и трёх мойщиков ---------------- */

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `Проверка бригады ${stamp}`,
      niche: 'carwash',
      clientIdLabel: 'Номер',
      clientIdType: 'plate',
      staffRole: 'Мойщик',
      unitOne: 'машина',
      plan: 'active',
      paidUntil: new Date(Date.now() + 86_400_000),
    })
    .returning();

  /* Второй бизнес — только ради одной проверки: человека оттуда в состав
     брать нельзя, и отказ обязан прийти от сервера, а не от формы. */
  const [other] = await db
    .insert(tenants)
    .values({
      name: `Соседняя мойка ${stamp}`,
      niche: 'carwash',
      clientIdLabel: 'Номер',
      clientIdType: 'plate',
      staffRole: 'Мойщик',
      unitOne: 'машина',
      plan: 'active',
      paidUntil: new Date(Date.now() + 86_400_000),
    })
    .returning();

  async function person(tenantId: string, name: string, percent: number, active = true) {
    const [account] = await db
      .insert(accounts)
      .values({ phone: `+37477${String(stamp).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`, pinHash: 'x' })
      .returning();
    const [row] = await db
      .insert(users)
      .values({
        tenantId,
        accountId: account.id,
        phone: account.phone,
        pinHash: 'x',
        name,
        role: 'staff',
        percent,
        active,
      })
      .returning();
    return row;
  }

  const arman = await person(tenant.id, 'Арман', 40);
  const david = await person(tenant.id, 'Давид', 35);
  const karen = await person(tenant.id, 'Карен', 30);
  const fired = await person(tenant.id, 'Уволенный', 30, false);
  const stranger = await person(other.id, 'Чужой', 50);

  /* Смены: без них запись не проходит проверку `canRecord`. Здесь она не
     вызывается — `createOrder` про смены не знает, — но открываем всем
     для честности сценария. */
  await db.insert(shifts).values(
    [arman, david, karen].map((p) => ({ tenantId: tenant.id, userId: p.id })),
  );

  const [wash] = await db
    .insert(services)
    .values({ tenantId: tenant.id, name: 'Комплекс', price: 10_000 })
    .returning();
  const [big] = await db
    .insert(services)
    .values({ tenantId: tenant.id, name: 'Комплекс+', price: 12_000 })
    .returning();
  const [free] = await db
    .insert(services)
    .values({ tenantId: tenant.id, name: 'Бесплатно', price: 0 })
    .returning();

  const add = (input: Parameters<typeof createOrder>[0]) => createOrder(input);
  const base = { tenantId: tenant.id, clientKey: '', payment: 'cash' as const };

  console.log(`\nВладелец завёл мойку, трёх мойщиков и прайс.`);
  console.log(`  Арман 40%, Давид 35%, Карен 30%`);

  /* ---------------- 1. одиночная мойка: ничего не изменилось --------------- */

  console.log('\n1. Арман моет один. Комплекс 10 000 ֏, его ставка 40%.');
  const solo = await add({ ...base, staffId: arman.id, serviceId: wash.id, clientKey: '11AA111' });
  const soloShares = await sharesOf(solo.order.id);
  is('ставка в записи', solo.order.staffPercent, 40);
  is('участников', soloShares.length, 1);
  is('заработок Армана', soloShares[0].earned, 4_000);
  console.log(`     → Арман получает ${money(soloShares[0].earned)}`);

  /* ---------------- 2. двое: общий процент 50% ---------------------------- */

  await saveTeamPercent({ tenantId: tenant.id, percent: 50 });
  console.log('\n2. Владелец задал общий процент команды: 50%.');
  console.log('   Арман и Давид моют вместе. Комплекс 10 000 ֏.');

  const duo = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id],
    serviceId: wash.id,
    clientKey: '22BB222',
  });
  const duoShares = await sharesOf(duo.order.id);
  is('ставка в записи — команды, а не личная', duo.order.staffPercent, 50);
  is('участников', duoShares.length, 2);
  is('фонд', duoShares.reduce((s, x) => s + x.earned, 0), 5_000);
  is('доли', duoShares.map((s) => s.earned), [2_500, 2_500]);
  console.log(`     → фонд ${money(5_000)}, каждому ${money(2_500)}`);

  /* ---------------- 3. трое и дробное деление ----------------------------- */

  await saveTeamPercent({ tenantId: tenant.id, percent: 45 });
  console.log('\n3. Владелец сменил общий процент на 45%.');
  console.log('   Арман, Давид и Карен моют вместе. Комплекс+ 12 000 ֏.');

  const trio = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id, karen.id],
    serviceId: big.id,
    clientKey: '33CC333',
  });
  const trioShares = await sharesOf(trio.order.id);
  is('ставка в записи', trio.order.staffPercent, 45);
  is('фонд', trioShares.reduce((s, x) => s + x.earned, 0), 5_400);
  is('доли', trioShares.map((s) => s.earned), [1_800, 1_800, 1_800]);
  console.log(`     → фонд ${money(5_400)}, каждому ${money(1_800)}`);

  /* ---------------- 4. остаток от деления никуда не девается -------------- */

  console.log('\n4. Деление с остатком: 10 000 ֏ · 50% на троих.');
  await saveTeamPercent({ tenantId: tenant.id, percent: 50 });
  const odd = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id, karen.id],
    serviceId: wash.id,
    clientKey: '44DD444',
  });
  const oddShares = await sharesOf(odd.order.id);
  is('доли', oddShares.map((s) => s.earned), [1_667, 1_667, 1_666]);
  is('сумма долей равна фонду', oddShares.reduce((s, x) => s + x.earned, 0), 5_000);
  console.log(`     → ${money(1_667)} + ${money(1_667)} + ${money(1_666)} = ${money(5_000)}`);

  /* ---------------- 5. бизнес видит ОДНУ машину --------------------------- */

  const from = new Date(Date.now() - 86_400_000);
  const stats = await getPeriodStats(tenant.id, from);
  console.log('\n5. Что видит владелец за период.');
  is('машин', stats.count, 4);
  is('выручка', stats.revenue, 10_000 + 10_000 + 12_000 + 10_000);
  is('зарплата', stats.payroll, 4_000 + 5_000 + 5_400 + 5_000);
  console.log(`     машин ${stats.count}, выручка ${money(stats.revenue)}, зарплата ${money(stats.payroll)}`);

  const byName = new Map(stats.byStaff.map((s) => [s.name, s]));
  is('Арман начислено', byName.get('Арман')?.earned, 4_000 + 2_500 + 1_800 + 1_667);
  is('Давид начислено', byName.get('Давид')?.earned, 2_500 + 1_800 + 1_667);
  is('Карен начислено', byName.get('Карен')?.earned, 1_800 + 1_666);
  is('участий у Армана', byName.get('Арман')?.count, 4);
  is('участий у Карена', byName.get('Карен')?.count, 2);
  console.log(
    `     Арман ${money(byName.get('Арман')!.earned)} · ` +
      `Давид ${money(byName.get('Давид')!.earned)} · ` +
      `Карен ${money(byName.get('Карен')!.earned)}`,
  );
  is(
    'сумма по людям равна зарплате бизнеса',
    stats.byStaff.reduce((s, x) => s + x.earned, 0),
    stats.payroll,
  );

  /* ---------------- 6. каждый видит запись у себя ------------------------- */

  console.log('\n6. Что видит каждый мойщик у себя в смене.');
  for (const [who, want] of [
    [karen, 1_800 + 1_666],
    [david, 2_500 + 1_800 + 1_667],
    [arman, 4_000 + 2_500 + 1_800 + 1_667],
  ] as const) {
    const shift = await getShift(tenant.id, who.id, from);
    is(`${who.name}: заработок смены`, shift.earned, want);
    console.log(
      `     ${who.name}: машин ${shift.count}, заработок ${money(shift.earned)}` +
        `, из них совместных ${shift.orders.filter((o) => o.crew > 1).length}`,
    );
  }
  const karenShift = await getShift(tenant.id, karen.id, from);
  is('Карен видит машину, которую записал не он', karenShift.orders.length, 2);
  is('и видит в ней свою долю, а не фонд', karenShift.orders.map((o) => o.earned), [1_666, 1_800]);

  /* ---------------- 7. правка процента не трогает прошлое ----------------- */

  console.log('\n7. Через месяц владелец поднял общий процент до 60%.');
  await saveTeamPercent({ tenantId: tenant.id, percent: 60 });
  const trioAfter = await sharesOf(trio.order.id);
  is('старая мойка осталась при 45%', (await orderById(trio.order.id)).staffPercent, 45);
  is('её доли не изменились', trioAfter.map((s) => s.earned), [1_800, 1_800, 1_800]);
  console.log(`     → мойка от 45% всё так же даёт по ${money(1_800)}`);

  /* ---------------- 8. правка состава ------------------------------------- */

  console.log('\n8. Владелец добавил Карена в мойку, где было двое (фонд 5 000 ֏).');
  await setOrderCrew({
    tenantId: tenant.id,
    orderId: duo.order.id,
    byUserId: arman.id,
    participantIds: [arman.id, david.id, karen.id],
  });
  const duoAfter = await sharesOf(duo.order.id);
  is('фонд не изменился', duoAfter.reduce((s, x) => s + x.earned, 0), 5_000);
  is('доли пересчитаны', duoAfter.map((s) => s.earned), [1_667, 1_667, 1_666]);
  is('ставка записи прежняя', (await orderById(duo.order.id)).staffPercent, 50);
  console.log(`     → было по ${money(2_500)} на двоих, стало по ~${money(1_667)} на троих`);

  console.log('\n   Владелец убрал Карена обратно.');
  await setOrderCrew({
    tenantId: tenant.id,
    orderId: duo.order.id,
    byUserId: arman.id,
    participantIds: [arman.id, david.id],
  });
  const duoBack = await sharesOf(duo.order.id);
  is('доли вернулись', duoBack.map((s) => s.earned), [2_500, 2_500]);
  is('осиротевших начислений нет', duoBack.length, 2);

  /* ---------------- 9. безопасность --------------------------------------- */

  console.log('\n9. Что сервер не принимает.');
  await rejects('чужой бизнес', () =>
    add({ ...base, staffId: arman.id, participantIds: [stranger.id], serviceId: wash.id, clientKey: '55EE555' }),
  );
  await rejects('уволенный', () =>
    add({ ...base, staffId: arman.id, participantIds: [fired.id], serviceId: wash.id, clientKey: '55EE556' }),
  );
  /* Не на смене — не участник. Тигран заведён и активен, но сегодня не
     вставал: начислять ему за чужую машину не за что. */
  const offShift = await person(tenant.id, 'Տիգրան', 30);
  await rejects('коллега не на смене', () =>
    add({
      ...base,
      staffId: arman.id,
      participantIds: [offShift.id],
      serviceId: wash.id,
      clientKey: '55EE560',
    }),
  );

  /* А как только встал — берётся. Проверяем обе половины правила: одна
     без другой означала бы либо запрет совместной работы вовсе, либо
     отсутствие проверки. */
  await db.insert(shifts).values({ tenantId: tenant.id, userId: offShift.id });
  const joined = await add({
    ...base,
    staffId: arman.id,
    participantIds: [offShift.id],
    serviceId: wash.id,
    clientKey: '55EE561',
  });
  is('встал на смену — участвует', (await sharesOf(joined.order.id)).length, 2);

  /* Закрытая СЕГОДНЯ смена основанием остаётся: телефон копит записи без
     связи и досылает их вечером, когда смены закрылись сами. */
  await db
    .update(shifts)
    .set({ closedAt: new Date() })
    .where(and(eq(shifts.tenantId, tenant.id), eq(shifts.userId, offShift.id)));
  const late = await add({
    ...base,
    staffId: arman.id,
    participantIds: [offShift.id],
    serviceId: wash.id,
    clientKey: '55EE562',
  });
  is('досылка после закрытия смены проходит', (await sharesOf(late.order.id)).length, 2);

  await rejects('несуществующий id', () =>
    add({
      ...base,
      staffId: arman.id,
      participantIds: ['00000000-0000-0000-0000-000000000000'],
      serviceId: wash.id,
      clientKey: '55EE557',
    }),
  );
  /* Потолок бригады. Люди РАЗНЫЕ: повторы схлопываются, и список из
     девяти одинаковых id проверял бы не потолок, а дедупликацию. */
  const crowdOfNine = await Promise.all(
    Array.from({ length: 8 }, (_, i) => person(tenant.id, `Лишний ${i}`, 30)),
  );
  await rejects('больше восьми участников', () =>
    add({
      ...base,
      staffId: arman.id,
      participantIds: crowdOfNine.map((p) => p.id),
      serviceId: wash.id,
      clientKey: '55EE558',
    }),
  );

  await saveTeamPercent({ tenantId: tenant.id, percent: null });
  await rejects('совместная мойка при выключенном свойстве', () =>
    add({ ...base, staffId: arman.id, participantIds: [david.id], serviceId: wash.id, clientKey: '55EE559' }),
  );
  await saveTeamPercent({ tenantId: tenant.id, percent: 50 });

  /* ---------------- 10. края ---------------------------------------------- */

  console.log('\n10. Края.');
  const zero = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id],
    serviceId: free.id,
    clientKey: '66FF666',
  });
  is('цена 0 — доли нулевые', (await sharesOf(zero.order.id)).map((s) => s.earned), [0, 0]);

  await saveTeamPercent({ tenantId: tenant.id, percent: 0 });
  const nought = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id],
    serviceId: wash.id,
    clientKey: '77GG777',
  });
  is('процент 0 — доли нулевые', (await sharesOf(nought.order.id)).map((s) => s.earned), [0, 0]);

  await saveTeamPercent({ tenantId: tenant.id, percent: 100 });
  const whole = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id, karen.id],
    serviceId: wash.id,
    clientKey: '88HH888',
  });
  const wholeShares = await sharesOf(whole.order.id);
  is('процент 100 на троих', wholeShares.map((s) => s.earned), [3_334, 3_333, 3_333]);
  is('и сумма равна цене', wholeShares.reduce((s, x) => s + x.earned, 0), 10_000);

  await saveTeamPercent({ tenantId: tenant.id, percent: 50 });
  const twice = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id],
    serviceId: wash.id,
    clientKey: '99II999',
    clientRef: 'ref-double-tap',
  });
  const again = await add({
    ...base,
    staffId: arman.id,
    participantIds: [david.id],
    serviceId: wash.id,
    clientKey: '99II999',
    clientRef: 'ref-double-tap',
  });
  is('двойное нажатие: та же запись', again.order.id, twice.order.id);
  is('и доли не удвоились', (await sharesOf(twice.order.id)).length, 2);

  const five = [david.id, karen.id];
  const more = await Promise.all([person(tenant.id, 'Ваан', 30), person(tenant.id, 'Гор', 30)]);
  /* Смены новичкам: без них состав не примут, и правильно — в бригаду
     берут того, кто сегодня работает. */
  await db
    .insert(shifts)
    .values(more.map((p) => ({ tenantId: tenant.id, userId: p.id })));
  const crowd = await add({
    ...base,
    staffId: arman.id,
    participantIds: [...five, ...more.map((p) => p.id)],
    serviceId: wash.id,
    clientKey: '10JJ101',
  });
  const crowdShares = await sharesOf(crowd.order.id);
  is('пятеро: доли', crowdShares.map((s) => s.earned), [1_000, 1_000, 1_000, 1_000, 1_000]);

  /* ---------------- 11. отмена -------------------------------------------- */

  console.log('\n11. Отмена совместной мойки.');
  const beforeCancel = await getShift(tenant.id, karen.id, from);
  await cancelOrder({ tenantId: tenant.id, orderId: trio.order.id, byUserId: arman.id });
  const afterCancel = await getShift(tenant.id, karen.id, from);
  is('машина исчезла у участника', beforeCancel.count - afterCancel.count, 1);
  is('и его заработок уменьшился на его долю', beforeCancel.earned - afterCancel.earned, 1_800);

  const davidAfter = await getShift(tenant.id, david.id, from);
  is(
    'и у второго участника тоже',
    davidAfter.orders.some((o) => o.id === trio.order.id),
    false,
  );

  /* ---------------- 12. ведомость ----------------------------------------- */

  const days = await getUnsettledByDay(tenant.id, 'Asia/Yerevan');
  const lines = await getUnsettledOrderLines(tenant.id, 'Asia/Yerevan');
  console.log('\n12. Ведомость.');
  const ledger = new Map<string, number>();
  for (const d of days) ledger.set(d.name ?? '—', (ledger.get(d.name ?? '—') ?? 0) + d.earned);
  for (const [name, sum] of ledger) console.log(`     ${name}: ${money(sum)}`);
  is(
    'разложение по машинам сходится с дневными суммами',
    lines.reduce((s, l) => s + l.earned, 0),
    days.reduce((s, d) => s + d.earned, 0),
  );
  is('в разложении видно, что мыли вместе', lines.some((l) => l.crew > 1), true);

  /* ---------------- убираем за собой -------------------------------------- */

  await db.delete(tenants).where(inArray(tenants.id, [tenant.id, other.id]));
  const ids = [arman, david, karen, fired, stranger, offShift, ...more, ...crowdOfNine].map(
    (p) => p.accountId!,
  );
  await db.delete(accounts).where(inArray(accounts.id, ids));

  console.log(`\n${failures === 0 ? 'ВСЁ СОШЛОСЬ' : 'ЕСТЬ РАСХОЖДЕНИЯ'} · проверок ${checks}, отказов ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

async function sharesOf(orderId: string) {
  return db
    .select()
    .from(orderShares)
    .where(eq(orderShares.orderId, orderId))
    .orderBy(orderShares.sort);
}

async function orderById(id: string) {
  const [row] = await db.select().from(orders).where(and(eq(orders.id, id)));
  return row;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
