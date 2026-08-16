/**
 * Проверки безопасности по живому серверу.
 *
 *   npm run security
 *   BASE=http://localhost:3311 npm run security
 *
 * Отличие от `npm run e2e`: тот проверяет, что продукт РАБОТАЕТ. Этот
 * проверяет, что он НЕ работает там, где не должен, — вход без кода,
 * чужие данные, перебор, повторное использование кода из SMS.
 * Регрессия здесь не ломает экран, поэтому увидеть её можно только так.
 *
 * Пишет только по своей машине: чужой адрес — значит боевой, а на бою
 * такие проверки создают мусор и жгут SMS.
 *
 * КОД ИЗ SMS. Сервер должен быть запущен с `SMS_TEST_SINK=<файл>`:
 * тогда провайдер дописывает отправленные сообщения в файл, и проверка
 * читает код оттуда. Сам код при этом настоящий — случайный,
 * одноразовый, с обычными сроками. Никакого «000000 всегда подходит» в
 * продукте нет и не должно появиться.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';

/* tsx сам .env.local не читает, а без него скрипт уходит в пустую базу
   и «проверки» проходят по несуществующим таблицам. */
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* нет файла — значит переменные пришли из окружения */
}

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SINK = process.env.SMS_TEST_SINK ?? './.data/sms-test.log';

function isLocal(base: string): boolean {
  try {
    const { hostname } = new URL(base);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

if (!isLocal(BASE)) {
  console.error(`\n${BASE} — не своя машина. Эти проверки пишут данные и шлют SMS.\n`);
  process.exit(1);
}

/* ----------------------------- каркас ----------------------------- */

let passed = 0;
let failed = 0;
const problems: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    problems.push(name);
    console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

type Res = { status: number; body: Record<string, unknown> };

async function api(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<Res> {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  let body: Record<string, unknown> = {};
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
  }
  return { status: response.status, body };
}

/* Уникальные номера: проверки не должны наступать друг другу на ноги и
   не должны занимать номера, которые кто-то будет использовать. */
let seq = 0;
const stamp = Date.now() % 10_000_000;

function freshPhone(): string {
  seq += 1;
  return `+37477${String(stamp + seq).padStart(6, '0').slice(-6)}`;
}

/** Последний код, отправленный на номер, — из файла провайдера. */
function codeFor(phone: string): string | null {
  if (!existsSync(SINK)) return null;

  const lines = readFileSync(SINK, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const row = JSON.parse(lines[i]) as { to: string; text: string };
    if (row.to !== phone) continue;
    const m = /Tetrin:\s(\d{6})/.exec(row.text);
    if (m) return m[1];
  }
  return null;
}

/**
 * Обнулить счётчики защиты перед прогоном.
 *
 * Прогон сам по себе выглядит как атака — он ею и притворяется, — и к
 * концу упирается в защиту по адресу. Второй запуск в течение получаса
 * начинался бы уже заблокированным, и половина проверок падала бы не
 * потому, что что-то сломано, а потому, что защита работает.
 *
 * Это делает ПРОВЕРКА, а не продукт: никакого способа сбросить счётчик
 * снаружи у сервера нет и не будет. Здесь просто удаляются строки в
 * своей же локальной базе, и только если до неё можно дотянуться.
 */
async function clearAttempts(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log('  (счётчик попыток не сброшен: базы под рукой нет)\n');
    return;
  }

  try {
    const { db } = await import('../lib/db');
    const { authChallenges, loginAttempts } = await import('../lib/db/schema');
    await db.delete(loginAttempts);
    /* И заявки на код: восемь регистраций подряд с одного адреса — это
       ровно то, что почасовой лимит и должен останавливать. */
    await db.delete(authChallenges);
  } catch (e) {
    console.log('  (счётчик попыток не сброшен:', (e as Error).message, ')\n');
  }
}

/* --------------------------- сценарии --------------------------- */

type Account = { phone: string; pin: string; access: string; refresh: string; tenantId: string };

async function register(pin = '481596'): Promise<Account> {
  const phone = freshPhone();

  const started = await api('/auth/register', {
    body: {
      niche: 'carwash',
      businessName: `Проверка ${seq}`,
      ownerName: 'Проверяющий',
      phone,
      pin,
    },
  });

  if (started.status !== 202) {
    throw new Error(`регистрация не начата: ${started.status} ${JSON.stringify(started.body)}`);
  }

  const code = codeFor(phone);
  if (!code) throw new Error(`код не пришёл в ${SINK} — сервер запущен без SMS_TEST_SINK?`);

  const done = await api('/auth/register/verify', {
    body: { challengeId: started.body.challengeId, code },
  });
  if (done.status !== 201) {
    throw new Error(`регистрация не завершена: ${done.status} ${JSON.stringify(done.body)}`);
  }

  return {
    phone,
    pin,
    access: done.body.access as string,
    refresh: done.body.refresh as string,
    tenantId: done.body.tenantId as string,
  };
}

async function main() {
  console.log(`\nПроверки безопасности · ${BASE}\n`);

  // файл кодов начинаем с чистого листа: старые коды сбили бы поиск
  writeFileSync(SINK, '');
  await clearAttempts();

  /* ===================== РЕГИСТРАЦИЯ И КОД ===================== */
  section('Регистрация и подтверждение номера');

  const phone = freshPhone();
  const weak = await api('/auth/register', {
    body: { niche: 'carwash', businessName: 'Мойка', ownerName: 'Ашот', phone, pin: '1234' },
  });
  check('короткий PIN отклонён', weak.status === 400 && weak.body.error === 'PIN_WEAK', weak);

  const trivial = await api('/auth/register', {
    body: { niche: 'carwash', businessName: 'Мойка', ownerName: 'Ашот', phone, pin: '123456' },
  });
  check(
    'очевидный PIN отклонён',
    trivial.status === 400 && trivial.body.error === 'PIN_WEAK',
    trivial,
  );

  const badPhone = await api('/auth/register', {
    body: { niche: 'carwash', businessName: 'Мойка', ownerName: 'Ашот', phone: '+3747', pin: '481596' },
  });
  check('короткий номер отклонён', badPhone.status === 400, badPhone);

  const started = await api('/auth/register', {
    body: { niche: 'carwash', businessName: 'Мойка', ownerName: 'Ашот', phone, pin: '481596' },
  });
  check('заявка принята без создания аккаунта', started.status === 202, started);
  check('в ответе нет токенов', !('access' in started.body) && !('refresh' in started.body));

  const challengeId = started.body.challengeId as string;

  const wrongCode = await api('/auth/register/verify', {
    body: { challengeId, code: '000001' },
  });
  check('неверный код отклонён', wrongCode.status === 401, wrongCode);

  const code = codeFor(phone) ?? '';
  check('код ушёл в SMS', /^\d{6}$/.test(code));

  /* Армянский не влезает в GSM-7, поэтому сообщение кодируется UCS-2, а
     там сегмент — 70 символов. Лишний символ удваивает счёт оператора
     на каждой регистрации, каждом восстановлении и каждой проверке. */
  const sent = readFileSync(SINK, 'utf8').trim().split('\n').filter(Boolean);
  const last = JSON.parse(sent[sent.length - 1]) as { text: string };
  check(
    `текст SMS умещается в одну (${last.text.length} символов из 70)`,
    last.text.length <= 70,
    last.text.length,
  );

  /* Домена в тексте быть не должно. Армянские операторы режут SMS со
     ссылками от незарегистрированных отправителей: проверено вживую —
     тот же отправитель и номер, разница только в этой строке, с ней
     `un_delivered`, без неё `delivered`. */
  check(
    'в тексте SMS нет ссылки',
    !/tetrin\.pro|https?:\/\/|@[a-z0-9-]+\.[a-z]{2,}/i.test(last.text),
    last.text,
  );

  /* И на всех трёх языках сразу — переводы правят руками, а лишний
     символ стоит второго сегмента на каждой отправке. */
  const { AUTH_LOCALES } = await import('../lib/i18n/auth');
  const { smsPreview } = await import('../lib/otp');
  for (const code of AUTH_LOCALES) {
    const text = smsPreview('481596', code);
    check(
      `текст на ${code} умещается в одну (${text.length})`,
      text.length <= 70,
      text,
    );
  }

  /* Номер до подтверждения НЕ занят: вход под ним не работает. */
  const beforeVerify = await api('/auth/login', { body: { phone, pin: '481596' } });
  check(
    'до подтверждения войти нельзя',
    beforeVerify.status === 401 && beforeVerify.body.error === 'WRONG_CREDENTIALS',
    beforeVerify,
  );

  const verified = await api('/auth/register/verify', { body: { challengeId, code } });
  check('верный код создаёт бизнес', verified.status === 201, verified);
  check('после подтверждения выданы токены', typeof verified.body.access === 'string');

  const reused = await api('/auth/register/verify', { body: { challengeId, code } });
  check('тот же код второй раз не проходит', reused.status !== 201, reused);

  const taken = await api('/auth/register', {
    body: { niche: 'carwash', businessName: 'Мойка', ownerName: 'Ашот', phone, pin: '481596' },
  });
  check('номер занят — отказ', taken.status === 409 && taken.body.error === 'PHONE_TAKEN', taken);

  /* ===================== ВХОД ===================== */
  section('Вход');

  const good = await api('/auth/login', { body: { phone, pin: '481596' } });
  check('верные телефон и PIN пускают', good.status === 200, good);

  const wrongPin = await api('/auth/login', { body: { phone, pin: '481597' } });
  check(
    'неверный PIN — WRONG_CREDENTIALS',
    wrongPin.status === 401 && wrongPin.body.error === 'WRONG_CREDENTIALS',
    wrongPin,
  );

  const unknown = await api('/auth/login', { body: { phone: freshPhone(), pin: '481596' } });
  check(
    'незнакомый номер отвечает ТАК ЖЕ',
    unknown.status === wrongPin.status && unknown.body.error === wrongPin.body.error,
    { unknown, wrongPin },
  );

  /* Разница во времени ответа — тот же способ перебрать номера, что и
     разница в тексте. Считаем медиану, а не одно измерение: на холодном
     сервере первый запрос всегда медленнее. */
  const timings = { known: [] as number[], unknown: [] as number[] };
  for (let i = 0; i < 5; i++) {
    let t = Date.now();
    await api('/auth/login', { body: { phone, pin: '999999' } });
    timings.known.push(Date.now() - t);

    t = Date.now();
    await api('/auth/login', { body: { phone: freshPhone(), pin: '999999' } });
    timings.unknown.push(Date.now() - t);
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const ratio = median(timings.known) / Math.max(median(timings.unknown), 1);
  check(
    'время ответа не выдаёт существование номера',
    ratio > 0.4 && ratio < 2.5,
    { known: median(timings.known), unknown: median(timings.unknown), ratio: ratio.toFixed(2) },
  );

  /* ===================== ВОССТАНОВЛЕНИЕ PIN ===================== */
  section('Восстановление PIN');

  const lost = await register('284613');

  const unknownReset = await api('/auth/pin/reset', { body: { phone: freshPhone() } });
  const knownReset = await api('/auth/pin/reset', { body: { phone: lost.phone } });
  check(
    'ответ одинаков для существующего и чужого номера',
    unknownReset.status === knownReset.status &&
      Object.keys(unknownReset.body).sort().join() === Object.keys(knownReset.body).sort().join(),
    { unknownReset, knownReset },
  );

  const resetCode = codeFor(lost.phone) ?? '';
  check('код восстановления пришёл', /^\d{6}$/.test(resetCode));

  const wrongReset = await api('/auth/pin/reset', {
    body: { challengeId: knownReset.body.challengeId, code: '000002' },
  });
  check('неверный код восстановления отклонён', wrongReset.status === 401, wrongReset);

  const ticketed = await api('/auth/pin/reset', {
    body: { challengeId: knownReset.body.challengeId, code: resetCode },
  });
  check('верный код выдаёт пропуск', ticketed.status === 200 && typeof ticketed.body.ticket === 'string', ticketed);

  const weakNew = await api('/auth/pin/reset', {
    body: { ticket: ticketed.body.ticket, pin: '111111' },
  });
  check('очевидный новый PIN отклонён', weakNew.status === 400, weakNew);

  const saved = await api('/auth/pin/reset', {
    body: { ticket: ticketed.body.ticket, pin: '905172' },
  });
  check('новый PIN сохранён', saved.status === 200, saved);

  const replay = await api('/auth/pin/reset', {
    body: { ticket: ticketed.body.ticket, pin: '905173' },
  });
  check('пропуск одноразовый', replay.status !== 200, replay);

  const oldPinGone = await api('/auth/login', { body: { phone: lost.phone, pin: '284613' } });
  check('старый PIN больше не работает', oldPinGone.status === 401, oldPinGone);

  const newPinWorks = await api('/auth/login', { body: { phone: lost.phone, pin: '905172' } });
  check('новый PIN работает', newPinWorks.status === 200, newPinWorks);

  const deadRefresh = await api('/auth/refresh', { body: { refresh: lost.refresh } });
  check('сессии до сброса погашены', deadRefresh.status === 401, deadRefresh);

  /* ===================== ПОВТОРНАЯ ОТПРАВКА ===================== */
  section('Повторная отправка кода');

  const resendPhone = freshPhone();
  const resendStart = await api('/auth/register', {
    body: {
      niche: 'carwash',
      businessName: 'Мойка',
      ownerName: 'Ашот',
      phone: resendPhone,
      pin: '481596',
    },
  });
  const tooSoon = await api('/auth/otp/resend', {
    body: { challengeId: resendStart.body.challengeId },
  });
  check(
    'повтор сразу после отправки не проходит',
    tooSoon.status === 429 && typeof tooSoon.body.retryAfter === 'number',
    tooSoon,
  );

  /* ===================== СЕССИИ ===================== */
  section('Сессии');

  const sessions = await register('624813');

  const me = await api('/summary', { method: 'GET', token: sessions.access });
  check('токен пускает к своим данным', me.status === 200, { status: me.status });

  const rotated = await api('/auth/refresh', { body: { refresh: sessions.refresh } });
  check('refresh обменивается', rotated.status === 200, rotated);

  const rotatedTwice = await api('/auth/refresh', { body: { refresh: sessions.refresh } });
  check('старый refresh после ротации мёртв', rotatedTwice.status === 401, rotatedTwice);

  await api('/auth/logout', { body: { refresh: rotated.body.refresh } });
  const afterLogout = await api('/auth/refresh', { body: { refresh: rotated.body.refresh } });
  check('после выхода refresh не работает', afterLogout.status === 401, afterLogout);

  const forgedRefresh = await api('/auth/refresh', {
    body: { refresh: `${sessions.tenantId}.подделка` },
  });
  check('подделанный refresh отклонён', forgedRefresh.status === 401, forgedRefresh);

  /* ===================== ЧУЖИЕ ДАННЫЕ ===================== */
  section('Изоляция бизнесов');

  const a = await register('318476');
  const b = await register('529183');

  const bWorkers = await api('/staff', { method: 'GET', token: b.access });
  const bStaffId =
    Array.isArray((bWorkers.body as { staff?: { id: string }[] }).staff) &&
    (bWorkers.body as { staff: { id: string }[] }).staff[0]?.id;

  if (bStaffId) {
    const steal = await api(`/staff/${bStaffId}`, {
      method: 'PATCH',
      token: a.access,
      body: { percent: 99 },
    });
    check('A не правит сотрудника B', steal.status === 403 || steal.status === 404, steal);
  }

  const bExpense = await api('/expenses', {
    token: b.access,
    body: { amount: 1000, category: 'Проверка' },
  });
  const bExpenseId = bExpense.body.id as string | undefined;

  if (bExpenseId) {
    const stealExpense = await api(`/expenses/${bExpenseId}`, { method: 'DELETE', token: a.access });
    check(
      'A не удаляет расход B',
      stealExpense.status === 403 || stealExpense.status === 404,
      stealExpense,
    );
  }

  const forgedTenant = await api('/summary?tenantId=' + b.tenantId, {
    method: 'GET',
    token: a.access,
  });
  check(
    'tenantId из адреса игнорируется',
    forgedTenant.status === 200 &&
      JSON.stringify(forgedTenant.body) !==
        JSON.stringify((await api('/summary', { method: 'GET', token: b.access })).body),
    { status: forgedTenant.status },
  );

  const noToken = await api('/summary', { method: 'GET' });
  check('без токена — 401', noToken.status === 401, noToken);

  /* Мусор строго из ASCII: заголовок с кириллицей не уходит вовсе —
     fetch падает на кодировании, и проверка проверяет свою же ошибку. */
  const garbageToken = await api('/summary', { method: 'GET', token: 'not.a.token' });
  check('мусорный токен — 401', garbageToken.status === 401, garbageToken);

  /* ===================== РОЛИ ===================== */
  section('Роли');

  const staffPhone = freshPhone();
  const hired = await api('/staff', {
    token: a.access,
    body: { name: 'Мойщик', phone: staffPhone, pin: '736294', percent: 30 },
  });
  check('владелец нанимает сотрудника', hired.status === 200 || hired.status === 201, hired);

  const staffLogin = await api('/auth/login', { body: { phone: staffPhone, pin: '736294' } });
  check('сотрудник входит', staffLogin.status === 200, { status: staffLogin.status });

  if (staffLogin.status === 200) {
    const staffToken = staffLogin.body.access as string;

    const ownerOnly = await api('/staff', {
      token: staffToken,
      body: { name: 'Себе', phone: freshPhone(), pin: '736295', percent: 100 },
    });
    check(
      'сотрудник не нанимает людей',
      ownerOnly.status === 403 && ownerOnly.body.error === 'FORBIDDEN',
      ownerOnly,
    );

    const payroll = await api('/payouts', {
      token: staffToken,
      body: { items: [{ staffId: 'x', day: '2026-01-01' }] },
    });
    check('сотрудник не выплачивает зарплату', payroll.status === 403, payroll);
  }

  /* ===================== ВВОД ===================== */
  section('Проверка ввода');

  const badId = await api('/staff/не-uuid', {
    method: 'PATCH',
    token: a.access,
    body: { percent: 10 },
  });
  check('кривой id — не пятисотка', badId.status !== 500, badId);

  const massAssign = await api('/profile', {
    method: 'PATCH',
    token: a.access,
    body: { name: 'Ашот', role: 'owner', isAdmin: true, phoneVerified: true, tokenVersion: 999 },
  });
  check('лишние поля не применяются', massAssign.status === 204, massAssign);

  const stillFine = await api('/auth/devices', { method: 'GET', token: a.access });
  check('после лишних полей токен по-прежнему живой', stillFine.status === 200, stillFine);

  const huge = await api('/expenses', {
    token: a.access,
    body: { amount: 100, category: 'x'.repeat(200_000) },
  });
  check('огромное поле не роняет сервер', huge.status !== 500, { status: huge.status });

  const badJson = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{не json',
  });
  check('битый JSON — 400, а не 500', badJson.status === 400, { status: badJson.status });

  const negative = await api('/expenses', {
    token: a.access,
    body: { amount: -100000, category: 'Проверка' },
  });
  check('отрицательная сумма не проходит', negative.status !== 200 && negative.status !== 201, negative);

  /* ===================== ЗАГОЛОВКИ ===================== */
  section('Заголовки и источник запроса');

  const page = await fetch(`${BASE}/login`);
  const csp = page.headers.get('content-security-policy') ?? '';
  check('CSP отдаётся', csp.length > 0);
  check('запрет встраивания в iframe', csp.includes("frame-ancestors 'none'"), csp);
  check('object-src закрыт', csp.includes("object-src 'none'"), csp);
  check('base-uri закрыт', csp.includes("base-uri 'self'"), csp);
  check('X-Content-Type-Options', page.headers.get('x-content-type-options') === 'nosniff');
  check('Referrer-Policy', (page.headers.get('referrer-policy') ?? '').length > 0);
  check('X-Frame-Options', page.headers.get('x-frame-options') === 'DENY');

  const foreign = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ phone, pin: '481596' }),
  });
  check('запрос с чужого источника отклонён', foreign.status === 403, { status: foreign.status });
  check(
    'чужому источнику не выдан CORS',
    foreign.headers.get('access-control-allow-origin') === null,
  );

  /* ===================== ПЕРЕБОР ===================== */
  section('Защита от перебора');

  const victim = await register('713942');
  let throttled = false;
  let attempts = 0;

  for (let i = 0; i < 12 && !throttled; i++) {
    attempts++;
    const tryIt = await api('/auth/login', { body: { phone: victim.phone, pin: '000009' } });
    if (tryIt.status === 429 && tryIt.body.error === 'TOO_MANY_TRIES') throttled = true;
  }

  check(`перебор PIN закрывается (после ${attempts} попыток)`, throttled);

  const throttledResponse = await api('/auth/login', { body: { phone: victim.phone, pin: victim.pin } });
  check(
    'верный PIN во время блокировки тоже ждёт',
    throttledResponse.status === 429,
    throttledResponse,
  );
  check(
    'блокировка сообщает, сколько ждать',
    typeof throttledResponse.body.retryAfter === 'number' &&
      (throttledResponse.body.retryAfter as number) > 0,
    throttledResponse.body,
  );

  /* Блокировка не должна быть вечной и не должна быть способом закрыть
     чужой аккаунт навсегда — она измеряется минутами. */
  check(
    'блокировка временная, а не вечная',
    (throttledResponse.body.retryAfter as number) <= 3600,
    throttledResponse.body,
  );

  /* ===================== ИТОГ ===================== */
  console.log(`\n${passed} пройдено, ${failed} провалено`);
  if (failed > 0) {
    console.log('\nНе прошли:');
    for (const p of problems) console.log(`  · ${p}`);
    process.exit(1);
  }
  console.log('\nвсе проверки пройдены\n');
}

main().catch((e) => {
  console.error('\nпрогон оборвался:', e instanceof Error ? e.message : e);
  process.exit(1);
});
