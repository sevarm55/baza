/**
 * Проверка слоя данных на чистой базе в памяти.
 * Запуск: npm run smoke
 *
 * Проверяем ровно то, на чём держится продукт:
 * снимки цен, атомарность записи, изоляцию бизнесов друг от друга.
 */
process.env.PGLITE_DIR = 'memory://';

let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

async function main() {
  const { ensureDb } = await import('../lib/db/ready');
  const { createBusiness } = await import('../lib/tenant');
  const { createOrder, cancelOrder } = await import('../lib/orders');
  const { db } = await import('../lib/db');
  const { users, services } = await import('../lib/db/schema');
  const { hashPin } = await import('../lib/pin');
  const q = await import('../lib/queries');
  const { eq } = await import('drizzle-orm');
  const { formatMoney } = await import('../lib/money');

  await ensureDb();
  console.log('\nмиграции применены\n');

  /* ---------- бизнес №1: автомойка ---------- */
  const { tenant, owner } = await createBusiness({
    niche: 'carwash',
    businessName: 'Ավտոլվացում Կոմիտասի վրա',
    ownerName: 'Արամ',
    phone: '077 111 222',
    pin: '1234',
  });

  console.log('бизнес:', tenant.name);
  check('телефон нормализован в E.164', owner.phone === '+37477111222', owner.phone);
  check(
    'термины ниши скопированы в тенант',
    tenant.clientIdType === 'plate' && tenant.staffRole === 'Լվացող',
  );
  check('триал на 14 дней', !!tenant.trialEndsAt);

  const svc = await q.listServices(tenant.id);
  check('услуги засеяны из конфига ниши', svc.length === 5, svc.length);

  /* ---------- сотрудник ---------- */
  const [washer] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      phone: '+37477333444',
      pinHash: await hashPin('5678'),
      name: 'Աշոտ',
      role: 'staff',
      percent: 40,
    })
    .returning();

  /* ---------- три записи ---------- */
  const complex = svc.find((s) => s.name === 'Կոմպլեքս')!;
  const body = svc.find((s) => s.name === 'Թափք')!;

  await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '12 ab 345', payment: 'cash',
  });
  await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: body.id,
    clientKey: '12 AB 345', payment: 'card',
  });
  const third = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '07 XY 991', payment: 'cash',
  });

  const today = q.startOfDay(tenant.timezone);

  const shift = await q.getShift(tenant.id, washer.id, today);
  check('в смене 3 записи', shift.count === 3, shift.count);
  check('выручка 13 000', shift.revenue === 13000, shift.revenue);
  check('заработок мойщика 40% = 5 200', shift.earned === 5200, shift.earned);

  const client = await q.findClient(tenant.id, '12 ab 345');
  check('регистр номера не создал второго клиента', client?.visits === 2, client?.visits);
  check('сумма по клиенту 8 000', client?.total === 8000, client?.total);

  /* ---------- снимок цены ---------- */
  await db.update(services).set({ price: 9999 }).where(eq(services.id, complex.id));
  const afterPriceChange = await q.getShift(tenant.id, washer.id, today);
  check(
    'смена цены НЕ переписала прошлые записи',
    afterPriceChange.revenue === 13000,
    afterPriceChange.revenue,
  );

  /* ---------- снимок процента ---------- */
  await db.update(users).set({ percent: 90 }).where(eq(users.id, washer.id));
  const afterPercentChange = await q.getShift(tenant.id, washer.id, today);
  check(
    'смена процента НЕ переписала прошлые зарплаты',
    afterPercentChange.earned === 5200,
    afterPercentChange.earned,
  );

  /* ---------- отмена ---------- */
  await cancelOrder({ tenantId: tenant.id, orderId: third.order.id, byUserId: owner.id });
  const afterCancel = await q.getShift(tenant.id, washer.id, today);
  check('отмена убрала запись из выручки', afterCancel.revenue === 8000, afterCancel.revenue);
  // клиент, чью единственную запись отменили, больше не показывается:
  // подсказка «был 0 раз на 0 ֏» врала бы сотруднику
  check('клиент без визитов скрыт', (await q.findClient(tenant.id, '07 XY 991')) === null);
  check(
    'и не попадает в список владельца',
    !(await q.listClients(tenant.id)).some((c) => c.key === '07 XY 991'),
  );

  /* ---------- статистика владельца ---------- */
  const stats = await q.getPeriodStats(tenant.id, today);
  check('владелец видит ту же выручку', stats.revenue === 8000, stats.revenue);
  check('наличные посчитаны отдельно', stats.cash === 5000, stats.cash);
  check('средний чек', stats.avgCheck === 4000, stats.avgCheck);

  /* ---------- бизнес №2: изоляция ---------- */
  const second = await createBusiness({
    niche: 'dental',
    businessName: 'Ատամնաբուժարան',
    ownerName: 'Անի',
    phone: '077 999 888',
    pin: '4321',
  });
  const otherStats = await q.getPeriodStats(second.tenant.id, today);
  check('второй бизнес не видит чужих денег', otherStats.revenue === 0, otherStats.revenue);
  check('у второго бизнеса свои услуги', (await q.listServices(second.tenant.id)).length === 5);
  check(
    'ниша задала свои термины',
    second.tenant.clientIdType === 'phone' && second.tenant.staffRole === 'Բժիշկ',
  );

  /* ---------- защита от чужого id ---------- */
  let blocked = false;
  try {
    await createOrder({
      tenantId: second.tenant.id, staffId: washer.id, serviceId: complex.id,
      clientKey: '12 AB 345', payment: 'cash',
    });
  } catch {
    blocked = true;
  }
  check('нельзя записать заказ на услугу чужого бизнеса', blocked);

  /* ---------- дубль телефона ---------- */
  let phoneBlocked = false;
  try {
    await createBusiness({
      niche: 'barber', businessName: 'X', ownerName: 'Y',
      phone: '+374 77 111 222', pin: '0000',
    });
  } catch {
    phoneBlocked = true;
  }
  check('один телефон = один аккаунт', phoneBlocked);

  /* ---------- расчёт с сотрудником ---------- */
  const { payouts } = await import('../lib/db/schema');

  const due1 = await q.getUnsettledPayroll(tenant.id);
  const washerDue = due1.find((r) => r.staffId === washer.id);
  // 5 000 + 3 000 по 40%; третья запись выше была отменена и в долг не идёт
  check('к выплате = заработанное без отменённых', washerDue?.earned === 3200, washerDue?.earned);

  const settledAt = new Date();
  await db.insert(payouts).values({
    tenantId: tenant.id,
    staffId: washer.id,
    periodFrom: new Date(0),
    periodTo: settledAt,
    amount: washerDue!.earned,
    paidBy: owner.id,
  });

  const due2 = await q.getUnsettledPayroll(tenant.id);
  check(
    'после расчёта долг обнулился',
    !due2.find((r) => r.staffId === washer.id),
    due2.find((r) => r.staffId === washer.id)?.earned,
  );

  // новая работа после расчёта — в долг попадает только она,
  // старое второй раз не выплачивается
  await new Promise((r) => setTimeout(r, 10));
  const afterPayout = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: body.id,
    clientKey: '90 QR 118', payment: 'card',
  });
  const due3 = await q.getUnsettledPayroll(tenant.id);
  const washerDue3 = due3.find((r) => r.staffId === washer.id);
  // процент мойщика к этому моменту уже 90%: 3000 × 90% = 2700
  check('в долг попала только новая работа', washerDue3?.earned === 2700, washerDue3?.earned);
  check('и только одна запись', washerDue3?.count === 1, washerDue3?.count);

  check('история выплат сохранена', (await q.listPayouts(tenant.id)).length === 1);

  /* ---------- права на отмену ---------- */
  let foreignBlocked = false;
  try {
    await cancelOrder({
      tenantId: tenant.id,
      orderId: afterPayout.order.id,
      byUserId: owner.id,
      onlyOwnedBy: owner.id, // владелец притворяется сотрудником: чужая запись
    });
  } catch {
    foreignBlocked = true;
  }
  check('сотрудник не может отменить чужую запись', foreignBlocked);

  const ownCancel = await cancelOrder({
    tenantId: tenant.id,
    orderId: afterPayout.order.id,
    byUserId: washer.id,
    onlyOwnedBy: washer.id,
  });
  check('свою запись отменить можно', !!ownCancel);
  check(
    'отменённая работа выпала из долга',
    !(await q.getUnsettledPayroll(tenant.id)).find((r) => r.staffId === washer.id),
  );

  /* ---------- призрак оживает ---------- */
  // строку клиента мы не удаляли, поэтому вернувшийся начнёт не с нуля
  await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: body.id,
    clientKey: '07 XY 991', payment: 'cash',
  });
  const revived = await q.findClient(tenant.id, '07 XY 991');
  check('вернувшийся клиент снова виден', revived?.visits === 1, revived?.visits);

  /* ---------- абонементы ---------- */
  const { sellPass, listActivePasses } = await import('../lib/passes');

  const statsBeforePass = await q.getPeriodStats(tenant.id, today);
  const dueBeforePass =
    (await q.getUnsettledPayroll(tenant.id)).find((r) => r.staffId === washer.id)?.earned ?? 0;

  const { pass, client: passClient } = await sellPass({
    tenantId: tenant.id,
    soldBy: owner.id,
    clientKey: '66 uv 302',
    serviceId: complex.id,
    totalUses: 10,
    price: 40000,
    validDays: 30,
  });
  check('номинал одной мойки посчитан', pass.unitPrice === 4000, pass.unitPrice);

  const active = await listActivePasses(tenant.id, passClient.id);
  check('абонемент виден у клиента', active.length === 1, active.length);
  check('остаток 10', active[0]?.totalUses - active[0]?.usedUses === 10);

  const afterSale = await q.getPeriodStats(tenant.id, today);
  check(
    'продажа абонемента — это приход денег',
    afterSale.revenue === statsBeforePass.revenue + 40000,
    afterSale.revenue - statsBeforePass.revenue,
  );
  check('и видна отдельной строкой', afterSale.passSales === 40000, afterSale.passSales);
  check('но машин от продажи не прибавилось', afterSale.count === statsBeforePass.count);

  const usedOrder = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '66 UV 302', payment: 'pass', passId: pass.id,
  });
  check(
    'списание берёт номинал абонемента, а не цену прайса',
    usedOrder.order.price === 4000,
    usedOrder.order.price,
  );

  const afterUse = await q.getPeriodStats(tenant.id, today);
  check(
    'списание НЕ посчитало те же деньги второй раз',
    afterUse.revenue === afterSale.revenue,
    afterUse.revenue - afterSale.revenue,
  );
  check('но машина посчитана', afterUse.count === afterSale.count + 1);
  check('и помечена как по абонементу', afterUse.passUses === 1, afterUse.passUses);

  // мойщик машину помыл — процент ему полагается, хоть выручки и не было
  const dueAfterPass =
    (await q.getUnsettledPayroll(tenant.id)).find((r) => r.staffId === washer.id)?.earned ?? 0;
  check(
    'мойщик получил процент от номинала',
    dueAfterPass - dueBeforePass === 3600, // 4 000 × 90%
    dueAfterPass - dueBeforePass,
  );

  let wrongClient = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
      clientKey: '12 AB 345', payment: 'pass', passId: pass.id,
    });
  } catch {
    wrongClient = true;
  }
  check('чужим абонементом не расплатиться', wrongClient);

  await cancelOrder({
    tenantId: tenant.id, orderId: usedOrder.order.id, byUserId: owner.id,
  });
  const passAfterCancel = await listActivePasses(tenant.id, passClient.id);
  check(
    'отмена вернула мойку в абонемент',
    passAfterCancel[0]?.usedUses === 0,
    passAfterCancel[0]?.usedUses,
  );

  // исчерпание
  const small = await sellPass({
    tenantId: tenant.id, soldBy: owner.id, clientKey: '15 WZ 450',
    serviceId: complex.id, totalUses: 1, price: 5000,
  });
  await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '15 WZ 450', payment: 'pass', passId: small.pass.id,
  });
  let exhausted = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
      clientKey: '15 WZ 450', payment: 'pass', passId: small.pass.id,
    });
  } catch {
    exhausted = true;
  }
  check('исчерпанный абонемент не списывается', exhausted);
  check(
    'и пропадает из активных',
    (await listActivePasses(tenant.id, small.client.id)).length === 0,
  );

  /* ---------- досылка из офлайна ---------- */
  // телефон не дождался ответа и отправил ту же запись ещё раз:
  // это не вторая машина, а та же самая
  const beforeResend = await q.getPeriodStats(tenant.id, today);
  const ref = 'ref-test-0001';

  const first = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '21 MN 604', payment: 'cash', clientRef: ref,
  });
  const again = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: complex.id,
    clientKey: '21 MN 604', payment: 'cash', clientRef: ref,
  });

  check('повтор вернул ту же запись', again.order.id === first.order.id);
  check('и пометил себя дублем', again.duplicate === true);

  const afterResend = await q.getPeriodStats(tenant.id, today);
  check(
    'машина посчитана один раз',
    afterResend.count === beforeResend.count + 1,
    afterResend.count - beforeResend.count,
  );
  check(
    'и деньги тоже один раз',
    // берём цену из самой записи: прайс по ходу теста уже менялся
    afterResend.revenue === beforeResend.revenue + first.order.price,
    afterResend.revenue - beforeResend.revenue,
  );
  check(
    'счётчик клиента не удвоился',
    (await q.findClient(tenant.id, '21 MN 604'))?.visits === 1,
    (await q.findClient(tenant.id, '21 MN 604'))?.visits,
  );

  /* ---------- архив услуг и сотрудников ---------- */
  // ни то, ни другое не удаляется: на них ссылаются прошлые записи,
  // а история выручки и зарплат обязана остаться целой
  const statsBefore = await q.getPeriodStats(tenant.id, today);

  await db.update(services).set({ active: false }).where(eq(services.id, body.id));
  check(
    'убранная услуга исчезла из выбора',
    !(await q.listServices(tenant.id)).some((s) => s.id === body.id),
  );
  check(
    'но записи с ней остались в отчётах',
    (await q.getPeriodStats(tenant.id, today)).revenue === statsBefore.revenue,
  );

  await db.update(users).set({ active: false }).where(eq(users.id, washer.id));
  check(
    'уволенный исчез из списка сотрудников',
    !(await q.listStaff(tenant.id)).some((u) => u.id === washer.id),
  );
  check(
    'но его работа осталась в выручке',
    (await q.getPeriodStats(tenant.id, today)).revenue === statsBefore.revenue,
  );

  /* ---------- подписка ---------- */
  const { accessOf } = await import('../lib/subscription');
  const day = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * day);

  const onTrial = accessOf({ plan: 'trial', trialEndsAt: inDays(14), paidUntil: null });
  check('на триале можно работать', onTrial.canWrite && onTrial.state === 'trial');
  check('и видно, сколько осталось', onTrial.daysLeft === 14, onTrial.daysLeft);

  const lastDay = accessOf({ plan: 'trial', trialEndsAt: inDays(0.5), paidUntil: null });
  check('последний день ещё считается днём', lastDay.daysLeft === 1, lastDay.daysLeft);
  check('и работать в него можно', lastDay.canWrite);

  const over = accessOf({ plan: 'trial', trialEndsAt: inDays(-1), paidUntil: null });
  check('после триала запись закрыта', !over.canWrite && over.state === 'expired');

  const paid = accessOf({ plan: 'active', trialEndsAt: inDays(-30), paidUntil: inDays(60) });
  check('оплата важнее истёкшего триала', paid.canWrite && paid.state === 'active');
  check('о скором конце не предупреждаем зря', !paid.warn);

  const endingSoon = accessOf({ plan: 'active', trialEndsAt: null, paidUntil: inDays(3) });
  check('но за несколько дней — предупреждаем', endingSoon.warn && endingSoon.canWrite);

  const lapsed = accessOf({ plan: 'active', trialEndsAt: null, paidUntil: inDays(-1) });
  check('просроченная оплата закрывает запись', !lapsed.canWrite);

  // просрочка мягкая: чтение и выгрузка остаются доступны
  check('просрочка не закрывает чтение', over.canRead);
  check(
    'и отчёты продолжают открываться',
    (await q.getPeriodStats(tenant.id, today)).count > 0,
  );

  // отключение вручную — другое дело: внутрь не пускаем совсем
  const shutOff = accessOf({ plan: 'blocked', trialEndsAt: inDays(30), paidUntil: inDays(30) });
  check('отключённый не читает', !shutOff.canRead);
  check('и не пишет', !shutOff.canWrite);
  check('отключение важнее действующей оплаты', shutOff.state === 'blocked', shutOff.state);

  /* ---------- выключенный биллинг ---------- */
  // пока платящих нет, счётчик триала только мешает: он выключил бы
  // собственную демонстрацию посреди разговора с мойкой
  const { currentAccess, billingEnabled } = await import('../lib/subscription');
  check('биллинг по умолчанию выключен', !billingEnabled());

  const expiredButOpen = currentAccess({
    plan: 'trial',
    trialEndsAt: inDays(-100),
    paidUntil: null,
  });
  check('просроченный триал никого не блокирует', expiredButOpen.canWrite);
  check('и не показывает плашку', !expiredButOpen.warn);

  // а ручное отключение работает всегда: это не про оплату
  const stillBlocked = currentAccess({
    plan: 'blocked',
    trialEndsAt: inDays(100),
    paidUntil: inDays(100),
  });
  check('ручное отключение действует и без биллинга', !stillBlocked.canRead);

  /* ---------- список для админки ---------- */
  const all = await q.listTenantsForAdmin();
  check('админка видит оба бизнеса', all.length === 2, all.length);
  const carwashRow = all.find((t) => t.id === tenant.id);
  check('владелец подтянут', carwashRow?.ownerPhone === '+37477111222', carwashRow?.ownerPhone);
  check('записи посчитаны', (carwashRow?.orderCount ?? 0) > 0, carwashRow?.orderCount);
  check(
    'у пустого бизнеса ноль записей',
    all.find((t) => t.id === second.tenant.id)?.orderCount === 0,
  );

  /* ---------- формат денег ---------- */
  /* Формат обязан совпадать на сервере и в браузере: Intl для hy-AM давал
     «5 000» в Node и «5,000» в Chrome, на одном экране жили оба.
     Разделитель задан escape-последовательностью — глазами его не отличить. */
  const S = ' ';
  check('тысячи разделяются', formatMoney(5000, 'AMD') === `5${S}000${S}֏`, formatMoney(5000));
  check('миллионы разделяются', formatMoney(1234567, 'AMD') === `1${S}234${S}567${S}֏`);
  check('малые суммы без разделителя', formatMoney(999, 'AMD') === `999${S}֏`);
  check('ноль показывается', formatMoney(0, 'AMD') === `0${S}֏`);
  check(
    'копейки не теряются',
    formatMoney(123456, 'EUR') === `1${S}234,56${S}€`,
    formatMoney(123456, 'EUR'),
  );

  console.log(`\nвыручка форматируется как: ${formatMoney(stats.revenue, tenant.currency)}`);
  console.log(failed === 0 ? '\nвсе проверки пройдены\n' : `\n${failed} провалено\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
