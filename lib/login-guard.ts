import { and, count, eq, gt, lt, max } from 'drizzle-orm';
import { db } from './db';
import { loginAttempts } from './db/schema';

/**
 * Защита входа от перебора.
 *
 * PIN — четыре цифры, то есть 10 000 комбинаций. Пока вход был только в
 * браузере, это терпели; с публичным API такой эндпоинт перебирается за
 * минуты. Поэтому каждая попытка пишется, и после нескольких неудач вход
 * закрывается на растущее время.
 *
 * Считаем по двум осям, и они защищают от разного:
 *   номер — от подбора PIN к одному человеку;
 *   адрес — от перебора номеров подряд, когда PIN пробуют один и тот же.
 *
 * Задержка растёт, а не отсекает намертво: человек, забывший PIN, вернётся
 * через минуту, а перебор становится бессмысленным по времени.
 */

/** Окно, в котором неудачи вообще учитываются. */
const WINDOW_MINUTES = 30;

/** Со скольких неудач подряд начинаем задерживать. */
const FREE_TRIES = 4;

/** Сколько неудач с одного адреса по разным номерам считаем перебором. */
const IP_LIMIT = 25;

/** Через сколько минут после N-й неудачи можно пробовать снова. */
function lockMinutes(fails: number): number {
  if (fails <= FREE_TRIES) return 0;
  const steps = [1, 2, 5, 15, 60];
  return steps[Math.min(fails - FREE_TRIES, steps.length) - 1];
}

export type Guard =
  | { allowed: true }
  /** Ждать столько секунд. Именно секунд: минуты в тексте округлять проще, чем наоборот. */
  | { allowed: false; retryAfter: number };

function since(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

/**
 * Пускать ли к проверке PIN.
 *
 * Вызывается ДО сверки: смысл в том, чтобы дорогой scrypt и сам факт
 * проверки не выполнялись, пока идёт перебор.
 */
export async function checkLogin(phone: string, ip: string | null): Promise<Guard> {
  const from = since(WINDOW_MINUTES);

  // сколько неудач и когда была последняя — одним запросом
  const [byPhone] = await db
    .select({ n: count(), last: max(loginAttempts.at) })
    .from(loginAttempts)
    .where(
      and(eq(loginAttempts.phone, phone), eq(loginAttempts.ok, false), gt(loginAttempts.at, from)),
    );

  const wait = lockMinutes(byPhone?.n ?? 0);

  if (wait > 0 && byPhone?.last) {
    const openAt = new Date(byPhone.last).getTime() + wait * 60_000;
    const left = Math.ceil((openAt - Date.now()) / 1000);
    if (left > 0) return { allowed: false, retryAfter: left };
  }

  if (ip) {
    const [byIp] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(eq(loginAttempts.ip, ip), eq(loginAttempts.ok, false), gt(loginAttempts.at, from)),
      );

    if ((byIp?.n ?? 0) >= IP_LIMIT) {
      return { allowed: false, retryAfter: WINDOW_MINUTES * 60 };
    }
  }

  return { allowed: true };
}

/**
 * Записать исход попытки.
 *
 * Удачный вход тоже пишется и тоже обнуляет счётчик: иначе четыре опечатки
 * за месяц копились бы до блокировки живого человека.
 */
export async function noteLogin(phone: string, ip: string | null, ok: boolean): Promise<void> {
  if (ok) {
    // вход состоялся — прошлые неудачи больше ничего не значат
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.phone, phone), eq(loginAttempts.ok, false)));
  }

  await db.insert(loginAttempts).values({ phone, ip, ok });

  // подчищаем хвост, чтобы таблица не росла вечно; редко, но само
  if (Math.random() < 0.02) {
    await db.delete(loginAttempts).where(lt(loginAttempts.at, since(24 * 60)));
  }
}

/**
 * Адрес запроса. За Caddy настоящий адрес приходит заголовком, поэтому
 * берём первый из цепочки — остальные подставляет кто угодно.
 */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim() || null;
  return headers.get('x-real-ip');
}

/** Сколько неудач числится за номером прямо сейчас — для тестов и диагностики. */
export async function failCount(phone: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.phone, phone),
        eq(loginAttempts.ok, false),
        gt(loginAttempts.at, since(WINDOW_MINUTES)),
      ),
    );
  return row?.n ?? 0;
}
