/**
 * Сквозной прогон по живому серверу: HTTP, а не вызовы функций.
 * Запуск:  npm run e2e            (сервер должен быть поднят)
 *          BASE=https://tetrin.pro npm run e2e   — по проду, только чтение
 *
 * Смоук (`npm run smoke`) проверяет слой данных: снимки цен, атомарность,
 * изоляцию бизнесов. Здесь проверяется всё, что лежит НАД ним и чего
 * смоук не видит: маршруты, токены, коды ошибок, доступ по роли и по
 * состоянию подписки, страницы кабинета. Ровно те места, где ошибка не
 * ломает данные, а просто выдаёт чужое или не пускает своего.
 *
 * Данные создаёт свои, с одноразовыми телефонами, и чужого не трогает.
 */

/* Скрипт лезет в базу напрямую (состояния подписки), а tsx сам
   .env.local не читает — без этого drizzle молча уходит в пустой PGLite
   и «проверки» проходят по несуществующим таблицам. */
import { readFileSync } from 'node:fs';
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* нет файла — значит переменные пришли из окружения */
}

const BASE = process.env.BASE ?? 'http://localhost:3100';
const READONLY = BASE !== 'http://localhost:3100';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
  }
}

function group(title: string) {
  console.log(`\n── ${title}`);
}

type Res = { status: number; json: any; text: string; location: string | null };

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<Res> {
  const r = await fetch(`${BASE}/api/v1${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* не JSON — оставляем текст */
  }
  return { status: r.status, json, text, location: r.headers.get('location') };
}

async function web(path: string, cookie?: string): Promise<Res> {
  const r = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  const text = r.status < 300 || r.status >= 400 ? await r.text() : '';
  return { status: r.status, json: null, text, location: r.headers.get('location') };
}

/** Одноразовый номер: 099 + шесть цифр от текущего момента. */
function phone(seed: number): string {
  const n = String((Date.now() + seed) % 1_000_000).padStart(6, '0');
  return `099${n}`;
}

async function main() {
  console.log(`\nсквозной прогон по ${BASE}${READONLY ? '  (только чтение)' : ''}`);

  /* ─────────────── доступность ─────────────── */
  group('сервер отвечает');
  const home = await web('/');
  check('главная 200', home.status === 200, home.status);
  check('главная — это Tetrin', home.text.includes('TETRIN') || home.text.includes('Tetrin'));

  const niches = await api('/niches');
  check('/niches открыт без токена', niches.status === 200, niches.status);

  if (READONLY) {
    console.log('\nпрод: пишущие проверки пропущены');
    return report();
  }

  /* ─────────────── регистрация ─────────────── */
  group('регистрация');
  const ownerPhone = phone(1);
  const reg = await api('/auth/register', {
    body: {
      niche: 'carwash',
      businessName: 'Тест Мойка',
      ownerName: 'Тест Владелец',
      phone: ownerPhone,
      pin: '2468',
      device: 'e2e',
    },
  });
  check('регистрация проходит', reg.status === 201, reg.status);
  const owner = reg.json ?? {};
  check('выдан access-токен', typeof owner.access === 'string', Object.keys(owner));
  check('выдан refresh-токен', typeof owner.refresh === 'string');

  const dup = await api('/auth/register', {
    body: {
      niche: 'carwash',
      businessName: 'Второй',
      ownerName: 'Второй',
      phone: ownerPhone,
      pin: '1111',
      device: 'e2e',
    },
  });
  check('тот же номер второй раз — отказ', dup.status === 409, dup.status);
  check('и код ошибки PHONE_TAKEN', dup.json?.error === 'PHONE_TAKEN', dup.json);

  for (const [what, payload] of [
    ['ниша', { niche: 'нетакой', businessName: 'A', ownerName: 'B', phone: phone(2), pin: '1234' }],
    ['имя', { niche: 'carwash', businessName: 'A', ownerName: 'B', phone: phone(3), pin: '1234' }],
    ['телефон', { niche: 'carwash', businessName: 'Аа', ownerName: 'Бб', phone: '123', pin: '1234' }],
    ['PIN', { niche: 'carwash', businessName: 'Аа', ownerName: 'Бб', phone: phone(4), pin: '12' }],
  ] as const) {
    const bad = await api('/auth/register', { body: payload });
    check(`кривой ${what} — 400`, bad.status === 400, bad.json);
  }

  const token = owner.access as string;

  /* ─────────────── вход ─────────────── */
  group('вход');
  const login = await api('/auth/login', { body: { phone: ownerPhone, pin: '2468', device: 'e2e-2' } });
  check('вход с верным кодом', login.status === 200, login.json);

  const wrong = await api('/auth/login', { body: { phone: ownerPhone, pin: '9999', device: 'x' } });
  check('неверный код — 401', wrong.status === 401, wrong.status);
  check('и код ошибки WRONG_CREDENTIALS', wrong.json?.error === 'WRONG_CREDENTIALS', wrong.json);

  const nobody = await api('/auth/login', { body: { phone: phone(9), pin: '1234', device: 'x' } });
  check('несуществующий номер — 401, а не 404', nobody.status === 401, nobody.status);

  /* ─────────────── токены ─────────────── */
  group('токены');
  const noTok = await api('/bootstrap');
  check('без токена — 401', noTok.status === 401, noTok.status);

  const junk = await api('/bootstrap', { token: 'not-a-token' });
  check('мусор вместо токена — 401', junk.status === 401, junk.status);

  const refreshed = await api('/auth/refresh', { body: { refresh: login.json?.refresh } });
  check('обновление токена проходит', refreshed.status === 200, refreshed.json);

  const replay = await api('/auth/refresh', { body: { refresh: login.json?.refresh } });
  check('старый refresh погашен', replay.status !== 200, replay.status);

  /* ─────────────── свой бизнес ─────────────── */
  group('бизнес владельца');
  const boot = await api('/bootstrap', { token });
  check('bootstrap отвечает', boot.status === 200, boot.status);
  check('и знает бизнес', Boolean(boot.json?.tenant?.id ?? boot.json?.tenant?.name), Object.keys(boot.json ?? {}));

  const svc = await api('/services', { token, body: { name: 'Комплекс', price: 5000 } });
  check('услуга заводится', svc.status === 200 || svc.status === 201, svc.json);
  const serviceId = svc.json?.id ?? svc.json?.service?.id;
  check('и возвращает свой id', Boolean(serviceId), svc.json);

  const svcList = await api('/services', { token });
  check('услуга видна в списке', svcList.status === 200 && JSON.stringify(svcList.json).includes('Комплекс'));

  /* ─────────────── смена и запись ─────────────── */
  group('смена и запись машины');
  const before = await api('/orders', {
    token,
    body: { clientKey: '12AB345', serviceId, payment: 'cash', ref: `e2e-${Date.now()}-0` },
  });
  check('запись вне смены — 409 SHIFT_REQUIRED', before.status === 409 && before.json?.error === 'SHIFT_REQUIRED', {
    s: before.status,
    j: before.json,
  });

  const openShift = await api('/shift', { token, body: { open: true } });
  check('смена открывается', openShift.status === 200 || openShift.status === 204, openShift.json);

  const ref = `e2e-${Date.now()}`;
  const order = await api('/orders', {
    token,
    body: { clientKey: '12AB345', serviceId, payment: 'cash', ref },
  });
  check('машина записывается', order.status === 200 || order.status === 201, order.json);
  const orderId = order.json?.id ?? order.json?.order?.id;

  const again = await api('/orders', {
    token,
    body: { clientKey: '12AB345', serviceId, payment: 'cash', ref },
  });
  check('повтор с тем же ref не задваивает', again.status === 200 || again.status === 409, again.status);

  const shift = await api('/shift', { token });
  check('смена видит запись', shift.json?.count >= 1, shift.json?.count);
  check('и её выручку', shift.json?.revenue >= 5000, shift.json?.revenue);

  const summary = await api('/summary', { token });
  check('сводка отвечает', summary.status === 200, summary.status);

  const today = new Date().toISOString().slice(0, 10);
  const day = await api(`/day?date=${today}`, { token });
  check('день отвечает', day.status === 200, day.status);
  const dayNoDate = await api('/day', { token });
  check('день без даты — 400, а не падение', dayNoDate.status === 400, dayNoDate.status);

  if (orderId) {
    const cancel = await api(`/orders/${orderId}/cancel`, { token, method: 'POST' });
    check('запись отменяется', cancel.status === 200 || cancel.status === 204, cancel.status);
    const after = await api('/shift', { token });
    check('после отмены выручка упала', after.json?.revenue < shift.json?.revenue, {
      было: shift.json?.revenue,
      стало: after.json?.revenue,
    });
  }

  /* ─────────────── расходы, зарплата, клиенты ─────────────── */
  group('расходы, зарплата, клиенты');
  const exp = await api('/expenses', { token, body: { category: 'Химия', amount: 3000 } });
  check('расход заводится', exp.status === 200 || exp.status === 201, exp.json);
  const expenseId = exp.json?.id ?? exp.json?.expense?.id;

  /* Постоянный расход и то, что маршрут отдаёт о нём приложению.

     Проверяется здесь, потому что расходятся веб и телефон именно на
     этих полях: доля периода, дневная доля и знаменатель у них обязаны
     быть одни. Пока приложение считало долю само, оно делило на длину
     ТЕКУЩЕГО месяца — и в прошлом месяце показывало не то, что кабинет. */
  const rent = await api('/expenses', {
    token,
    body: { category: 'Аренда', amount: 300000, monthly: true },
  });
  check('постоянный расход заводится', rent.status === 200 || rent.status === 201, rent.json);

  const list = await api('/expenses', { token });
  check('расходы отвечают', list.status === 200, list.status);
  const rentRow = (list.json?.expenses ?? []).find((e: any) => e.category === 'Аренда');
  check('у постоянного есть доля периода', typeof rentRow?.share === 'number', rentRow);
  check('и дневная доля', typeof rentRow?.perDay === 'number' && rentRow.perDay > 0, rentRow);
  check(
    'доля не больше номинала',
    typeof rentRow?.share === 'number' && rentRow.share <= rentRow.amount,
    rentRow,
  );
  check(
    'итог сходится с суммой строк',
    (list.json?.expenses ?? []).reduce((s: number, e: any) => s + (e.share ?? 0), 0) ===
      list.json?.costs?.total,
    { строки: list.json?.expenses?.map((e: any) => e.share), итог: list.json?.costs },
  );
  check('выручка периода приходит', typeof list.json?.revenue === 'number', list.json?.revenue);

  /* Разовый расход задним числом: их заводят пачкой, за всю неделю
     сразу, и без даты вся неделя ложится сегодняшним числом. */
  const backdated = await api('/expenses', {
    token,
    body: { category: 'Вода', amount: 1000, at: '2000-01-05' },
  });
  check('разовый принимает свой день', backdated.status === 201, backdated.json);
  const oldMonth = await api('/expenses', { token });
  check(
    'и в текущий месяц не попадает',
    !(oldMonth.json?.expenses ?? []).some((e: any) => e.category === 'Вода'),
    oldMonth.json?.expenses,
  );

  /* Будущее отбрасывается молча: траты, которой ещё не было, не бывает. */
  const future = await api('/expenses', {
    token,
    body: { category: 'Будущее', amount: 500, at: '2999-01-01' },
  });
  check('день из будущего не принимается', future.status === 201, future.json);
  const now = await api('/expenses', { token });
  check(
    'а расход ложится сегодняшним днём',
    (now.json?.expenses ?? []).some((e: any) => e.category === 'Будущее'),
    now.json?.expenses?.map((e: any) => e.category),
  );

  if (expenseId) {
    const del = await api(`/expenses/${expenseId}`, { token, method: 'DELETE' });
    check('расход удаляется', del.status === 200 || del.status === 204, del.status);
  }

  const payroll = await api('/payroll', { token });
  check('зарплаты отвечают', payroll.status === 200, payroll.status);

  /* Машина, которую не отменяют: единственная запись выше отменена, а
     клиент с нулём визитов из базы не показывается вовсе — проверять
     карточку было бы не на чем. */
  await api('/orders', {
    token,
    body: { clientKey: '77ZZ777', serviceId, payment: 'cash', ref: `e2e-keep-${Date.now()}` },
  });

  const clients = await api('/clients', { token });
  check('клиенты отвечают', clients.status === 200, clients.status);
  check(
    'давность визита не отрицательная',
    (clients.json?.clients ?? []).every((c: any) => c.daysSince >= 0),
    clients.json?.clients?.map((c: any) => c.daysSince),
  );

  const someone = clients.json?.clients?.[0]?.key;
  check('клиент в базе появился сам', Boolean(someone), clients.json?.clients);
  if (someone) {
    const card = await api(`/clients/${encodeURIComponent(someone)}`);
    const one = await api(`/clients/${encodeURIComponent(someone)}`, { token });
    check('карточка клиента отвечает', one.status === 200, one.status);
    check('и знает первый визит', Boolean(one.json?.client?.firstSeenAt), one.json?.client);
    check('без токена карточка закрыта', card.status === 401, card.status);
  }

  const exportRes = await fetch(`${BASE}/api/v1/export`, { headers: { authorization: `Bearer ${token}` } });
  check('выгрузка отдаётся', exportRes.ok, exportRes.status);

  /* ─────────────── чужое ─────────────── */
  group('изоляция бизнесов');
  const otherPhone = phone(50);
  const other = await api('/auth/register', {
    body: {
      niche: 'carwash',
      businessName: 'Чужая мойка',
      ownerName: 'Чужой',
      phone: otherPhone,
      pin: '1357',
      device: 'e2e',
    },
  });
  const otherToken = other.json?.access;
  check('второй бизнес создан', Boolean(otherToken), other.json);

  if (otherToken && serviceId) {
    /* PATCH у услуги нет вовсе: цену правят только в вебе. Изоляцию
       проверяем удалением — единственным, что маршрут умеет. */
    const stealDelete = await api(`/services/${serviceId}`, { token: otherToken, method: 'DELETE' });
    check('и не даёт удалить', stealDelete.status === 404 || stealDelete.status === 403, stealDelete.status);
  }

  if (otherToken && orderId) {
    const stealCancel = await api(`/orders/${orderId}/cancel`, { token: otherToken, method: 'POST' });
    check('чужую запись не отменяет', stealCancel.status === 404 || stealCancel.status === 403, stealCancel.status);
  }

  /* ─────────────── роль ─────────────── */
  group('роль работника');
  /* Порядок важен: работника нанимаем ДО проверок доступа, потому что
     дальше первому бизнесу испортят подписку. */
  const staffPhone = phone(80);
  const hire = await api('/staff', {
    token,
    body: { name: 'Мойщик', phone: staffPhone, pin: '4321', percent: 40 },
  });
  check('работник нанимается', hire.status === 200 || hire.status === 201, hire.json);

  /* Список людей и то, чего в нём раньше не было: стоит ли человек на
     смене и сколько ему должны. Оба числа приходят с сервера, потому
     что считать их на телефоне значило бы завести второй счёт долга —
     а он разошёлся бы с ведомостью на первой же отменённой машине. */
  const roster = await api('/staff', { token });
  check('список людей отвечает', roster.status === 200, roster.status);
  const hired = (roster.json?.staff ?? []).find((s: any) => s.name === 'Мойщик');
  check('у человека известна смена', typeof hired?.onShift === 'boolean', hired);
  check('и долг', typeof hired?.due === 'number', hired);

  const staffLogin = await api('/auth/login', { body: { phone: staffPhone, pin: '4321', device: 'e2e-staff' } });
  check('работник входит своим кодом', staffLogin.status === 200, staffLogin.json);
  const staffToken = staffLogin.json?.access;

  if (staffToken) {
    const seeStaff = await api('/staff', { token: staffToken });
    check('работник не видит список людей', seeStaff.status === 403, seeStaff.status);

    const seePayroll = await api('/payroll', { token: staffToken });
    check('работник не видит зарплаты', seePayroll.status === 403, seePayroll.status);

    const seeSummary = await api('/summary', { token: staffToken });
    check('и не видит сводку владельца', seeSummary.status === 403, seeSummary.status);

    const ownShift = await api('/shift', { token: staffToken });
    check('но свою смену видит', ownShift.status === 200, ownShift.status);
  }

  /* ─────────────── чужие правки ─────────────── */
  group('чужие правки через PATCH');
  const myStaffId = hire.json?.id ?? hire.json?.staff?.id;
  const myExpense = await api('/expenses', { token, body: { category: 'Аренда', amount: 50_000 } });
  const myExpenseId = myExpense.json?.id ?? myExpense.json?.expense?.id;

  if (otherToken && myStaffId) {
    const r = await api(`/staff/${myStaffId}`, {
      token: otherToken,
      method: 'PATCH',
      /* Тело полное и валидное нарочно: с неполным ответ 400 приходит
         от проверки полей, ДО проверки права, и ничего не доказывает. */
      body: { name: 'Взломано', percent: 99 },
    });
    check('чужого работника не правит', r.status === 404 || r.status === 403, r.status);

    const mine = await api('/staff', { token });
    check(
      'и работник остался нетронутым',
      JSON.stringify(mine.json).includes('Мойщик') && !JSON.stringify(mine.json).includes('Взломано'),
      mine.json,
    );
  } else {
    check('чужого работника не правит — НЕ ПРОВЕРЕНО (нет id)', false, hire.json);
  }

  if (otherToken && myExpenseId) {
    const r = await api(`/expenses/${myExpenseId}`, {
      token: otherToken,
      method: 'PATCH',
      body: { amount: 1, category: 'Взломано' },
    });
    check('чужой расход не правит', r.status === 404 || r.status === 403, r.status);

    const d = await api(`/expenses/${myExpenseId}`, { token: otherToken, method: 'DELETE' });
    check('чужой расход не удаляет', d.status === 404 || d.status === 403, d.status);

    const stillMine = await api('/expenses', { token });
    check(
      'и расход остался на месте с прежней суммой',
      JSON.stringify(stillMine.json).includes('Аренда') &&
        JSON.stringify(stillMine.json).includes('50000') &&
        !JSON.stringify(stillMine.json).includes('Взломано'),
      stillMine.json,
    );
  } else {
    check('чужой расход не правит — НЕ ПРОВЕРЕНО (нет id)', false, myExpense.json);
  }

  /* ─────────────── состояния подписки ─────────────── */
  group('срок и блокировка');
  /* Состояние правится прямо в базе: платёжного шлюза нет, а проверить
     надо именно поведение продукта на истёкшем и закрытом бизнесе — это
     то, что увидит первый неплательщик. */
  const { db } = await import('../lib/db');
  const { tenants } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const tid: string = boot.json?.tenant?.id;
  check('id бизнеса известен', Boolean(tid), boot.json?.tenant);

  if (tid) {
    const yesterday = new Date(Date.now() - 86_400_000);
    await db.update(tenants).set({ trialEndsAt: yesterday, paidUntil: null }).where(eq(tenants.id, tid));

    /* Просрочка закрывает доступ целиком, а не только запись — это
       решение продукта, см. lib/subscription.ts. Проверяем, что она
       закрывает именно так и что код при этом «оплати», а не «закрыт». */
    const readAfterExpiry = await api('/summary', { token });
    check('после срока сводка закрыта', readAfterExpiry.status === 402, readAfterExpiry.status);
    check(
      'и код говорит «оплати», а не «закрыт»',
      readAfterExpiry.json?.error === 'SUBSCRIPTION_EXPIRED',
      readAfterExpiry.json,
    );

    const writeAfterExpiry = await api('/orders', {
      token,
      body: { clientKey: 'AA111', serviceId, payment: 'cash', ref: `e2e-exp-${Date.now()}` },
    });
    check('после срока запись запрещена', writeAfterExpiry.status === 402, writeAfterExpiry.status);

    const exportStillWorks = await fetch(`${BASE}/api/v1/export`, {
      headers: { authorization: `Bearer ${token}` },
    });
    check('но выгрузка своих данных работает и после срока', exportStillWorks.ok, exportStillWorks.status);

    await db.update(tenants).set({ plan: 'blocked' }).where(eq(tenants.id, tid));

    const blockedRead = await api('/summary', { token });
    check('закрытый бизнес не читается', blockedRead.status === 403, blockedRead.status);
    check(
      'и код ошибки SUBSCRIPTION_BLOCKED',
      blockedRead.json?.error === 'SUBSCRIPTION_BLOCKED',
      blockedRead.json,
    );

    if (staffToken) {
      const staffBlocked = await api('/shift', { token: staffToken });
      check('и работника тоже закрывает', staffBlocked.status === 403, staffBlocked.status);
    }

    /* Возвращаем как было, чтобы прогон можно было повторить. */
    await db
      .update(tenants)
      .set({ plan: 'trial', trialEndsAt: new Date(Date.now() + 14 * 86_400_000) })
      .where(eq(tenants.id, tid));

    const backAlive = await api('/summary', { token });
    check('после снятия блокировки открывается снова', backAlive.status === 200, backAlive.status);
  }

  /* ─────────────── страницы кабинета ─────────────── */
  group('страницы');
  for (const path of ['/', '/login', '/start', '/start/carwash', '/privacy', '/support']) {
    const r = await web(path);
    // /start уводит на единственную нишу, пока она одна
    check(`${path} открыт всем`, r.status === 200 || r.status === 307, r.status);
  }
  for (const path of ['/owner', '/owner/payroll', '/owner/staff', '/owner/settings', '/work']) {
    const r = await web(path);
    check(`${path} без входа уводит`, r.status === 307 || r.status === 302, r.status);
  }
  const admin = await web('/admin');
  check('/admin без прав не пускает', admin.status !== 200, admin.status);

  report();
}

function report() {
  console.log(`\n${'─'.repeat(52)}`);
  if (failures.length === 0) {
    console.log(`все ${passed} проверок пройдены`);
  } else {
    console.log(`пройдено ${passed}, провалено ${failures.length}:`);
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nпрогон упал:', e);
  process.exitCode = 1;
});
