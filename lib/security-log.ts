import { and, count, eq, gt, lt } from 'drizzle-orm';
import { db } from './db';
import { securityEvents } from './db/schema';

/**
 * Журнал безопасности.
 *
 * До него в продукте нельзя было ответить ни на один вопрос про входы:
 * сколько было неудач, с каких адресов, на сколько разных номеров.
 * `login_attempts` считает попытки, чтобы блокировать, и удаляет их после
 * удачного входа — то есть ровно то, что нужно защите, и ровно не то,
 * что нужно расследованию.
 *
 * СЮДА НЕЛЬЗЯ ПОЛОЖИТЬ СЕКРЕТ, И ЭТО НЕ ПРАВИЛО, А УСТРОЙСТВО. Функция
 * принимает фиксированный набор полей, а свободный `data` проходит через
 * `clean()`: ключи из чёрного списка выбрасываются, длинные строки
 * режутся. Забыть про это, добавляя новое событие, невозможно — другого
 * входа в таблицу нет.
 *
 * Запись никогда не роняет вызывающего. Событие «не удалось войти» не
 * должно превращаться в пятисотку из-за того, что упала вставка в лог.
 */

export type SecurityEvent =
  /* вход */
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.login.throttled'
  | 'auth.login.step_up_required'
  | 'auth.login.new_device'
  /* письма: подтверждение почты и восстановление пароля */
  | 'auth.mail.sent'
  | 'auth.mail.send_failed'
  | 'auth.mail.throttled'
  | 'auth.link.used'
  | 'auth.link.invalid'
  | 'auth.links.swept'
  /** владелец выдал сотруднику пароль */
  | 'auth.password.issued'
  | 'auth.password.changed'
  | 'auth.password.reset.started'
  | 'auth.password.reset'
  | 'auth.email.changed'
  /* код из SMS: канал выключён, имена оставлены ради истории в журнале */
  | 'auth.otp.sent'
  | 'auth.otp.send_failed'
  | 'auth.otp.throttled'
  | 'auth.otp.failed'
  | 'auth.otp.expired'
  | 'auth.otp.verified'
  /* регистрация и восстановление */
  | 'auth.register.started'
  | 'auth.register.completed'
  | 'auth.pin.reset.started'
  | 'auth.pin.reset'
  /** админ выдал временный ПИН */
  | 'auth.pin.temp_issued'
  | 'auth.pin.changed'
  | 'auth.pin.rehashed'
  | 'auth.phone.changed'
  /* сессии */
  | 'auth.session.started'
  | 'auth.session.revoked'
  | 'auth.session.revoked_all'
  | 'auth.logout'
  | 'auth.suspicious_activity'
  /* режим «глазами работника» в сценарии первого запуска: владелец
     получает настоящую сессию своего работника, и такое обязано
     оставлять след */
  | 'auth.preview.started'
  | 'auth.preview.ended'
  /* действия, за которые отвечают деньгами */
  | 'worker.created'
  | 'worker.deleted'
  | 'salary.changed'
  | 'expense.deleted'
  | 'role.changed'
  | 'business.deleted'
  | 'admin.access'
  /* админка платформы */
  | 'admin.login.failed'
  | 'admin.login.step_up'
  | 'admin.login.success'
  | 'admin.logout'
  | 'admin.session.revoked'
  | 'admin.denied'
  | 'admin.action';

export type Level = 'info' | 'warn' | 'alert';

export type EventInput = {
  event: SecurityEvent;
  level?: Level;
  /** нормализованный E.164; для событий, где человек ещё не опознан */
  phone?: string | null;
  accountId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  ip?: string | null;
  agent?: string | null;
  data?: Record<string, unknown>;
};

/* Ключи, которых в журнале не будет никогда — даже если их туда передадут
   по недосмотру. Сверка по подстроке, а не по точному имени: `newPin`,
   `pin_hash` и `refreshToken` должны отсекаться все три. */
const FORBIDDEN = [
  'pin',
  'otp',
  'code',
  'token',
  'secret',
  'password',
  'hash',
  'authorization',
  'cookie',
];

function clean(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN.some((bad) => lower.includes(bad))) continue;
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      out[key] = value.slice(0, 200);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
    // объекты и массивы не пишем: там и прячутся случайные секреты
  }

  return Object.keys(out).length > 0 ? out : null;
}

const LEVEL_BY_DEFAULT: Partial<Record<SecurityEvent, Level>> = {
  'auth.login.failed': 'warn',
  'auth.login.throttled': 'warn',
  'auth.otp.failed': 'warn',
  'auth.otp.throttled': 'warn',
  'auth.otp.send_failed': 'warn',
  'auth.suspicious_activity': 'alert',
  'auth.pin.reset': 'warn',
  'auth.pin.temp_issued': 'warn',
  'auth.phone.changed': 'warn',
  'auth.email.changed': 'warn',
  'auth.mail.send_failed': 'warn',
  'auth.password.reset': 'warn',
  'auth.password.issued': 'warn',
  'auth.session.revoked_all': 'warn',
  'business.deleted': 'alert',
  'role.changed': 'warn',
  'admin.login.failed': 'warn',
  'admin.denied': 'warn',
  'admin.action': 'warn',
};

/**
 * Записать событие.
 *
 * Не ждём результата вставки там, где ответ человеку важнее, — но и не
 * теряем ошибку молча: она уходит в лог сервера. Возвращается промис,
 * чтобы тесты могли дождаться записи.
 */
export async function logSecurity(input: EventInput): Promise<void> {
  try {
    await db.insert(securityEvents).values({
      event: input.event,
      level: input.level ?? LEVEL_BY_DEFAULT[input.event] ?? 'info',
      phone: input.phone ?? null,
      accountId: input.accountId ?? null,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      /* Заголовок браузера в журнале нужен, чтобы отличить «человек сел
         за другой компьютер» от «скрипт ходит по номерам»; для этого
         хватает первой сотни символов, а полная строка бывает длиной в
         абзац. */
      agent: input.agent ? input.agent.slice(0, 120) : null,
      data: clean(input.data),
    });
  } catch (e) {
    console.error('[security-log] не записалось:', input.event, e);
  }
}

/** То же, но без ожидания: для мест, где ответ человеку важнее записи. */
export function logSecurityInBackground(input: EventInput): void {
  void logSecurity(input);
}

/** Короткая метка устройства из заголовка браузера — для списка сеансов. */
export function deviceLabel(agent: string | null | undefined): string | null {
  if (!agent) return null;

  const os = /iPhone|iPad/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /Mac OS X/.test(agent)
        ? 'macOS'
        : /Windows/.test(agent)
          ? 'Windows'
          : /Linux/.test(agent)
            ? 'Linux'
            : null;

  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\//.test(agent)
      ? 'Opera'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Firefox\//.test(agent)
          ? 'Firefox'
          : /Safari\//.test(agent)
            ? 'Safari'
            : null;

  const parts = [browser, os].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ------------------------- наблюдаемость ------------------------- */

/**
 * Сколько таких событий случилось за последние минуты.
 *
 * Ради этого журнал и заводился: «500 неудачных входов за минуту» —
 * вопрос, на который до сих пор ответить было нечем. Полноценного
 * мониторинга здесь нет и не должно быть; есть форма данных, к которой
 * его можно прицепить, и функция, которой пользуются проверки.
 */
export async function countEvents(
  event: SecurityEvent,
  minutes: number,
  where: { phone?: string; ip?: string } = {},
): Promise<number> {
  const from = new Date(Date.now() - minutes * 60_000);
  const filters = [eq(securityEvents.event, event), gt(securityEvents.at, from)];
  if (where.phone) filters.push(eq(securityEvents.phone, where.phone));
  if (where.ip) filters.push(eq(securityEvents.ip, where.ip));

  const [row] = await db
    .select({ n: count() })
    .from(securityEvents)
    .where(and(...filters));

  return row?.n ?? 0;
}

/** Убрать старое. Зовётся из уборки одноразовых кодов, чтобы не плодить расписания. */
export async function pruneSecurityEvents(days = 90): Promise<void> {
  await db
    .delete(securityEvents)
    .where(lt(securityEvents.at, new Date(Date.now() - days * 86_400_000)));
}
