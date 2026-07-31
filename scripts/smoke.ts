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
  check('но данные остаются видны', expiredNow.canRead);

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

  const { sessions } = await import('../lib/db/schema');
  const auth = await import('../lib/auth');

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

  await auth.revokeAllSessions(owner.id);
  check('выход везде гасит и его', !(await auth.sessionAlive(otherClaims)));

  const [bumped] = await db
    .select({ ver: users.tokenVersion })
    .from(users)
    .where(eq(users.id, owner.id));
  check('поколение сессий сдвинулось', bumped.ver === 1, bumped.ver);

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
  const rotated = await rot.json();
  check('и сам refresh новый', rotated.refresh !== tokens.refresh);
  const reused = await refreshRoute(post('/refresh', { refresh: tokens.refresh }));
  check('старый refresh больше не работает', reused.status === 401, reused.status);

  // подделанный токен — отказ, а не 500: кривой uuid Postgres роняет
  // на разборе, и клиенту это неотличимо от поломки сервера
  const junk = await refreshRoute(post('/refresh', { refresh: 'aaa.bbb' }));
  check('мусорный refresh — 401, а не 500', junk.status === 401, junk.status);
  const noDot = await refreshRoute(post('/refresh', { refresh: 'вообще-не-токен' }));
  check('и токен без разделителя тоже', noDot.status === 401, noDot.status);

  /* Идемпотентность записи — то, на чём держится офлайн-очередь. */
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

  await addExpense({
    tenantId: tenant.id,
    userId: owner.id,
    amount: 25_000,
    category: 'Քիմիա',
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
  const closed = await removeExpense(tenant.id, monthlyRows[0].id);
  check('постоянный убирается', closed);
  const afterClose = await getPeriodCosts(
    tenant.id,
    new Date(Date.now() + 86_400_000),
    new Date(Date.now() + 2 * 86_400_000),
  );
  check('и перестаёт капать со следующего дня', afterClose.monthlyShare === 0, afterClose);

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
  await db
    .update(tenantTable)
    .set({ plan: 'blocked' })
    .where(eq(tenantTable.id, rebornOwner.tenantId));

  const blockedBoot = await bootstrap(get('/bootstrap', rebornBody.access));
  check('отключённого в приложение не пускают', blockedBoot.status === 403, blockedBoot.status);
  const blockedExport = await exportRoute.GET(get('/export?days=all', rebornBody.access));
  check('но выгрузку он получает', blockedExport.status === 200, blockedExport.status);
  const blockedWipe = await accountRoute(del('/account', { pin: '5555' }, rebornBody.access));
  check('и удалить себя может', blockedWipe.status === 204, blockedWipe.status);

  console.log(`\nвыручка форматируется как: ${formatMoney(stats.revenue, tenant.currency)}`);
  console.log(failed === 0 ? '\nвсе проверки пройдены\n' : `\n${failed} провалено\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
