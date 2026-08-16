import { createHmac } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { knownDevices } from './db/schema';
import { failCount } from './login-guard';
import { deviceLabel } from './security-log';

/**
 * Нужно ли спрашивать код из SMS при обычном входе.
 *
 * Ответ по умолчанию — НЕТ. Это главное правило этого файла: SMS на
 * каждый вход не безопасность, а налог, который платит владелец мойки
 * каждое утро. Код появляется только там, где вход действительно не
 * похож на обычный.
 *
 * Поводов ровно два, и оба говорят о чём-то, чего в нормальный день не
 * бывает:
 *
 *   незнакомое устройство — при том, что знакомые у человека уже есть;
 *   серия неудачных попыток прямо перед удачной — то есть код подобрали
 *   либо угадали, а не вспомнили.
 *
 * ПОЧЕМУ «ПРИ ТОМ, ЧТО ЗНАКОМЫЕ УЖЕ ЕСТЬ»
 *
 * У всех, кто зарегистрировался до этой работы, знакомых устройств ноль:
 * таблицы не было. Требуй мы код при нулевом списке — каждый живой
 * владелец получил бы SMS на следующем же входе, а те, чей номер мы
 * подтвердить ещё не успели, не получили бы ничего и остались снаружи.
 * Поэтому первое устройство запоминается молча, а спрашивать начинаем со
 * второго. Окно доверия открыто ровно один раз на человека и закрывается
 * навсегда после первого же успешного входа.
 *
 * И отдельно: код нельзя спросить у того, чей номер не подтверждён. Для
 * таких людей повышение проверки означало бы блокировку, а не проверку,
 * поэтому вместо кода им предлагается подтвердить номер — но не сейчас,
 * а в кабинете, когда они уже вошли.
 */

export type DeviceSignals = {
  /** заголовок браузера или строка устройства из приложения */
  agent: string | null;
  /** язык — второй устойчивый сигнал, который у скрипта обычно пустой */
  language?: string | null;
  /** приложение шлёт свой идентификатор установки: он надёжнее всего */
  installId?: string | null;
};

function pepper(): string {
  return process.env.DEVICE_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-device-secret';
}

/**
 * Отпечаток устройства.
 *
 * Не «уникальный идентификатор человека» и не попытка им стать: сигналов
 * мало, они совпадают у двух одинаковых телефонов, и это нормально.
 * Задача другая — заметить вход с чего-то ЯВНО другого. Ложное «узнал»
 * здесь дешевле ложного «не узнал»: первое пропускает вход без кода,
 * второе шлёт SMS человеку, который ничего не менял.
 *
 * Хеш, а не сами сигналы: список устройств не должен становиться архивом
 * того, чем человек пользуется. IP в отпечаток НЕ входит — он меняется
 * от перехода на мобильный интернет, и каждая такая смена означала бы
 * SMS.
 */
export function fingerprint(signals: DeviceSignals): string {
  if (signals.installId) {
    return createHmac('sha256', pepper()).update(`install:${signals.installId}`).digest('hex');
  }

  const agent = (signals.agent ?? '').slice(0, 200);
  const language = (signals.language ?? '').split(',')[0]?.trim() ?? '';
  return createHmac('sha256', pepper()).update(`ua:${agent}|${language}`).digest('hex');
}

export function signalsFromHeaders(headers: Headers, installId?: string | null): DeviceSignals {
  return {
    agent: headers.get('user-agent'),
    language: headers.get('accept-language'),
    installId: installId ?? headers.get('x-device-id'),
  };
}

/* --------------------------- решение --------------------------- */

export type RiskVerdict = {
  /** спросить код из SMS перед выдачей сессии */
  stepUp: boolean;
  /** это устройство мы видим впервые */
  newDevice: boolean;
  why: 'known' | 'first-device' | 'unknown-device' | 'fail-streak' | 'cannot-verify';
  fingerprint: string;
};

/** Со скольких неудач подряд перед удачей вход считается подозрительным. */
const FAIL_STREAK = 3;

export async function assessLogin(input: {
  accountId: string | null;
  phone: string;
  phoneVerified: boolean;
  signals: DeviceSignals;
}): Promise<RiskVerdict> {
  const fp = fingerprint(input.signals);

  /* Человека без accounts-строки (наследие старого кода) проверить
     нечем: устройств у него нет по определению. */
  if (!input.accountId) {
    return { stepUp: false, newDevice: true, why: 'cannot-verify', fingerprint: fp };
  }

  const [known] = await db
    .select({ id: knownDevices.id })
    .from(knownDevices)
    .where(and(eq(knownDevices.accountId, input.accountId), eq(knownDevices.fingerprint, fp)));

  const fails = await failCount(input.phone);
  const streak = fails >= FAIL_STREAK;

  if (known && !streak) {
    return { stepUp: false, newDevice: false, why: 'known', fingerprint: fp };
  }

  /* Код можно спросить только у того, чей номер подтверждён. У
     остального — вход как раньше, а предложение подтвердить номер ждёт
     его уже внутри кабинета. */
  if (!input.phoneVerified) {
    return { stepUp: false, newDevice: !known, why: 'cannot-verify', fingerprint: fp };
  }

  if (streak) {
    return { stepUp: true, newDevice: !known, why: 'fail-streak', fingerprint: fp };
  }

  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(knownDevices)
    .where(eq(knownDevices.accountId, input.accountId));

  // первое устройство запоминаем молча — см. комментарий наверху файла
  if (n === 0) {
    return { stepUp: false, newDevice: true, why: 'first-device', fingerprint: fp };
  }

  return { stepUp: true, newDevice: true, why: 'unknown-device', fingerprint: fp };
}

/**
 * Запомнить устройство после успешного входа.
 *
 * Зовётся ТОЛЬКО когда вход состоялся целиком, включая подтверждение
 * кодом, если оно потребовалось. Запомни мы устройство раньше — второй
 * запрос с того же браузера прошёл бы уже без кода.
 */
export async function rememberDevice(input: {
  accountId: string;
  fingerprint: string;
  agent?: string | null;
}): Promise<void> {
  await db
    .insert(knownDevices)
    .values({
      accountId: input.accountId,
      fingerprint: input.fingerprint,
      label: deviceLabel(input.agent),
    })
    .onConflictDoUpdate({
      target: [knownDevices.accountId, knownDevices.fingerprint],
      set: { lastSeenAt: new Date() },
    });
}

/**
 * Забыть все устройства человека.
 *
 * После смены PIN и после восстановления: тот, кто увёл аккаунт, мог уже
 * записать своё устройство как знакомое, и оставить список означало бы
 * оставить ему вход без кода.
 */
export async function forgetDevices(accountId: string): Promise<void> {
  await db.delete(knownDevices).where(eq(knownDevices.accountId, accountId));
}

/** Сколько знакомых устройств у человека — для экрана безопасности. */
export async function knownDeviceCount(accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(knownDevices)
    .where(eq(knownDevices.accountId, accountId));
  return row?.n ?? 0;
}

/** Активность за последние сутки — для наблюдаемости. */
export async function recentDevices(accountId: string) {
  return db
    .select()
    .from(knownDevices)
    .where(
      and(
        eq(knownDevices.accountId, accountId),
        gt(knownDevices.lastSeenAt, new Date(Date.now() - 86_400_000)),
      ),
    );
}
