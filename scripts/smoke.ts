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
  const { tenants: tenantsTable, orders: ordersTable } = await import('../lib/db/schema');
  const rejects = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch { return true; }
  };
  const { hashPin } = await import('../lib/pin');
  const q = await import('../lib/queries');
  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { formatMoney } = await import('../lib/money');
  const { TRIAL_DAYS } = await import('../lib/plan');

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
  // не просто «дата есть»: срок обещан на лендинге, и разъехаться он не должен
  const trialDays = tenant.trialEndsAt
    ? Math.round((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000)
    : 0;
  check(`триал на ${TRIAL_DAYS} дней`, trialDays === TRIAL_DAYS, trialDays);

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

  /* Просрочка закрывает доступ целиком, а не только запись. Мягкая
     блокировка выглядела невнятно: продукт говорил «срок вышел» и при
     этом пускал ходить по разделам. Данные при этом целы — забрать их
     можно всегда, это проверяется ниже на живых эндпоинтах. */
  check('просрочка закрывает и чтение', !over.canRead);
  check(
    'но сами данные на месте',
    (await q.getPeriodStats(tenant.id, today)).count > 0,
  );

  // отключение вручную — другое дело: внутрь не пускаем совсем
  const shutOff = accessOf({ plan: 'blocked', trialEndsAt: inDays(30), paidUntil: inDays(30) });
  check('отключённый не читает', !shutOff.canRead);
  check('и не пишет', !shutOff.canWrite);
  check('отключение важнее действующей оплаты', shutOff.state === 'blocked', shutOff.state);

  /* ---------- переключатели ---------- */
  const { currentAccess, billingEnabled } = await import('../lib/subscription');
  const { passesEnabled } = await import('../lib/features');

  check('оплата продукта включена по умолчанию', billingEnabled());
  check('абонементы клиентов по умолчанию спрятаны', !passesEnabled());

  // при включённой оплате просрочка закрывает запись
  const expiredNow = currentAccess({
    plan: 'trial',
    trialEndsAt: inDays(-100),
    paidUntil: null,
  });
  check('просроченный триал закрывает запись', !expiredNow.canWrite);
  check('и чтение тоже', !expiredNow.canRead);

  // ручное отключение действует независимо от оплаты
  const stillBlocked = currentAccess({
    plan: 'blocked',
    trialEndsAt: inDays(100),
    paidUntil: inDays(100),
  });
  check('ручное отключение сильнее действующей оплаты', !stillBlocked.canRead);

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

  /* ---------- защита входа от перебора ---------- */

  const guard = await import('../lib/login-guard');
  const attacked = '+37477999888';

  check('чистый номер пускают', (await guard.checkLogin(attacked, '1.2.3.4')).allowed);

  // четыре промаха — ещё по-человечески: столько опечаток делают
  for (let i = 0; i < 4; i++) await guard.noteLogin(attacked, '1.2.3.4', false);
  check(
    'четыре неудачи ещё не блокируют',
    (await guard.checkLogin(attacked, '1.2.3.4')).allowed,
    await guard.failCount(attacked),
  );

  await guard.noteLogin(attacked, '1.2.3.4', false);
  const locked = await guard.checkLogin(attacked, '1.2.3.4');
  check('пятая закрывает вход', !locked.allowed);
  check(
    'и говорит, сколько ждать',
    !locked.allowed && locked.retryAfter > 0 && locked.retryAfter <= 60,
    locked,
  );

  // перебор идёт с одного адреса по чужому номеру — номер тут ни при чём
  check('чужой номер с того же адреса ещё пускают', (await guard.checkLogin('+37477000111', '1.2.3.4')).allowed);

  await guard.noteLogin(attacked, '1.2.3.4', true);
  check('удачный вход обнуляет счётчик', (await guard.checkLogin(attacked, '1.2.3.4')).allowed);
  check('и стирает прошлые неудачи', (await guard.failCount(attacked)) === 0);

  /* ---------- отзыв сессии ---------- */

  const { sessions, accounts: accountsTable } = await import('../lib/db/schema');
  const auth = await import('../lib/auth');

  /* Человек и его участие — разные строки. Проверки ниже про это и есть:
     что гасится у участия, а что у человека. */
  const [ownerRow] = await db.select().from(users).where(eq(users.id, owner.id));
  check('у владельца есть человек', !!ownerRow.accountId, ownerRow.accountId);
  const ownerAccountId = ownerRow.accountId!;
  const [ownerAccount] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, ownerAccountId));
  check('код лежит у человека', ownerAccount.pinHash === ownerRow.pinHash);
  check('и телефон тот же', ownerAccount.phone === ownerRow.phone, ownerAccount.phone);

  /* Участие без человека — состояние, которое оставлял старый код в
     окне между выкатом схемы и выкатом кода. Чинится оно на лету, но
     только если номер свободен: рядом может лежать другой человек с тем
     же номером и своим кодом, и усыновление сделало бы ЕГО код кодом
     входа сюда. Раньше это было безопасно из-за users_phone_uniq —
     индекса больше нет, значит и гарантии нет. */
  const { claimAccount, accountOf } = await import('../lib/accounts');
  const { hashPin: hp, verifyPin: vp } = await import('../lib/pin');

  const freePhone = '+37477000778';
  const [lonely] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      phone: freePhone,
      pinHash: await hp('1234'),
      name: 'Ничей',
      role: 'staff',
      percent: 10,
    })
    .returning();
  const healed = await accountOf(lonely);
  check('участие без человека чинится', healed.phone === freePhone);
  check('и чинится СВОИМ кодом', await vp('1234', healed.pinHash));
  const [linked] = await db.select().from(users).where(eq(users.id, lonely.id));
  check('привязка записана', linked.accountId === healed.id);
  await db.delete(users).where(eq(users.id, lonely.id));
  await db.delete(accountsTable).where(eq(accountsTable.id, healed.id));

  // а вот занятый чужим человеком номер усыновлять нельзя
  const strayPhone = '+37477000777';
  const stray = await claimAccount({ phone: strayPhone, pinHash: await hp('8888') });
  const [orphaned] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      phone: strayPhone,
      pinHash: await hp('1234'),
      name: 'Тёзка',
      role: 'staff',
      percent: 10,
    })
    .returning();
  let conflict = '';
  await accountOf(orphaned).catch((e) => {
    conflict = (e as Error).message;
  });
  check('чужого человека не усыновляют', conflict.startsWith('ACCOUNT_CONFLICT'), conflict);
  const [untouchedStray] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, stray.id));
  check('и его код цел', await vp('8888', untouchedStray.pinHash));
  await db.delete(users).where(eq(users.id, orphaned.id));
  await db.delete(accountsTable).where(eq(accountsTable.id, stray.id));

  /* Занятый номер отвергается индексом, а не чтением перед вставкой:
     между чтением и вставкой помещается вторая такая же регистрация, и
     первая версия кода в этом окне переписывала чужой код своим. */
  let raced = false;
  await claimAccount({ phone: ownerRow.phone, pinHash: await hp('0000') }).catch(() => {
    raced = true;
  });
  check('занятый номер человеком не перехватывается', raced);
  const [untouched] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, ownerAccountId));
  check('и код прежнего владельца цел', untouched.pinHash === ownerAccount.pinHash);

  /* ---------- точки человека ---------- */

  const { listPoints } = await import('../lib/accounts');
  const { tenants: tenantsTbl } = await import('../lib/db/schema');

  const one = await listPoints(ownerAccountId);
  check('у владельца одной мойки одна точка', one.length === 1, one.length);
  check('и она его', one[0].id === tenant.id && one[0].role === 'owner');

  // вторая точка того же человека: то, ради чего всё и затевалось
  const [away] = await db
    .insert(users)
    .values({
      tenantId: second.tenant.id,
      accountId: ownerAccountId,
      phone: ownerRow.phone,
      pinHash: ownerRow.pinHash,
      name: ownerRow.name,
      role: 'staff',
      percent: 20,
    })
    .returning();

  const two = await listPoints(ownerAccountId);
  check('две мойки — две точки', two.length === 2, two.length);
  check(
    'роль у каждой своя',
    two.find((p) => p.id === tenant.id)?.role === 'owner' &&
      two.find((p) => p.id === second.tenant.id)?.role === 'staff',
  );

  /* Открытая мойка идёт первой. Иначе владельца с неоплаченной второй
     точкой после входа высаживало бы на стену при работающей первой. */
  await db
    .update(tenantsTbl)
    .set({ plan: 'blocked' })
    .where(eq(tenantsTbl.id, second.tenant.id));
  const ordered = await listPoints(ownerAccountId);
  check('закрытая точка уходит вниз', ordered[0].id === tenant.id, ordered[0].name);
  check('и видно, что она закрыта', ordered[1].canRead === false && ordered[1].state === 'blocked');
  await db
    .update(tenantsTbl)
    .set({ plan: 'trial' })
    .where(eq(tenantsTbl.id, second.tenant.id));

  // уволенное участие из списка пропадает: показывать его незачем
  await db.update(users).set({ active: false }).where(eq(users.id, away.id));
  check('уволенная точка не показывается', (await listPoints(ownerAccountId)).length === 1);

  await db.delete(users).where(eq(users.id, away.id));

  const [live] = await db
    .insert(sessions)
    .values({ tenantId: tenant.id, userId: owner.id, kind: 'app', device: 'iPhone' })
    .returning();

  const claims = { uid: owner.id, tid: tenant.id, role: 'owner' as const, sid: live.id, ver: 0 };
  check('свежая сессия жива', await auth.sessionAlive(claims));

  await auth.revokeSession(live.id);
  check('отозванная — мертва сразу', !(await auth.sessionAlive(claims)));

  // «выйти везде»: поколение сдвигается, и старые токены отпадают все разом
  const [other] = await db
    .insert(sessions)
    .values({ tenantId: tenant.id, userId: owner.id, kind: 'app', device: 'iPad' })
    .returning();
  const otherClaims = { ...claims, sid: other.id };
  check('второе устройство пока живо', await auth.sessionAlive(otherClaims));

  /* Увольнение на точке гасит сессии этого участия и НЕ трогает
     поколение: человек может работать на второй мойке, и оттуда его
     никто не выгонял. */
  const [onPoint] = await db
    .insert(sessions)
    .values({ tenantId: tenant.id, userId: owner.id, kind: 'app', device: 'iPad mini' })
    .returning();
  await auth.revokeMembershipSessions(owner.id);
  check(
    'увольнение гасит сессии участия',
    !(await auth.sessionAlive({ ...claims, sid: onPoint.id })),
  );
  const [notBumped] = await db
    .select({ ver: accountsTable.tokenVersion })
    .from(accountsTable)
    .where(eq(accountsTable.id, ownerAccountId));
  check('но поколение человека не двигает', notBumped.ver === 0, notBumped.ver);

  // «выйти везде»: поколение сдвигается, и старые токены отпадают все разом
  await auth.revokeAccountSessions(ownerAccountId);
  check('выход везде гасит и его', !(await auth.sessionAlive(otherClaims)));

  const [bumped] = await db
    .select({ ver: accountsTable.tokenVersion })
    .from(accountsTable)
    .where(eq(accountsTable.id, ownerAccountId));
  check('поколение сессий сдвинулось у человека', bumped.ver === 1, bumped.ver);
  const [legacyVer] = await db
    .select({ ver: users.tokenVersion })
    .from(users)
    .where(eq(users.id, owner.id));
  check('и в копии для старого кода тоже', legacyVer.ver === 1, legacyVer.ver);

  /* ---------- API v1 ---------- */

  // обработчики — обычные функции от Request, сервер для проверки не нужен
  const login = (await import('../app/api/v1/auth/login/route')).POST;
  const refreshRoute = (await import('../app/api/v1/auth/refresh/route')).POST;
  const bootstrap = (await import('../app/api/v1/bootstrap/route')).GET;
  const postOrder = (await import('../app/api/v1/orders/route')).POST;
  const shiftRoute = (await import('../app/api/v1/shift/route')).GET;
  const summary = (await import('../app/api/v1/summary/route')).GET;

  const post = (url: string, json: unknown, token?: string) =>
    new Request(`http://t${url}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(json),
    });
  const get = (url: string, token?: string) =>
    new Request(`http://t${url}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const del = (url: string, json: unknown, token?: string) =>
    new Request(`http://t${url}`, {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(json),
    });

  // владелец бизнеса №1 заводился с PIN 1234
  const bad = await login(post('/login', { phone: '077 111 222', pin: '9999' }));
  check('неверный PIN — 401', bad.status === 401, bad.status);
  check('и код, а не текст', (await bad.json()).error === 'WRONG_CREDENTIALS');

  const good = await login(
    post('/login', { phone: '077 111 222', pin: '1234', device: 'iPhone 13' }),
  );
  check('верный PIN — 200', good.status === 200, good.status);
  const tokens = await good.json();
  check('выдан access', typeof tokens.access === 'string' && tokens.access.length > 20);
  check('выдан refresh', typeof tokens.refresh === 'string' && tokens.refresh.includes('.'));

  const noAuth = await bootstrap(get('/bootstrap'));
  check('без токена — 401', noAuth.status === 401, noAuth.status);

  const boot = await bootstrap(get('/bootstrap', tokens.access));
  check('с токеном — 200', boot.status === 200, boot.status);

  /* Токен, где точка не та, в которой человек состоит. Подписан нами,
     не просрочен, сессия жива — и всё равно отказ. Без этой проверки
     токен, выписанный на одну мойку, открывал бы соседнюю: сегодня
     мойка у человека одна и разницы нет, с двумя это дыра. */
  const [probe] = await db
    .insert(sessions)
    .values({ tenantId: tenant.id, userId: owner.id, kind: 'app', device: 'подмена' })
    .returning();
  const [ver] = await db
    .select({ n: accountsTable.tokenVersion })
    .from(accountsTable)
    .where(eq(accountsTable.id, ownerAccountId));

  // сессия живая и поколение верное — единственное, что не так, это точка
  const honest = await auth.signAccess(
    { uid: owner.id, tid: tenant.id, role: 'owner', sid: probe.id, ver: ver.n },
    '15m',
  );
  check('свежая сессия сама по себе работает', (await bootstrap(get('/bootstrap', honest))).status === 200);

  const wrongPoint = await auth.signAccess(
    { uid: owner.id, tid: second.tenant.id, role: 'owner', sid: probe.id, ver: ver.n },
    '15m',
  );
  const trespass = await bootstrap(get('/bootstrap', wrongPoint));
  check('но с чужой точкой — 401', trespass.status === 401, trespass.status);
  const b = await boot.json();
  check('термины бизнеса пришли', b.tenant.clientIdType === 'plate', b.tenant.clientIdType);
  // сверяем с базой, а не с числом: выше по скрипту одну услугу убрали
  // из прайса, и захардкоженная пятёрка проверяла бы не то
  check(
    'услуги пришли и только действующие',
    b.services.length === (await q.listServices(tenant.id)).length,
    b.services.length,
  );
  check('роль пришла', b.me.role === 'owner', b.me.role);

  // ротация: старый refresh после обмена умирает
  const rot = await refreshRoute(post('/refresh', { refresh: tokens.refresh }));
  check('refresh меняется на новую пару', rot.status === 200, rot.status);
  let rotated = await rot.json();
  check('и сам refresh новый', rotated.refresh !== tokens.refresh);
  const reused = await refreshRoute(post('/refresh', { refresh: tokens.refresh }));
  check('старый refresh больше не работает', reused.status === 401, reused.status);

  // подделанный токен — отказ, а не 500: кривой uuid Postgres роняет
  // на разборе, и клиенту это неотличимо от поломки сервера
  const junk = await refreshRoute(post('/refresh', { refresh: 'aaa.bbb' }));
  check('мусорный refresh — 401, а не 500', junk.status === 401, junk.status);
  const noDot = await refreshRoute(post('/refresh', { refresh: 'вообще-не-токен' }));
  check('и токен без разделителя тоже', noDot.status === 401, noDot.status);

  /* Выход гасит сессию тому, кто предъявил токен, а не тому, кто назвал
     её номер. Номер сессии не секрет: он лежит в токене открытым текстом
     до точки и виден в списке устройств. Без сверки секрета знание
     номера гасило бы чужую сессию. */
  const logoutRoute = (await import('../app/api/v1/auth/logout/route')).POST;
  const sid = rotated.refresh.slice(0, rotated.refresh.indexOf('.'));

  const forged = await logoutRoute(post('/logout', { refresh: `${sid}.не-тот-секрет` }));
  check('выход по чужому номеру отвечает 204', forged.status === 204, forged.status);
  const stillAlive = await refreshRoute(post('/refresh', { refresh: rotated.refresh }));
  check('но сессию не гасит', stillAlive.status === 200, stillAlive.status);
  rotated = await stillAlive.json();

  const bye = await logoutRoute(post('/logout', { refresh: rotated.refresh }));
  check('свой токен выход принимает', bye.status === 204, bye.status);
  const afterBye = await refreshRoute(post('/refresh', { refresh: rotated.refresh }));
  check('и сессия умирает', afterBye.status === 401, afterBye.status);

  // входим заново: дальше по файлу нужна живая пара
  const backIn = await login(post('/login', { phone: '077 111 222', pin: '1234' }));
  check('после выхода можно войти снова', backIn.status === 200, backIn.status);
  rotated = await backIn.json();

  /* Идемпотентность записи — то, на чём держится офлайн-очередь. */

  /* Сначала встаём на смену: вне её сервер записывать не даёт, и без
     этой строки все проверки ниже упирались бы в 409. */
  const shiftState0 = await import('../lib/shifts');
  await shiftState0.openShift(tenant.id, owner.id, q.startOfDay(tenant.timezone));

  const someService = b.services[0].id;
  const apiRef = "test-ref-0001";
  const noToken = await postOrder(
    post("/orders", { ref: apiRef, clientKey: '55 OO 555', serviceId: someService, payment: 'cash' }),
    // токен из ротации: старый access ещё жив, но пользуемся свежим
  );
  check("запись без токена — 401", noToken.status === 401, noToken.status);

  const created = await postOrder(
    post(
      '/orders',
      { ref: apiRef, clientKey: "55 OO 555", serviceId: someService, payment: "cash" },
      rotated.access,
    ),
  );
  check('первая отправка — 201', created.status === 201, created.status);

  const repeat = await postOrder(
    post(
      '/orders',
      { ref: apiRef, clientKey: "55 OO 555", serviceId: someService, payment: "cash" },
      rotated.access,
    ),
  );
  const repeatBody = await repeat.json();
  check('повторная досылка — 200, а не ошибка', repeat.status === 200, repeat.status);
  check('и помечена как дубль', repeatBody.duplicate === true);

  const sh = await shiftRoute(get('/shift', rotated.access));
  const shiftBody = await sh.json();
  check('в смене одна машина, а не две', shiftBody.count === 1, shiftBody.count);

  const sum = await summary(get('/summary?period=today', rotated.access));
  check('сводка владельца открыта', sum.status === 200, sum.status);

  /* Простой в графике.
     Postgres возвращает только те часы, в которые что-то было, и три
     машины в 9, 14 и 19 вставали тремя соседними столбиками: день
     выглядел сплошь загруженным, а пятичасовая дыра исчезала. */
  /* Простой в графике проверяем на самой функции, а не через живые часы.
     Она достраивает пустые промежутки: три машины в 9, 14 и 19 без этого
     вставали тремя соседними столбиками, и пятичасовая дыра исчезала.

     Через реальные записи это уже проверялось и падало сразу после
     местной полуночи: девять утра и два часа дня оказывались в будущем,
     а будущее график справедливо не рисует. */
  const { padSeries } = await import('../app/api/v1/summary/route');
  const dayFrom = new Date('2026-08-01T00:00:00+04:00');
  const filled = padSeries(
    [
      { key: '2026-08-01 09', revenue: 5000, count: 1 },
      { key: '2026-08-01 14', revenue: 3000, count: 1 },
    ],
    true,
    'Asia/Yerevan',
    dayFrom,
    new Date(dayFrom.getTime() + 86_400_000),
    new Date(dayFrom.getTime() + 20 * 3_600_000),
  );
  const hours = filled.map((p) => p.key.slice(11));
  check('график начинается с первой машины, а не с полуночи', hours[0] === '09', hours[0]);
  check('и в нём видна дыра между 9 и 14', hours.includes('11'), hours.join(' '));
  check(
    'пустой час пустой, а не выдуманный',
    filled.find((p) => p.key.endsWith('11'))?.revenue === 0,
  );
  check('будущее не рисуется', hours[hours.length - 1] === '20', hours[hours.length - 1]);

  // уволенного не пускают: выше по скрипту мойщику сняли active
  const fired = await login(post('/login', { phone: '077 333 444', pin: '5678' }));
  check('уволенный сотрудник не входит', fired.status === 401, fired.status);

  // сотрудник в кабинет владельца не ходит
  await db.insert(users).values({
    tenantId: tenant.id,
    phone: '+37477555666',
    pinHash: await hashPin('2468'),
    name: 'Գագիկ',
    role: 'staff',
    percent: 35,
  });

  const staffLogin = await login(post('/login', { phone: '077 555 666', pin: '2468' }));
  check('действующий сотрудник входит', staffLogin.status === 200, staffLogin.status);
  const staffTokens = await staffLogin.json();

  const forbidden = await summary(get('/summary?period=today', staffTokens.access));
  check('но сводку владельца ему не дают', forbidden.status === 403, forbidden.status);

  const ownShift = await shiftRoute(get('/shift', staffTokens.access));
  check('а свою смену — дают', ownShift.status === 200, ownShift.status);

  /* ---------- регистрация из приложения ---------- */

  const nichesRoute = (await import('../app/api/v1/niches/route')).GET;
  const registerRoute = (await import('../app/api/v1/auth/register/route')).POST;

  const nichesRes = nichesRoute();
  const nichesBody = await nichesRes.json();
  check('ниши отдаются без токена', nichesRes.status === 200, nichesRes.status);
  check(
    'и только включённые',
    nichesBody.niches.length > 0 && nichesBody.niches.every((n: { key: string }) => n.key),
    nichesBody.niches.length,
  );

  /* Значок для приложения — имя из SF Symbols. Неверное имя не роняет
     сборку: iOS рисует на его месте пустоту, и в карточке ниши остаётся
     дыра. Проверяем все ниши, а не только включённые: остальные включат
     позже, и молчаливая дыра всплывёт уже у живого клиента. */
  const { NICHE_LIST } = await import('../lib/niches');
  const naming = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
  const badSymbol = NICHE_LIST.filter((n) => !naming.test(n.symbol ?? ''));
  check('у каждой ниши есть символ SF Symbols', badSymbol.length === 0, badSymbol.map((n) => n.key));
  check(
    'и он доехал до приложения',
    nichesBody.niches.every((n: { symbol?: string }) => naming.test(n.symbol ?? '')),
    nichesBody.niches,
  );

  const born = await registerRoute(
    post('/register', {
      niche: nichesBody.niches[0].key,
      businessName: 'Նոր բիզնես',
      ownerName: 'Կարեն',
      phone: '077 654 321',
      pin: '9876',
      device: 'iPhone',
    }),
  );
  check('бизнес регистрируется из приложения', born.status === 201, born.status);
  const bornBody = await born.json();
  check('и сразу выдаются токены', typeof bornBody.access === 'string' && bornBody.refresh);
  check('владельцем', bornBody.user.role === 'owner', bornBody.user.role);

  // прайс засеян конфигом ниши — приложение сразу может записывать
  const bornBoot = await bootstrap(get('/bootstrap', bornBody.access));
  const bornData = await bornBoot.json();
  check('прайс засеян сразу', bornData.services.length > 0, bornData.services.length);
  check('термины ниши на месте', bornData.tenant.clientIdLabel.length > 0);

  const sameAgain = await registerRoute(
    post('/register', {
      niche: nichesBody.niches[0].key,
      businessName: 'Другой',
      ownerName: 'Другой',
      phone: '077 654 321',
      pin: '1111',
    }),
  );
  check('тот же телефон второй раз — отказ', sameAgain.status === 409, sameAgain.status);

  const offNiche = await registerRoute(
    post('/register', {
      niche: 'vet',
      businessName: 'Кто-то',
      ownerName: 'Кто-то',
      phone: '077 654 999',
      pin: '2222',
    }),
  );
  // ниша выключена флагом; эндпоинт открыт наружу, и прямым запросом
  // завести её тоже не должно получиться
  check('выключенную нишу не завести', offNiche.status === 400, offNiche.status);

  /* ---------- прайс и люди через API ---------- */

  const servicesRoute = await import('../app/api/v1/services/route');
  const staffRoute = await import('../app/api/v1/staff/route');
  const staffOne = await import('../app/api/v1/staff/[id]/route');

  const made = await servicesRoute.POST(
    post('/services', { name: 'Պոլիրովկա', price: 7000 }, rotated.access),
  );
  check('услуга заводится', made.status === 201, made.status);
  const newService = (await made.json()).service;

  const renamed = await servicesRoute.POST(
    post('/services', { id: newService.id, name: 'Պոլիրովկա XL', price: 9000 }, rotated.access),
  );
  check('и правится тем же методом', (await renamed.json()).service.price === 9000);

  const noName = await servicesRoute.POST(post('/services', { name: '  ' }, rotated.access));
  check('пустое имя не проходит', noName.status === 400, noName.status);

  const byStaff = await servicesRoute.POST(
    post('/services', { name: 'X', price: 1 }, staffTokens.access),
  );
  check('сотруднику прайс править нельзя', byStaff.status === 403, byStaff.status);

  const hired = await staffRoute.POST(
    post('/staff', { name: 'Վարդան', phone: '077 777 000', pin: '1357', percent: 45 }, rotated.access),
  );
  check('сотрудник заводится', hired.status === 201, hired.status);
  const hiredId = (await hired.json()).staff.id;

  const dup = await staffRoute.POST(
    post('/staff', { name: 'Другой', phone: '077 777 000', pin: '2468', percent: 10 }, rotated.access),
  );
  check('тот же телефон второй раз — отказ', dup.status === 409, dup.status);

  const badPercent = await staffOne.PATCH(
    post('/staff', { name: 'Վարդան', percent: 150 }, rotated.access),
    { params: Promise.resolve({ id: hiredId }) },
  );
  check('процент больше ста не принимают', badPercent.status === 400, badPercent.status);

  /* Уволенный теряет доступ СРАЗУ, а не через месяц. Раньше у него
     оставался живой токен на весь его срок — это и проверяем. */
  const hiredLogin = await login(post('/login', { phone: '077 777 000', pin: '1357' }));
  const hiredTokens = await hiredLogin.json();
  check('новый сотрудник входит', hiredLogin.status === 200, hiredLogin.status);

  const worksBefore = await shiftRoute(get('/shift', hiredTokens.access));
  check('и работает', worksBefore.status === 200, worksBefore.status);

  const fireRes = await staffOne.DELETE(get('/staff', rotated.access), {
    params: Promise.resolve({ id: hiredId }),
  });
  check('увольнение проходит', fireRes.status === 204, fireRes.status);

  const worksAfter = await shiftRoute(get('/shift', hiredTokens.access));
  check('уволенный отваливается тем же токеном', worksAfter.status === 401, worksAfter.status);

  const suicide = await staffOne.DELETE(get('/staff', rotated.access), {
    params: Promise.resolve({ id: owner.id }),
  });
  check('себя владелец уволить не может', suicide.status === 403, suicide.status);

  /* ---------- выгрузка ---------- */

  const exportRoute = await import('../app/api/v1/export/route');
  const csvRes = await exportRoute.GET(get('/export?days=30', rotated.access));
  check('выгрузка отдаётся', csvRes.status === 200, csvRes.status);

  // именно байты: Response.text() по спецификации срезает BOM при
  // декодировании, и проверка по строке всегда бы врала
  const bytes = new Uint8Array(await csvRes.clone().arrayBuffer());
  check(
    'с BOM — иначе Excel съест армянский',
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    [...bytes.slice(0, 3)],
  );

  const csv = await csvRes.text();
  check('и с точкой с запятой в разделителях', csv.split('\r\n')[0].includes(';'));

  const csvAll = await exportRoute.GET(get('/export?days=all', rotated.access));
  check('выгрузка за всё время отдаётся', csvAll.status === 200, csvAll.status);
  check(
    'и она не короче тридцатидневной',
    (await csvAll.text()).split('\r\n').length >= csv.split('\r\n').length,
  );

  /* Смену владельца, открытую ради проверок записи, закрываем: ниже
     начинается раздел «кто на мойке», и она бы там светилась. */
  await (await import('../lib/shifts')).closeShift(tenant.id, owner.id);

  /* ---------- смена: кто на мойке ---------- */

  const shiftState = await import('../lib/shifts');
  const shiftApi = await import('../app/api/v1/shift/route');

  const dayStart = q.startOfDay(tenant.timezone);

  check(
    'до переключателя на смене никого',
    (await shiftState.whoIsOnShift(tenant.id, dayStart)).length === 0,
  );

  const stood = await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));
  check('сотрудник встаёт на смену', stood.status === 200, stood.status);
  check('и это отражается в ответе', (await stood.json()).onShift === true);

  const present = await shiftState.whoIsOnShift(tenant.id, dayStart);
  check('владелец видит его на смене', present.length === 1, present.map((p) => p.name));

  /* Кнопку жмут дважды, и запрос приходит из очереди повторно —
     второй смены быть не должно. Это держит частичный уникальный
     индекс, но проверить надо: без него в списке задвоится человек. */
  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));
  check(
    'повторное нажатие не заводит вторую смену',
    (await shiftState.whoIsOnShift(tenant.id, dayStart)).length === 1,
  );

  const mine = await shiftApi.GET(get('/shift', staffTokens.access));
  check('в своей смене видно, что он встал', (await mine.json()).onShift === true);

  // изоляция: чужая смена не должна светиться в соседнем бизнесе
  check(
    'смена соседнего бизнеса не видна',
    (await shiftState.whoIsOnShift(second.tenant.id, dayStart)).length === 0,
  );

  /* Переключатель выключать забывают, и вечная зелёная точка перестала бы
     что-либо значить. Смена, открытая до начала сегодняшнего дня,
     закрывается сама. */
  const tomorrow = new Date(dayStart.getTime() + 86_400_000);
  check(
    'забытая вчерашняя смена гаснет сама',
    (await shiftState.whoIsOnShift(tenant.id, tomorrow)).length === 0,
  );

  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));
  const left = await shiftApi.POST(post('/shift', { open: false }, staffTokens.access));
  check('и уходит с неё сам', (await left.json()).onShift === false);
  check(
    'после ухода на смене пусто',
    (await shiftState.whoIsOnShift(tenant.id, dayStart)).length === 0,
  );

  /* ---------- вне смены записывать нельзя ---------- */

  /* Машина, записанная мимо смены, не попадает в сдачу наличных при
     закрытии: работник уносит деньги, ничего не нарушив, а владелец
     недосчитывается и не понимает почему.

     Берём человека, который сегодня на смену не вставал ни разу, —
     у остальных выше по скрипту смены уже были. */
  const ordersRoute = await import('../app/api/v1/orders/route');
  const [shiftService] = await (await import('../lib/queries')).listServices(tenant.id);

  const { addStaff: hire } = await import('../lib/catalog');
  const rookie = await hire({
    tenantId: tenant.id,
    name: 'Նորեկ',
    phone: '+37455000192',
    pin: '3355',
    percent: 30,
  });
  const rookieLogin = await login(post('/login', { phone: '+37455000192', pin: '3355' }));
  const rookieTokens = await rookieLogin.json();

  const offShift = await ordersRoute.POST(
    post(
      '/orders',
      { clientKey: '77 OF 001', serviceId: shiftService.id, payment: 'cash' },
      rookieTokens.access,
    ),
  );
  check('вне смены запись не принимается', offShift.status === 409, offShift.status);
  check('и причина названа', (await offShift.json()).error === 'SHIFT_REQUIRED');

  await shiftState.openShift(tenant.id, rookie.id, dayStart);
  const onShiftOrder = await ordersRoute.POST(
    post(
      '/orders',
      { clientKey: '77 ON 002', serviceId: shiftService.id, payment: 'cash' },
      rookieTokens.access,
    ),
  );
  check('на смене — принимается', onShiftOrder.status === 201, onShiftOrder.status);

  /* Послабление для очереди: телефон копит записи офлайн и досылает их,
     когда появится связь, — возможно, уже после того как смена закрылась
     сама в восемь вечера. Объявлять настоящую работу ошибкой нельзя. */
  await shiftState.closeShift(tenant.id, rookie.id);
  const lateSend = await ordersRoute.POST(
    post(
      '/orders',
      { clientKey: '77 LT 003', serviceId: shiftService.id, payment: 'cash' },
      rookieTokens.access,
    ),
  );
  check('досылка после закрытия смены проходит', lateSend.status === 201, lateSend.status);

  /* ---------- вечернее закрытие смен ---------- */

  const { closeEvening, CLOSING_HOUR } = await import('../lib/shifts');
  const { shifts: shiftTable } = await import('../lib/db/schema');

  const evening = (hour: number) =>
    new Date(q.startOfDay(tenant.timezone).getTime() + hour * 3_600_000);

  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));

  /* Отодвигаем начало смены в утро.
     Проверяем «встал утром и забыл выключить», а смена заводится текущим
     моментом — и после восьми вечера сценарий превращался в свою
     противоположность: ночную смену закрывать нельзя, и тест падал
     каждый раз, когда его запускали вечером. */
  await db
    .update(shiftTable)
    .set({ openedAt: evening(9) })
    .where(and(eq(shiftTable.tenantId, tenant.id), isNull(shiftTable.closedAt)));

  const tooEarly = await closeEvening(evening(CLOSING_HOUR - 1));
  check('до восьми вечера ничего не закрывается', tooEarly.shifts === 0, tooEarly);

  const atEight = await closeEvening(evening(CLOSING_HOUR));
  check('в восемь закрывается', atEight.shifts === 1, atEight);

  /* Ищем ровно ту смену, что подвинули в утро. «Последняя в бизнесе» не
     годится: выше по скрипту заводится и тут же закрывается смена
     уволенного, и она открыта позже — по этому порядку выбиралась она. */
  const [closedShift] = await db
    .select()
    .from(shiftTable)
    .where(and(eq(shiftTable.tenantId, tenant.id), eq(shiftTable.openedAt, evening(9))));
  check(
    'и закрывается временем 20:00, а не моментом запуска',
    closedShift.closedAt?.getTime() === evening(CLOSING_HOUR).getTime(),
    closedShift.closedAt?.toISOString(),
  );

  /* Повтор безвреден: cron перезапустится после сбоя и сходит второй раз,
     и владельцу не должно прийти второе «смена закрыта». */
  const twice = await closeEvening(evening(CLOSING_HOUR + 1));
  check('повторный заход ничего не находит', twice.shifts === 0, twice);

  /* Ночная смена — не забытый переключатель. Начатую после восьми не
     трогаем, иначе человека выкидывало бы через минуту после выхода. */
  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));
  await db
    .update(shiftTable)
    .set({ openedAt: evening(CLOSING_HOUR + 1) })
    .where(and(eq(shiftTable.tenantId, tenant.id), isNull(shiftTable.closedAt)));

  const night = await closeEvening(evening(CLOSING_HOUR + 2));
  check('начатую после восьми не трогаем', night.shifts === 0, night);

  // прибираем за собой: дальше по файлу смены проверяются заново
  await db
    .update(shiftTable)
    .set({ closedAt: new Date() })
    .where(and(eq(shiftTable.tenantId, tenant.id), isNull(shiftTable.closedAt)));

  /* ---------- несколько услуг в одной записи ---------- */

  const { orderItems } = await import('../lib/db/schema');
  const menu = await q.listServices(tenant.id);
  const kompleks = menu.find((s) => s.name === 'Կոմպլեքս')!;
  const chem = menu.find((s) => s.name === 'Քիմմաքրում')!;

  const beforeMulti = await q.getPeriodStats(tenant.id, today);

  const multi = await createOrder({
    tenantId: tenant.id, staffId: washer.id,
    serviceIds: [kompleks.id, chem.id],
    clientKey: '99 MULTI 1', payment: 'cash',
  });

  check(
    'цена записи — сумма услуг',
    multi.order.price === kompleks.price + chem.price,
    multi.order.price,
  );
  check(
    'название склеено в порядке выбора',
    multi.order.serviceName === `${kompleks.name} + ${chem.name}`,
    multi.order.serviceName,
  );

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, multi.order.id))
    .orderBy(sql`sort asc`);
  check('строк услуг две', items.length === 2, items.length);
  check('и порядок сохранён', items[0].serviceName === kompleks.name, items[0].serviceName);

  /* Ради этого всё и делалось: комплекс с химчисткой — ОДНА машина, а не
     две. Раньше врали и счётчик, и средний чек, и история клиента. */
  const afterMulti = await q.getPeriodStats(tenant.id, today);
  check(
    'это одна машина, а не две',
    afterMulti.count === beforeMulti.count + 1,
    [beforeMulti.count, afterMulti.count],
  );

  const multiClient = await q.findClient(tenant.id, '99 MULTI 1');
  check('и один визит у клиента', multiClient?.visits === 1, multiClient?.visits);
  check(
    'на всю сумму заезда',
    multiClient?.total === kompleks.price + chem.price,
    multiClient?.total,
  );

  // скидка живёт на счёте целиком, а не на строке
  const multiDisc = await createOrder({
    tenantId: tenant.id, staffId: washer.id,
    serviceIds: [kompleks.id, chem.id],
    clientKey: '99 MULTI 2', payment: 'cash',
    price: kompleks.price + chem.price - 2000,
  });
  check(
    'скидка считается от суммы всех услуг',
    multiDisc.order.price === kompleks.price + chem.price - 2000,
    multiDisc.order.price,
  );
  check(
    'а прайсовая осталась полной',
    multiDisc.order.listPrice === kompleks.price + chem.price,
    multiDisc.order.listPrice,
  );

  let alienService = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id,
      serviceIds: [kompleks.id, (await q.listServices(second.tenant.id))[0].id],
      clientKey: '99 MULTI 3', payment: 'cash',
    });
  } catch {
    alienService = true;
  }
  check('чужую услугу в список не подсунуть', alienService);

  let emptyList = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id, serviceIds: [],
      clientKey: '99 MULTI 4', payment: 'cash',
    });
  } catch {
    emptyList = true;
  }
  check('пустой список услуг не проходит', emptyList);

  /* Старая форма обязана работать: в очередях на телефонах со старой
     версией лежат записи с одной услугой. */
  const legacy = await postOrder(
    post(
      '/orders',
      { clientKey: '99 OLD 1', serviceId: kompleks.id, payment: 'cash' },
      staffTokens.access,
    ),
  );
  check('запись со старого телефона доезжает', legacy.status === 201, legacy.status);
  const legacyItems = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, (await legacy.json()).order.id));
  check('и у неё тоже появляется строка услуги', legacyItems.length === 1, legacyItems.length);

  const multiApi = await postOrder(
    post(
      '/orders',
      { clientKey: '99 NEW 1', serviceIds: [kompleks.id, chem.id], payment: 'card' },
      staffTokens.access,
    ),
  );
  check('через API список тоже принимается', multiApi.status === 201, multiApi.status);

  /* Разрез по услугам — то, чего не было вовсе: пока услуга была одна на
     запись, он считал бы то же самое враньё. */
  const breakdown = await q.getServiceBreakdown(tenant.id, today);
  const kompleksRow = breakdown.find((b) => b.name === kompleks.name);
  const chemRow = breakdown.find((b) => b.name === chem.name);
  check('в разрезе видно каждую услугу', !!kompleksRow && !!chemRow);
  check(
    'химчистку заказали трижды',
    chemRow?.count === 3,
    breakdown.map((b) => `${b.name}:${b.count}`),
  );

  /* ---------- скидки ---------- */

  const priceList = await q.listServices(tenant.id);
  const wash = priceList.find((s) => s.name === 'Սալոն')!;

  const beforeClient = await q.findClient(tenant.id, '77 DISC 1');
  check('клиента ещё нет', beforeClient === null);

  const discounted = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: wash.id,
    clientKey: '77 DISC 1', payment: 'cash', price: wash.price - 500,
  });
  check(
    'взята цена со скидкой',
    discounted.order.price === wash.price - 500,
    discounted.order.price,
  );
  check('прайсовая сохранена рядом', discounted.order.listPrice === wash.price);

  /* Итог клиента обязан расти на взятую сумму. Считался он до применения
     скидки и брал прайс — «всего оставил» врало бы в большую сторону. */
  const discClient = await q.findClient(tenant.id, '77 DISC 1');
  check(
    'история клиента выросла на взятую сумму, не на прайсовую',
    discClient?.total === wash.price - 500,
    discClient?.total,
  );

  /* Процент считается от взятой цены. Иначе скидка стоила бы владельцу
     дважды — и в выручке, и в зарплате. */
  check(
    'процент считается от взятой цены',
    Math.floor((discounted.order.price * discounted.order.staffPercent) / 100) ===
      Math.floor(((wash.price - 500) * discounted.order.staffPercent) / 100),
  );

  let tooMuch = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id, serviceId: wash.id,
      clientKey: '77 DISC 2', payment: 'cash', price: wash.price + 1000,
    });
  } catch {
    tooMuch = true;
  }
  check('дороже прайса записать нельзя', tooMuch);

  let negativePrice = false;
  try {
    await createOrder({
      tenantId: tenant.id, staffId: washer.id, serviceId: wash.id,
      clientKey: '77 DISC 3', payment: 'cash', price: -100,
    });
  } catch {
    negativePrice = true;
  }
  check('и отрицательную тоже', negativePrice);

  const badPriceApi = await postOrder(
    post(
      '/orders',
      { clientKey: '77 DISC 4', serviceId: wash.id, payment: 'cash', price: wash.price * 2 },
      staffTokens.access,
    ),
  );
  check('через API это 400, а не 404', badPriceApi.status === 400, badPriceApi.status);
  check('и код BAD_PRICE', (await badPriceApi.json()).error === 'BAD_PRICE');

  const freebie = await createOrder({
    tenantId: tenant.id, staffId: washer.id, serviceId: wash.id,
    clientKey: '77 DISC 5', payment: 'cash', price: 0,
  });
  check('бесплатно записать можно — это тоже скидка', freebie.order.price === 0);

  /* ---------- сдача наличных ---------- */

  const { cashInShift } = await import('../lib/shifts');

  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));

  // две наличных и одна картой: сдавать нужно только наличные
  const onShiftId = staffTokens.user.id;
  for (const [key, payment] of [
    ['55 CASH 1', 'cash'],
    ['55 CASH 2', 'cash'],
    ['55 CARD 1', 'card'],
  ] as const) {
    await createOrder({
      tenantId: tenant.id, staffId: onShiftId, serviceId: body.id,
      clientKey: key, payment,
    });
  }

  const beforeClose = await shiftApi.GET(get("/shift", staffTokens.access));
  const beforeCloseBody = await beforeClose.json();
  check(
    "при закрытии сумма наличных уже посчитана",
    beforeCloseBody.cashSoFar === 6000,
    beforeCloseBody.cashSoFar,
  );

  // id ловим до закрытия: сортировка по времени здесь ненадёжна —
  // выше в файле смены двигались искусственно
  const [openNow] = await db
    .select()
    .from(shiftTable)
    .where(and(eq(shiftTable.tenantId, tenant.id), isNull(shiftTable.closedAt)));

  const handed = await shiftApi.POST(
    post('/shift', { open: false, cash: 5500 }, staffTokens.access),
  );
  const handedBody = await handed.json();
  check('смена закрывается со сдачей', handed.status === 200, handed.status);
  check('карта в сдачу не попала', handedBody.cashExpected === 6000, handedBody.cashExpected);
  check('сдано записано', handedBody.cashDeclared === 5500, handedBody.cashDeclared);

  const [withCash] = await db
    .select()
    .from(shiftTable)
    .where(eq(shiftTable.id, openNow.id));
  check(
    'недостача видна как разница',
    (withCash.cashDeclared ?? 0) - (withCash.cashExpected ?? 0) === -500,
    [withCash.cashDeclared, withCash.cashExpected],
  );

  /* Ожидаемое — снимок. Отменённая назавтра запись не должна переписать
     вчерашнюю недостачу: цифра, на которую владелец посмотрел, обязана
     остаться той же. */
  const toCancel = await q.getFeed(tenant.id, today, 5);
  const cashOrder = toCancel.find((o) => o.payment === 'cash' && o.clientKey === '55 CASH 1');
  if (cashOrder) {
    await cancelOrder({ tenantId: tenant.id, orderId: cashOrder.id, byUserId: owner.id });
  }
  const [afterCancelShift] = await db
    .select()
    .from(shiftTable)
    .where(eq(shiftTable.id, withCash.id));
  check(
    'отмена записи не переписала прошлую недостачу',
    afterCancelShift.cashExpected === 6000,
    afterCancelShift.cashExpected,
  );

  // не отметил — это не ноль, а «не отмечено»
  await shiftApi.POST(post('/shift', { open: true }, staffTokens.access));
  const silent = await shiftApi.POST(post('/shift', { open: false }, staffTokens.access));
  check('без суммы закрыться можно', silent.status === 200, silent.status);
  check('и это «не отмечено», а не ноль', (await silent.json()).cashDeclared === null);

  const negative = await cashInShift(tenant.id, onShiftId, new Date(), new Date());
  check('пустой отрезок даёт ноль, а не null', negative === 0, negative);

  const cronRoute = await import('../app/api/v1/cron/close-shifts/route');
  const noSecret = await cronRoute.POST(new Request('http://t/cron', { method: 'POST' }));
  check('без секрета маршрута как будто нет', noSecret.status === 404, noSecret.status);

  /* ---------- профиль и смена PIN ---------- */

  const profileApi = await import('../app/api/v1/profile/route');
  const pinApi = await import('../app/api/v1/profile/pin/route');

  const named = await profileApi.PATCH(
    post('/profile', { name: 'Արամ Մ.', businessName: 'Ավտոլվացում №1' }, rotated.access),
  );
  check('имя и название бизнеса правятся', named.status === 204, named.status);
  const [ownerNow] = await db.select().from(users).where(eq(users.id, owner.id));
  check("имя записалось", ownerNow.name === "Արամ Մ.", ownerNow.name);
  check('и название бизнеса', (await q.getTenant(tenant.id))?.name === 'Ավտոլվացում №1');

  const shortName = await profileApi.PATCH(post('/profile', { name: 'X' }, rotated.access));
  check('однобуквенное имя не проходит', shortName.status === 400, shortName.status);

  const byWorkerName = await profileApi.PATCH(
    post('/profile', { businessName: 'Чужое' }, staffTokens.access),
  );
  check('сотрудник бизнес не переименует', byWorkerName.status === 403, byWorkerName.status);

  /* Главная проверка: смена PIN обязана выкинуть всех остальных.
     Ради этого поле tokenVersion и заводилось — если сессии переживут
     смену, то тот, у кого старый PIN уже есть, продолжит работать. */
  const wrongOld = await pinApi.POST(
    post('/profile/pin', { current: '0000', next: '5555' }, rotated.access),
  );
  check('со старым неверным — отказ', wrongOld.status === 401, wrongOld.status);

  const shortPin = await pinApi.POST(
    post('/profile/pin', { current: '1234', next: '12' }, rotated.access),
  );
  check('короткий новый не проходит', shortPin.status === 400, shortPin.status);

  const changed = await pinApi.POST(
    post('/profile/pin', { current: '1234', next: '5555', device: 'iPhone' }, rotated.access),
  );
  check('PIN меняется', changed.status === 200, changed.status);
  const fresh = await changed.json();
  check('и сразу выдаётся новая пара токенов', typeof fresh.access === 'string' && fresh.refresh);

  const oldToken = await bootstrap(get('/bootstrap', rotated.access));
  check('старый токен мёртв', oldToken.status === 401, oldToken.status);
  const newToken = await bootstrap(get('/bootstrap', fresh.access));
  check('а новый работает', newToken.status === 200, newToken.status);

  const oldPinLogin = await login(post('/login', { phone: '077 111 222', pin: '1234' }));
  check('по старому PIN больше не войти', oldPinLogin.status === 401, oldPinLogin.status);
  const newPinLogin = await login(post('/login', { phone: '077 111 222', pin: '5555' }));
  check('по новому — входит', newPinLogin.status === 200, newPinLogin.status);

  // дальше по файлу владелец ходит этим токеном
  rotated = { ...rotated, access: fresh.access, refresh: fresh.refresh };

  /* ---------- календарь и история ---------- */

  const history = await import('../lib/history');
  const calendarApi = await import('../app/api/v1/calendar/route');
  const dayApi = await import('../app/api/v1/day/route');

  const todayKey = history.localDate(tenant.timezone);
  const bounds = history.dayBounds(todayKey, tenant.timezone);
  check(
    'сутки ровно 24 часа',
    bounds.to.getTime() - bounds.from.getTime() === 86_400_000,
    (bounds.to.getTime() - bounds.from.getTime()) / 3_600_000,
  );
  check(
    'и начинаются там же, где startOfDay',
    bounds.from.getTime() === q.startOfDay(tenant.timezone).getTime(),
    [todayKey, bounds.from.toISOString(), q.startOfDay(tenant.timezone).toISOString()],
  );

  /* Ереван зону не переводит, но продукт продаётся по нишам, а не по
     странам. Проверяем на зоне, где перевод есть: сутки перехода длятся
     23 часа, и «плюс 24» здесь дало бы съехавший день. */
  const spring = history.dayBounds('2026-03-29', 'Europe/Berlin');
  check(
    'в день перевода стрелок сутки короче',
    spring.to.getTime() - spring.from.getTime() === 23 * 3_600_000,
    (spring.to.getTime() - spring.from.getTime()) / 3_600_000,
  );

  const march = history.monthBounds('2026-03', 'Europe/Berlin');
  check('в марте 31 день', march.days === 31, march.days);
  check('в феврале 28', history.monthBounds('2026-02', tenant.timezone).days === 28);
  check('в високосном 29', history.monthBounds('2028-02', tenant.timezone).days === 29);

  const cal = await calendarApi.GET(get(`/calendar?month=${todayKey.slice(0, 7)}`, rotated.access));
  const calBody = await cal.json();
  check('календарь отдаётся', cal.status === 200, cal.status);
  check(
    'в нём столько дней, сколько в месяце',
    calBody.days.length === history.monthBounds(todayKey.slice(0, 7), tenant.timezone).days,
    calBody.days.length,
  );
  check(
    'пустые дни тоже есть — иначе сетка съедет',
    calBody.days.every((d: { date: string }) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)),
  );
  check(
    'сумма дней сходится с итогом месяца',
    calBody.days.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0) ===
      calBody.total.serviceRevenue,
    [calBody.days.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0), calBody.total.serviceRevenue],
  );

  const oneDay = await dayApi.GET(get(`/day?date=${todayKey}`, rotated.access));
  const dayBody = await oneDay.json();
  check('день отдаётся', oneDay.status === 200, oneDay.status);
  check('в нём видно, кто стоял на смене', Array.isArray(dayBody.shifts), dayBody.shifts);
  check('и что помыли', Array.isArray(dayBody.feed) && dayBody.feed.length > 0, dayBody.feed?.length);

  const badDate = await dayApi.GET(get('/day?date=вчера', rotated.access));
  check('кривая дата — 400, а не пятисотка', badDate.status === 400, badDate.status);

  const dayByStaff = await dayApi.GET(get(`/day?date=${todayKey}`, staffTokens.access));
  check('сотруднику история недоступна', dayByStaff.status === 403, dayByStaff.status);

  /* ---------- уведомления ---------- */

  const pushToken = await import('../app/api/v1/push/token/route');
  const pushSettings = await import('../app/api/v1/push/settings/route');
  const { pushTokens } = await import('../lib/db/schema');

  const saved = await pushToken.POST(
    post('/push/token', { token: 'aabbcc11', sandbox: true }, staffTokens.access),
  );
  check('токен устройства принимается', saved.status === 204, saved.status);

  /* Приложение шлёт токен при каждом запуске — повтор обязан быть тихим,
     иначе он либо задвоится, либо начнёт возвращать ошибку на ровном месте. */
  const sameAgainToken = await pushToken.POST(
    post('/push/token', { token: 'aabbcc11', sandbox: true }, staffTokens.access),
  );
  check('повторная присылка того же токена не ошибка', sameAgainToken.status === 204, sameAgainToken.status);
  check(
    'и он в базе один',
    (await db.select().from(pushTokens).where(eq(pushTokens.token, 'aabbcc11'))).length === 1,
  );

  const setting = await pushSettings.POST(post('/push/settings', { orders: false }, rotated.access));
  check('владелец выключает уведомления о машинах', setting.status === 204, setting.status);
  const [quiet] = await db.select().from(users).where(eq(users.id, owner.id));
  check('и это записалось', quiet.notifyOrders === false, quiet.notifyOrders);

  const byWorker = await pushSettings.POST(
    post('/push/settings', { orders: true }, staffTokens.access),
  );
  check('сотруднику настройка недоступна', byWorker.status === 403, byWorker.status);

  const tokenGone = await pushToken.DELETE(
    del('/push/token', { token: 'aabbcc11' }, staffTokens.access),
  );
  check('при выходе токен отзывается', tokenGone.status === 204, tokenGone.status);
  check(
    'и в базе его больше нет',
    (await db.select().from(pushTokens).where(eq(pushTokens.token, 'aabbcc11'))).length === 0,
  );

  /* Без ключа APNs отправка молчит, но ничего не ломает: запись машины
     не должна зависеть от доступности Apple. */
  const { pushEnabled } = await import('../lib/push');
  check('без ключа уведомления просто выключены', pushEnabled() === false);

  /* ---------- расходы и прибыль ---------- */

  const { addExpense, getPeriodCosts, profitOf, removeExpense } = await import('../lib/expenses');
  const expensesRoute = await import('../app/api/v1/expenses/route');
  const expenseOne = await import('../app/api/v1/expenses/[id]/route');

  const dayAgo = new Date(Date.now() - 86_400_000);

  /* Дата явная, на минуту назад. С `at` по умолчанию тест зависел от
     того, тикнут ли часы между вставкой и запросом: верхняя граница
     периода строгая, и расход, попавший ровно в неё, не считался. */
  await addExpense({
    tenantId: tenant.id,
    userId: owner.id,
    amount: 25_000,
    category: 'Քիմիա',
    at: new Date(Date.now() - 60_000),
  });
  const oneOffCosts = await getPeriodCosts(tenant.id, dayAgo);
  check('разовый расход попадает в период', oneOffCosts.oneOff === 25_000, oneOffCosts.oneOff);

  /* 304 375 / 30.4375 = ровно 10 000 в день. Постоянный расход заведён
     десятью днями раньше, поэтому на сутки периода приходится один день. */
  await addExpense({
    tenantId: tenant.id,
    userId: owner.id,
    amount: 304_375,
    category: 'Վարձ',
    monthly: true,
    at: new Date(Date.now() - 10 * 86_400_000),
  });
  const spread = await getPeriodCosts(tenant.id, dayAgo);
  check(
    'постоянный расход размазан по дням, а не свален в один',
    Math.abs(spread.monthlyShare - 10_000) <= 2,
    spread.monthlyShare,
  );
  check('и складывается с разовым', spread.total === spread.oneOff + spread.monthlyShare);

  /* Аренда, заведённая десять дней назад, не должна съедать прибыль
     за позапрошлый месяц. */
  const before = await getPeriodCosts(
    tenant.id,
    new Date(Date.now() - 60 * 86_400_000),
    new Date(Date.now() - 30 * 86_400_000),
  );
  check('и не капает до дня, когда его завели', before.monthlyShare === 0, before.monthlyShare);

  const dayStats = await q.getPeriodStats(tenant.id, dayAgo);
  check(
    'прибыль = выручка − зарплата − расходы',
    profitOf(dayStats.revenue, dayStats.payroll, spread) ===
      dayStats.revenue - dayStats.payroll - spread.total,
  );

  /* Изоляция. Проверяем не «у соседа записалось», а «у нас не
     изменилось»: именно так эта ошибка и выглядела бы — тихой прибавкой
     к чужим расходам. */
  const mineBefore = await getPeriodCosts(tenant.id, dayAgo);
  const neighbourSpent = await expensesRoute.POST(
    post('/expenses', { amount: 999_999, category: 'Ուրիշի' }, bornBody.access),
  );
  check('сосед заводит свой расход', neighbourSpent.status === 201, neighbourSpent.status);
  const mineAfter = await getPeriodCosts(tenant.id, dayAgo);
  check('и в наш расчёт он не попадает', mineAfter.total === mineBefore.total, [
    mineBefore.total,
    mineAfter.total,
  ]);

  const staffSpend = await expensesRoute.POST(
    post('/expenses', { amount: 100, category: 'X' }, staffTokens.access),
  );
  check('сотрудник расход завести не может', staffSpend.status === 403, staffSpend.status);

  const staffSees = await expensesRoute.GET(get('/expenses', staffTokens.access));
  check('и увидеть их тоже', staffSees.status === 403, staffSees.status);

  const badAmount = await expensesRoute.POST(
    post('/expenses', { amount: 0, category: 'Քիմիա' }, rotated.access),
  );
  check('ноль расходом не считается', badAmount.status === 400, badAmount.status);

  const madeExpense = await expensesRoute.POST(
    post('/expenses', { amount: 4_000, category: 'Ջուր' }, rotated.access),
  );
  check('владелец расход заводит', madeExpense.status === 201, madeExpense.status);
  const madeId = (await madeExpense.json()).expense.id;

  const junkExpense = await expenseOne.DELETE(del('/expenses/nope', {}, rotated.access), {
    params: Promise.resolve({ id: 'not-a-uuid' }),
  });
  check('кривой id — 404, а не пятисотка', junkExpense.status === 404, junkExpense.status);

  const dropped = await expenseOne.DELETE(del(`/expenses/${madeId}`, {}, rotated.access), {
    params: Promise.resolve({ id: madeId }),
  });
  check('разовый расход удаляется', dropped.status === 204, dropped.status);

  /* Постоянный не удаляется, а закрывается датой: иначе правка задним
     числом переписала бы прибыль за все прошлые месяцы. */
  const monthlyRows = (await listExpensesFor(tenant.id)).filter((e) => e.monthly);
  const closed = await removeExpense(tenant.id, monthlyRows[0].id, q.startOfDay(tenant.timezone));
  check('постоянный убирается', closed);
  const afterClose = await getPeriodCosts(
    tenant.id,
    new Date(Date.now() + 86_400_000),
    new Date(Date.now() + 2 * 86_400_000),
  );
  check('и перестаёт капать со следующего дня', afterClose.monthlyShare === 0, afterClose);

  /* ---------- изменение расхода ---------- */

  const { editExpense } = await import('../lib/expenses');
  const expenseDay = q.startOfDay(tenant.timezone);
  const monthAgo = new Date(expenseDay.getTime() - 30 * 86_400_000);

  /* Аренда, заведённая месяц назад: именно на ней и видно, что правка
     не переписывает прошлое. */
  const rent = await addExpense({
    tenantId: tenant.id,
    userId: null,
    amount: 300_000,
    category: 'Վարձ',
    monthly: true,
    at: monthAgo,
  });

  const beforeRaise = await getPeriodCosts(tenant.id, monthAgo, expenseDay);
  check('старая аренда капала месяц', beforeRaise.monthlyShare > 290_000, beforeRaise);

  const raised = await editExpense({
    tenantId: tenant.id,
    id: rent.id,
    userId: null,
    amount: 350_000,
    category: 'Վարձ',
    dayStart: expenseDay,
  });
  check('аренда дорожает', raised?.amount === 350_000, raised?.amount);
  check('и это новая строка, а не переписанная старая', raised?.id !== rent.id);

  const afterRaise = await getPeriodCosts(tenant.id, monthAgo, expenseDay);
  check(
    'прошлый месяц остался посчитан по старой сумме',
    afterRaise.monthlyShare === beforeRaise.monthlyShare,
    [beforeRaise.monthlyShare, afterRaise.monthlyShare],
  );

  const tomorrowStart = new Date(expenseDay.getTime() + 86_400_000);
  const nowCosts = await getPeriodCosts(tenant.id, expenseDay, tomorrowStart);
  check(
    'а сегодня платим уже по новой',
    nowCosts.monthlyShare === Math.round(350_000 / 30.4375),
    nowCosts.monthlyShare,
  );

  const inForce = (await listExpensesFor(tenant.id)).filter((e) => e.monthly && !e.endedAt);
  check(
    'в списке одна аренда, а не две',
    inForce.filter((e) => e.category === 'Վարձ').length === 1,
    inForce.map((e) => e.amount),
  );

  /* Правка названия сумму не трогает — и раздваивать расход не должна:
     иначе исправленная опечатка плодила бы строку на каждый заход. */
  const renamedRent = await editExpense({
    tenantId: tenant.id,
    id: raised!.id,
    userId: null,
    amount: 350_000,
    category: 'Վարձակալություն',
    dayStart: expenseDay,
  });
  check('переименование правит на месте', renamedRent?.id === raised!.id);

  /* Опечатка в сумме: завёл и в тот же день исправил. Дня по старой
     цене быть не должно — иначе ошибка навсегда остаётся в истории. */
  const typo = await addExpense({
    tenantId: tenant.id,
    userId: null,
    amount: 999_999,
    category: 'Հոսանք',
    monthly: true,
    at: new Date(expenseDay.getTime() + 3_600_000),
  });
  await editExpense({
    tenantId: tenant.id,
    id: typo.id,
    userId: null,
    amount: 20_000,
    category: 'Հոսանք',
    dayStart: expenseDay,
  });
  const power = (await listExpensesFor(tenant.id)).filter(
    (e) => e.category === 'Հոսանք' && !e.endedAt,
  );
  check('опечатка в сумме исправляется без следа', power.length === 1, power.map((e) => e.amount));
  check('и не стоит бизнесу ни дня', power[0].amount === 20_000);

  const junkEdit = await editExpense({
    tenantId: second.tenant.id,
    id: raised!.id,
    userId: null,
    amount: 1,
    category: 'Ուրիշի',
    dayStart: expenseDay,
  });
  check('чужой расход не правится', junkEdit === null);

  async function listExpensesFor(id: string) {
    const { listExpenses } = await import('../lib/expenses');
    return listExpenses(id, new Date(Date.now() - 90 * 86_400_000));
  }

  /* ---------- удаление бизнеса ---------- */

  const accountRoute = (await import('../app/api/v1/account/route')).DELETE;
  const { orders, tenants: tenantTable, loginAttempts } = await import('../lib/db/schema');
  const { normalizePhone } = await import('../lib/phone');

  /* Удаляем бизнес, заведённый из приложения. Бизнес №1 при этом обязан
     остаться целым: удаление — самая опасная операция в продукте, и
     проверка изоляции здесь важнее всех остальных. */
  const victimPhone = normalizePhone('077 654 321') as string;
  const [victimOwner] = await db.select().from(users).where(eq(users.phone, victimPhone));
  const victimId = victimOwner.tenantId;

  await staffRoute.POST(
    post(
      '/staff',
      { name: 'Հասմիկ', phone: '077 654 322', pin: '4321', percent: 30 },
      bornBody.access,
    ),
  );
  const helperRes = await login(post('/login', { phone: '077 654 322', pin: '4321' }));
  const helper = await helperRes.json();
  check('сотрудник удаляемого бизнеса входит', helperRes.status === 200, helperRes.status);

  const wipeByStaff = await accountRoute(del('/account', { pin: '4321' }, helper.access));
  check('сотрудник удалить бизнес не может', wipeByStaff.status === 403, wipeByStaff.status);

  const wrongPin = await accountRoute(del('/account', { pin: '0000' }, bornBody.access));
  check('с неверным PIN — отказ', wrongPin.status === 401, wrongPin.status);
  check('и это WRONG_CREDENTIALS', (await wrongPin.json()).error === 'WRONG_CREDENTIALS');
  const survived = await bootstrap(get('/bootstrap', bornBody.access));
  check('после отказа бизнес на месте', survived.status === 200, survived.status);

  const neighbourBefore = await db.select().from(orders).where(eq(orders.tenantId, tenant.id));

  const wiped = await accountRoute(del('/account', { pin: '9876' }, bornBody.access));
  check('владелец удаляет бизнес', wiped.status === 204, wiped.status);
  check('204 приходит без тела', (await wiped.text()) === '');

  const [ghost] = await db.select().from(tenantTable).where(eq(tenantTable.id, victimId));
  check('тенант исчез', ghost === undefined);
  for (const [what, rows] of [
    ['люди', await db.select().from(users).where(eq(users.tenantId, victimId))],
    ['услуги', await db.select().from(services).where(eq(services.tenantId, victimId))],
    ['записи', await db.select().from(orders).where(eq(orders.tenantId, victimId))],
  ] as const) {
    check(`${what} удалены каскадом`, rows.length === 0, rows.length);
  }

  const ownerGone = await bootstrap(get('/bootstrap', bornBody.access));
  check('токен владельца мёртв', ownerGone.status === 401, ownerGone.status);
  const helperGone = await bootstrap(get('/bootstrap', helper.access));
  check('сотрудник теряет доступ тем же мгновением', helperGone.status === 401, helperGone.status);

  const leftAttempts = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.phone, victimPhone));
  check('попытки входа по номеру очищены', leftAttempts.length === 0, leftAttempts.length);

  const neighbourAfter = await db.select().from(orders).where(eq(orders.tenantId, tenant.id));
  check(
    'соседний бизнес не задет',
    neighbourAfter.length === neighbourBefore.length,
    [neighbourBefore.length, neighbourAfter.length],
  );
  const neighbourBoot = await bootstrap(get('/bootstrap', rotated.access));
  check('и его владелец работает дальше', neighbourBoot.status === 200, neighbourBoot.status);

  const reborn = await registerRoute(
    post('/register', {
      niche: nichesBody.niches[0].key,
      businessName: 'Կրկին',
      ownerName: 'Կարեն',
      phone: '077 654 321',
      pin: '5555',
      device: 'iPhone',
    }),
  );
  check('номер освободился — можно завестись заново', reborn.status === 201, reborn.status);

  /* Отключённый за неуплату обязан иметь возможность уйти вместе со
     своими данными: иначе блокировка удерживает чужое. */
  const rebornBody = await reborn.json();
  const [rebornOwner] = await db.select().from(users).where(eq(users.phone, victimPhone));

  /* Нанимаем до отключения: на закрытом счёте запись уже недоступна, а
     проверить надо именно того, кто вошёл раньше и остался с живым
     токеном в кармане. */
  await staffRoute.POST(
    post(
      '/staff',
      { name: 'Սամվել', phone: '077 654 323', pin: '4343', percent: 35 },
      rebornBody.access,
    ),
  );
  const workerRes = await login(post('/login', { phone: '077 654 323', pin: '4343' }));
  const worker = await workerRes.json();
  check('мойщик входит, пока счёт открыт', workerRes.status === 200, workerRes.status);

  await db
    .update(tenantTable)
    .set({ plan: 'blocked' })
    .where(eq(tenantTable.id, rebornOwner.tenantId));

  /* Bootstrap работает и на закрытом счёте — из него приложение узнаёт
     своё состояние. Закрой его, и вместо объяснения человек увидел бы
     экран входа: «меня что, разлогинило?». */
  const blockedBoot = await bootstrap(get('/bootstrap', rebornBody.access));
  check('состояние счёта приложение узнаёт всегда', blockedBoot.status === 200, blockedBoot.status);
  check(
    'и в нём видно, что доступ закрыт',
    (await blockedBoot.json()).access.canRead === false,
  );

  // а вот работа закрыта вся
  const blockedShift = await shiftApi.GET(get('/shift', rebornBody.access));
  check('но смена уже недоступна', blockedShift.status === 403, blockedShift.status);
  const blockedSummary = await summary(get('/summary?period=today', rebornBody.access));
  check('и сводка тоже', blockedSummary.status === 403, blockedSummary.status);

  /* Отключение бизнеса — не про владельца, а про бизнес: флаг лежит в
     тенанте, и `authorize` смотрит на него раньше роли. Значит мойщик с
     живым токеном закрывается тем же мгновением — иначе отключённый
     бизнес продолжал бы работать чужими руками. */
  const workerBoot = await bootstrap(get('/bootstrap', worker.access));
  check('мойщик тоже узнаёт своё состояние', workerBoot.status === 200, workerBoot.status);
  check('и у него доступ закрыт', (await workerBoot.json()).access.canRead === false);

  const workerShift = await shiftApi.GET(get('/shift', worker.access));
  check('мойщику смена закрыта', workerShift.status === 403, workerShift.status);
  const workerOrder = await ordersRoute.POST(
    post('/orders', { plate: '11 QQ 111', serviceIds: [], price: 3000 }, worker.access),
  );
  check('и записать машину он не может', workerOrder.status === 403, workerOrder.status);

  /* Вход остаётся открытым намеренно — иначе мойщик упёрся бы в «неверный
     номер или код» и решил, что его уволили. Пускаем внутрь и там
     объясняем; работать всё равно нечем. */
  const workerLogin = await login(post('/login', { phone: '077 654 323', pin: '4343' }));
  check('войти заново он может', workerLogin.status === 200, workerLogin.status);
  const freshShift = await shiftApi.GET(get('/shift', (await workerLogin.json()).access));
  check('но свежий токен так же пуст', freshShift.status === 403, freshShift.status);

  /* А вот забрать чужое ему нельзя и на закрытом счёте: выгрузка и
     удаление открыты владельцу, а не всякому, кто остался в бизнесе. */
  const workerExport = await exportRoute.GET(get('/export?days=all', worker.access));
  check('выгрузка мойщику закрыта', workerExport.status === 403, workerExport.status);
  const workerWipe = await accountRoute(del('/account', { pin: '4343' }, worker.access));
  check('и удалить бизнес он не может', workerWipe.status === 403, workerWipe.status);

  const blockedExport = await exportRoute.GET(get('/export?days=all', rebornBody.access));
  check('но выгрузку он получает', blockedExport.status === 200, blockedExport.status);
  const blockedWipe = await accountRoute(del('/account', { pin: '5555' }, rebornBody.access));
  check('и удалить себя может', blockedWipe.status === 204, blockedWipe.status);

  /* ---------- наши деньги ----------
     Учёт подписок — единственное место, где считается наша выручка, а не
     клиентская. Ошибка здесь не всплывёт ни у кого: клиент своих цифр не
     видит, а мы увидим неверную сумму и поверим ей. */
  const billing = await import('../lib/admin-billing');
  const audit = await import('../lib/admin-audit');

  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10));

  await billing.recordPayment({ tenantId: tenant.id, amount: 40_000, months: 3, byUserId: owner.id });
  await billing.recordPayment({ tenantId: tenant.id, amount: 0, months: 1, note: 'подарили', byUserId: owner.id });
  const { platformPayments } = await import('../lib/db/schema');
  await db
    .update(platformPayments)
    .set({ at: lastMonth })
    .where(eq(platformPayments.amount, 0));

  const totals = await billing.paymentTotals(thisMonth);
  check('в этом месяце — только сегодняшний платёж', totals.month === 40_000, totals.month);
  check('прошлый месяц отделён от текущего', totals.prevMonth === 0, totals.prevMonth);
  check('за всё время — оба платежа', totals.count === 2, totals.count);
  // ноль — это договорённость, а не отсутствие записи: подаренный месяц
  // должен остаться в истории, иначе через год не вспомнить, почему срок
  // сдвинулся без денег
  const ours = await billing.paymentsOf(tenant.id);
  check('подаренный месяц сохранён', ours.some((p) => p.amount === 0), ours.length);

  /* ---------- журнал ----------
     Мы смотрим в чужие книги, и на вопрос «кто открывал мои цифры»
     нужен ответ. Он бесполезен, если состоит из сотни одинаковых строк
     после каждого обновления страницы. */
  const seen = await audit.logTenantView(tenant.id, owner.id);
  const seenAgain = await audit.logTenantView(tenant.id, owner.id);
  check('первый заход записан', seen === true);
  check('повторный в те же полчаса — нет', seenAgain === false);
  const later = await audit.logTenantView(
    tenant.id,
    owner.id,
    new Date(Date.now() + 31 * 60 * 1000),
  );
  check('через полчаса — снова записан', later === true);

  const journal = await audit.adminJournal();
  check('в журнале только наши действия', journal.every((r) => r.action.startsWith('tenant_') || r.action === 'subscription_extend'), journal.map((r) => r.action));
  // имя берём из тенанта, а не из снимка: бизнес переименовывают, и в
  // журнале должно стоять то, как он называется сейчас, — иначе на звонок
  // «это Комитас» в ленте не найдётся ничего похожего
  check(
    'строка журнала подписана бизнесом',
    journal[0]?.tenantId === tenant.id && !!journal[0]?.tenantName,
    journal[0],
  );

  /* ---------- аренда в календарном месяце ----------
     Постоянный расход делился на 30,4375 всегда. Для месяца из 31 дня это
     давало 101,8 % аренды — расход, которого не было. Проверяем оба режима
     на одной и той же аренде. */
  const { getPeriodCosts: costsOf, addExpense: addCost } = await import('../lib/expenses');
  const rentTenant = (
    await createBusiness({
      niche: 'carwash',
      businessName: 'Վարձի ստուգում',
      ownerName: 'Տ',
      phone: '077 555 111',
      pin: '1234',
    })
  ).tenant;

  const RENT = 300_000;
  // аренда действует с начала прошлого месяца, чтобы покрыть весь период
  const rentSince = new Date(Date.UTC(2025, 11, 1));
  await addCost({
    tenantId: rentTenant.id,
    amount: RENT,
    category: 'Վարձ',
    monthly: true,
    at: rentSince,
    userId: null,
  });

  const jan = new Date(Date.UTC(2026, 0, 1));
  const feb = new Date(Date.UTC(2026, 1, 1));
  const mar = new Date(Date.UTC(2026, 2, 1));

  const janWhole = await costsOf(rentTenant.id, jan, feb, 31);
  const febWhole = await costsOf(rentTenant.id, feb, mar, 28);
  check('в январе (31 день) аренда ровно месячная', janWhole.total === RENT, janWhole.total);
  check('в феврале (28 дней) она же', febWhole.total === RENT, febWhole.total);

  // а внутри суток — доля, иначе прибыль за день завышена
  const rentDay = await costsOf(rentTenant.id, jan, new Date(jan.getTime() + 86_400_000), 31);
  const perDay = Math.round(RENT / 31);
  check('за одни сутки — дневная доля', Math.abs(rentDay.total - perDay) <= 1, rentDay.total);

  /* ---------- границы периодов и база сравнения ---------- */
  const { windowFor } = await import('../lib/summary-window');
  const at = new Date('2026-08-07T12:00:00+04:00');
  const tz = 'Asia/Yerevan';

  const wToday = windowFor('today', tz, at);
  const backDays = Math.round((wToday.from.getTime() - wToday.prevFrom.getTime()) / 86_400_000);
  check('«сегодня» сравнивается с тем же днём недели неделю назад', backDays === 7, backDays);
  check(
    'база обрезана по прожитому времени',
    wToday.prevTo.getTime() - wToday.prevFrom.getTime() === at.getTime() - wToday.from.getTime(),
  );


  /* ---------- тарифы: класс машины ----------

     На отдельном бизнесе намеренно. Заказы, которые нужны этой проверке,
     иначе попали бы в смену основного сценария и сбили бы все суммы ниже —
     а те проверяют совсем другое.                                        */

  const catalog = await import('../lib/catalog');

  // выключено по умолчанию: цена одна, как была
  check(
    'без тарифов цена базовая',
    catalog.priceForTier({ price: 5000, tierPrices: [7000, 9000] }, null) === 5000,
  );

  const tierBiz = await createBusiness({
    niche: 'carwash',
    businessName: 'Դասերով լվացում',
    ownerName: 'Տիգրան',
    phone: '077 515 141',
    pin: '1122',
  });

  const [tierWasher] = await db
    .insert(users)
    .values({
      tenantId: tierBiz.tenant.id,
      phone: '+37477515242',
      pinHash: await hashPin('3344'),
      name: 'Կարեն',
      role: 'staff',
      percent: 40,
    })
    .returning();

  await catalog.saveTiers({
    tenantId: tierBiz.tenant.id,
    label: 'Դաս',
    tiers: ['Սեդան', 'Կրոսովեր', 'Ջիպ'],
  });

  const tierService = await catalog.upsertService({
    tenantId: tierBiz.tenant.id,
    name: 'Դասով լվացում',
    price: 5000,
    tierPrices: [5000, 7000, 9000],
  });

  const [withTiers] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tierBiz.tenant.id));
  check('тарифы сохранились', catalog.tiersOf(withTiers).length === 3);
  check(
    'один тариф запрещён',
    await rejects(() =>
      catalog.saveTiers({ tenantId: tierBiz.tenant.id, label: 'Դաս', tiers: ['Միակ'] }),
    ),
  );

  check('джип дороже седана', catalog.priceForTier(tierService, 2) === 9000);
  check(
    'у класса без своей цены — базовая',
    catalog.priceForTier({ price: 5000, tierPrices: [5000, 0] }, 1) === 5000,
  );
  check('тариф ищется по слову', catalog.tierIndexOf(withTiers, 'ջիպ') === 2);
  check('чужое слово тарифом не считается', catalog.tierIndexOf(withTiers, 'Ավտոբուս') === null);

  const jeep = await createOrder({
    tenantId: tierBiz.tenant.id, staffId: tierWasher.id, serviceId: tierService.id,
    clientKey: '55 JP 555', payment: 'cash', tier: 'Ջիպ',
  });
  check('заказ записан по цене джипа', jeep.order.price === 9000, jeep.order.price);
  check('тариф лёг снимком словом', jeep.order.tier === 'Ջիպ', jeep.order.tier);

  const sedan = await createOrder({
    tenantId: tierBiz.tenant.id, staffId: tierWasher.id, serviceId: tierService.id,
    clientKey: '56 SD 556', payment: 'cash',
  });
  check('без тарифа — базовая цена', sedan.order.price === 5000, sedan.order.price);

  /* Переименование класса не переписывает историю: в заказе лежит слово,
     а не номер. Ровно то же правило, что у цены и процента. */
  await catalog.saveTiers({
    tenantId: tierBiz.tenant.id, label: 'Դաս', tiers: ['Սեդան', 'Կրոսովեր', 'Մեծ ջիպ'],
  });
  const [stillJeep] = await db.select().from(ordersTable).where(eq(ordersTable.id, jeep.order.id));
  check('переименование класса не тронуло прошлую запись', stillJeep.tier === 'Ջիպ', stillJeep.tier);

  // правка названия услуги не должна стирать прайс по классам
  const keptPrices = await catalog.upsertService({
    tenantId: tierBiz.tenant.id, id: tierService.id, name: 'Լվացում', price: 5000,
  });
  check('правка названия сохранила цены классов', (keptPrices.tierPrices ?? []).length === 3);


  const wMonth = windowFor('month', tz, at);
  // 1 августа в Ереване это 31 июля 20:00 UTC — сравниваем по зоне бизнеса
  const monthStartLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' })
    .format(wMonth.from);
  check('«этот месяц» начинается первого числа', monthStartLocal === '01', monthStartLocal);
  check('знаменатель — длина августа', wMonth.spread === 31, wMonth.spread);

  /* Календарь и сводка обязаны делить месячные расходы одним и тем же
     числом. Пока календарь звал `getPeriodCosts` без знаменателя, он делил
     на среднюю 30.4375, а сводка — на 31, и за один и тот же август два
     экрана показывали прибыль, расходящуюся на полтора процента аренды.
     Проверка стоит здесь, а не в маршруте, потому что расходятся именно эти
     два числа, а не HTTP. */
  const monthDays = history.monthBounds('2026-08', tz).days;
  check(
    'календарь делит аренду тем же числом, что и сводка',
    monthDays === wMonth.spread,
    `${monthDays} vs ${wMonth.spread}`,
  );
  check(
    'база месяца не залезает в текущий',
    wMonth.prevTo.getTime() <= wMonth.from.getTime(),
  );

  const wPrev = windowFor('prevmonth', tz, at);
  check('«прошлый месяц» закрыт сверху началом текущего', wPrev.to.getTime() === wMonth.from.getTime());
  check('и сравнивается с позапрошлым целиком', wPrev.prevTo.getTime() === wPrev.from.getTime());
  /* Проверяем именно ДЛИНУ базы: раньше здесь стояло только совпадение
     верхней границы, и то, что нижняя уехала на месяц глубже, проверка
     не заметила — сравнивались два месяца против одного. */
  const baseDays = Math.round((wPrev.prevTo.getTime() - wPrev.prevFrom.getTime()) / 86_400_000);
  const periodDays = Math.round((wPrev.to.getTime() - wPrev.from.getTime()) / 86_400_000);
  check('база ровно в один месяц, а не в два', baseDays >= 28 && baseDays <= 31, baseDays);
  check('и сопоставима с самим периодом', Math.abs(baseDays - periodDays) <= 3, [baseDays, periodDays]);

  /* ---------- вторая точка ----------
     Отдельный бизнес и отдельные номера: всё это заводит новых людей и
     новые мойки, и попади оно в основной сценарий — поехали бы суммы,
     которые проверяют совсем другое.                                    */

  const {
    accountByPhone: findPerson,
    listPoints: pointsOf,
    markPointUsed: markUsed,
  } = await import('../lib/accounts');

  const net1 = await createBusiness({
    niche: 'carwash',
    businessName: 'Ցանց 1',
    ownerName: 'Սուրեն',
    phone: '077 313 001',
    pin: '7711',
  });
  check('первая точка получает пробный срок', net1.trialGranted);
  check('и она открыта', currentAccess(net1.tenant).canRead, currentAccess(net1.tenant).state);

  const human = await findPerson('+37477313001');
  check('пробный срок отмечен у человека', human!.trialUsedAt !== null);

  const net2 = await createBusiness({
    niche: 'carwash',
    businessName: 'Ցանց 2',
    ownerName: 'Սուրեն',
    accountId: human!.id,
  });
  check('вторая точка пробного срока не получает', !net2.trialGranted);
  check('у неё нет даты окончания пробного', net2.tenant.trialEndsAt === null);

  const waiting = currentAccess(net2.tenant);
  check('и она закрыта до оплаты', !waiting.canRead && !waiting.canWrite);
  check(
    'состояние именно «ждёт оплаты», а не «срок вышел»',
    waiting.state === 'unpaid',
    waiting.state,
  );

  const bothPoints = await pointsOf(human!.id);
  check('у человека две точки', bothPoints.length === 2, bothPoints.length);
  check('открытая идёт первой', bothPoints[0].id === net1.tenant.id);

  /* Вход обязан выбирать точку, а не брать первую попавшуюся строку.
     Телефон больше не уникален, индекса по нему нет — «первая» означает
     физический порядок в куче, а его двигает любая правка. Владелец с
     неоплаченной второй точкой попадал бы на стену при работающей
     первой, и в приложении, где переключателя нет, застревал бы там. */
  const netLogin = await login(post('/login', { phone: '077 313 001', pin: '7711' }));
  check('вход по номеру с двумя точками проходит', netLogin.status === 200, netLogin.status);
  const netBody = await netLogin.json();
  const [landed] = await db.select().from(users).where(eq(users.id, netBody.user.id));
  check('и ведёт в ОТКРЫТУЮ точку', landed.tenantId === net1.tenant.id, landed.tenantId);

  /* Оплата закрывает вопрос обычным путём, без отдельной ветки. */
  await db
    .update(tenantTable)
    .set({ plan: 'active', paidUntil: new Date(Date.now() + 30 * 86_400_000) })
    .where(eq(tenantTable.id, net2.tenant.id));
  const [paidPoint] = await db
    .select()
    .from(tenantTable)
    .where(eq(tenantTable.id, net2.tenant.id));
  check('после оплаты точка открывается', currentAccess(paidPoint).canRead);

  /* Теперь обе открыты — и вход обязан вести туда, где человек работал
     последним, а не куда придётся. */
  const [onSecond] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, net2.tenant.id), eq(users.accountId, human!.id)));
  await markUsed(onSecond.id);
  const backAgain = await login(post('/login', { phone: '077 313 001', pin: '7711' }));
  const backBody = await backAgain.json();
  const [landedAgain] = await db.select().from(users).where(eq(users.id, backBody.user.id));
  check(
    'вход возвращает на последнюю использованную',
    landedAgain.tenantId === net2.tenant.id,
    landedAgain.tenantId,
  );

  /* Человека, который уже пользуется Tetrin, нанять нельзя, и это
     осознанный отказ: код ему когда-то назначил первый работодатель и с
     тех пор знает. Разреши мы такой наём — этот первый работодатель
     получил бы рабочий ключ от чужой мойки. */
  const hired2 = await catalog.addStaff({
    tenantId: net2.tenant.id,
    name: 'Կարեն',
    phone: '077 313 002',
    pin: '2200',
    percent: 30,
  });
  check('новый человек нанимается', hired2.percent === 30);

  const pinBefore = (await findPerson('+37477313002'))!;
  let refusal = '';
  await catalog
    .addStaff({
      tenantId: net1.tenant.id,
      name: 'Կարեն',
      phone: '077 313 002',
      pin: '9999',
      percent: 40,
    })
    .catch((e) => {
      refusal = (e as Error).message;
    });
  check('его же на вторую мойку — отказ', refusal === 'PHONE_TAKEN', refusal);
  const pinAfter = (await findPerson('+37477313002'))!;
  check('и код ему НЕ переписали', pinAfter.pinHash === pinBefore.pinHash);

  /* Удаление одной точки не трогает человека, если ему есть где
     остаться: код, устройства и израсходованный пробный срок при нём. */
  const { deleteBusiness: wipe } = await import('../lib/account');
  await wipe(net2.tenant.id);
  const survivor = await findPerson('+37477313001');
  check('человек пережил удаление своей точки', survivor !== undefined);
  check('и пробный срок остался израсходованным', survivor!.trialUsedAt !== null);
  check('вторая точка у него осталась', (await pointsOf(survivor!.id)).length === 1);

  console.log(`\nвыручка форматируется как: ${formatMoney(stats.revenue, tenant.currency)}`);
  console.log(failed === 0 ? '\nвсе проверки пройдены\n' : `\n${failed} провалено\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
