import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from './db';
import { authChallenges } from './db/schema';
import { env } from './env';
import { logSecurity } from './security-log';

/**
 * Ссылки подтверждения в письме.
 *
 * Пришли на место шестизначных кодов (`lib/otp.ts`), и разница не только
 * в канале. Код из шести цифр приходилось защищать счётчиком попыток:
 * миллион вариантов перебирается за вечер. Секрет в ссылке — тридцать
 * два случайных байта, перебирать его нечем, и счётчика попыток здесь
 * нет вовсе. Зато появилось другое: ссылка лежит в почте и может быть
 * открыта через неделю, поэтому у неё короткий срок и одно применение.
 *
 * Что хранится: только хеш секрета. Sha-256, а не scrypt: секрет и так
 * из криптографического источника и полной энтропии, растягивать его
 * незачем — дорогой хеш защищает слабый секрет, а не сильный.
 *
 * Заявка живёт в той же таблице, что жили коды: у неё уже есть срок,
 * однократность, полезная нагрузка и удаление по времени. Заводить
 * вторую такую же ради другого канала значило бы держать два набора
 * правил протухания.
 */

/** Зачем выдана ссылка. */
export type LinkPurpose = 'register' | 'reset' | 'email_change';

/**
 * Сколько живёт ссылка.
 *
 * Час, а не сутки. Человек, который только что нажал «зарегистрироваться»,
 * идёт в почту сейчас, а не завтра; сутки же означают, что забытое в
 * переписке письмо остаётся ключом целый день. Не успел — попросит новую,
 * это одно нажатие.
 */
const TTL_MINUTES = 60;

/**
 * Пауза между письмами на один адрес.
 *
 * Защищает не нас, а чужой ящик: без неё форма восстановления становится
 * способом завалить письмами любого, чей адрес угадали.
 */
const RESEND_SECONDS = 60;

/** Сколько писем на один адрес за час. */
const HOURLY_LIMIT = 5;

export type StartLink =
  | { ok: true; challengeId: string; token: string; expiresAt: Date; resendAt: Date }
  | { ok: false; reason: 'THROTTLED'; retryAfter: number };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Завести заявку и вернуть секрет для ссылки.
 *
 * Секрет возвращается ровно один раз — здесь. В базу уходит только хеш,
 * и восстановить ссылку по базе нельзя даже нам: потерял письмо — проси
 * новое.
 */
export async function startLink(input: {
  purpose: LinkPurpose;
  email: string;
  payload?: Record<string, unknown>;
  ip: string | null;
}): Promise<StartLink> {
  const email = input.email.trim();
  const now = Date.now();

  /* Сколько писем уже ушло на этот адрес за час. Считаем по адресу, а не
     по IP: с одного IP регистрируются два человека из одной мойки, а вот
     один адрес десять писем за час не просит никогда. */
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int`, last: sql<Date>`max(${authChallenges.createdAt})` })
    .from(authChallenges)
    .where(
      and(
        sql`lower(${authChallenges.email}) = lower(${email})`,
        eq(authChallenges.purpose, input.purpose),
        gt(authChallenges.createdAt, new Date(now - 3600_000)),
      ),
    );

  if (recent && recent.n >= HOURLY_LIMIT) {
    return { ok: false, reason: 'THROTTLED', retryAfter: 3600 };
  }

  if (recent?.last) {
    const wait = RESEND_SECONDS * 1000 - (now - new Date(recent.last).getTime());
    if (wait > 0) {
      return { ok: false, reason: 'THROTTLED', retryAfter: Math.ceil(wait / 1000) };
    }
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + TTL_MINUTES * 60_000);

  const [row] = await db
    .insert(authChallenges)
    .values({
      purpose: input.purpose,
      email,
      phone: null,
      codeHash: hashToken(token),
      payload: input.payload ?? null,
      ip: input.ip,
      nextResendAt: new Date(now + RESEND_SECONDS * 1000),
      expiresAt,
    })
    .returning({ id: authChallenges.id });

  return {
    ok: true,
    challengeId: row.id,
    token,
    expiresAt,
    resendAt: new Date(now + RESEND_SECONDS * 1000),
  };
}

export type VerifyLink<P> =
  | { ok: true; challengeId: string; email: string; payload: P }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' };

/**
 * Сверить секрет из ссылки и погасить заявку.
 *
 * Гасим здесь же, одним запросом с условием `consumed_at is null`: две
 * вкладки, открытые с одной ссылки, не должны обе завести бизнес.
 *
 * Просроченная и уже использованная различаются наружу как EXPIRED и
 * INVALID соответственно — обе одинаково безобидны, а человеку полезно
 * знать, просить ли новую ссылку или он уже вошёл.
 */
export async function verifyLink<P = Record<string, unknown>>(input: {
  token: string;
  purpose: LinkPurpose;
}): Promise<VerifyLink<P>> {
  const token = String(input.token ?? '');
  if (token.length < 20) return { ok: false, reason: 'INVALID' };

  const digest = hashToken(token);

  const [row] = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.codeHash, digest), eq(authChallenges.purpose, input.purpose)))
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: 'INVALID' };

  /* Сравнение постоянного времени, хотя выборка уже шла по равенству:
     стоит оно ничего, а привычка сравнивать секреты через `===`
     переползает потом туда, где цена есть. */
  const a = Buffer.from(digest);
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'INVALID' };

  if (row.consumedAt) return { ok: false, reason: 'INVALID' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };

  const [taken] = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(authChallenges.id, row.id), isNull(authChallenges.consumedAt)))
    .returning({ id: authChallenges.id });

  if (!taken) return { ok: false, reason: 'INVALID' };

  return {
    ok: true,
    challengeId: row.id,
    email: row.email ?? '',
    payload: (row.payload ?? {}) as P,
  };
}

/**
 * Адрес продукта для ссылки в письме.
 *
 * Из окружения, а не из заголовков запроса: `Host` подделывается, и
 * ссылка на подтверждение — ровно то место, куда такую подделку и
 * вставляют. Локально запасное значение указывает на dev-сервер.
 */
export function origin(): string {
  return env('PUBLIC_ORIGIN') ?? 'http://localhost:3000';
}

/** Полная ссылка, которая уйдёт в письме. */
export function linkFor(purpose: LinkPurpose, token: string): string {
  const path = purpose === 'reset' ? '/auth/reset' : '/auth/confirm';
  return `${origin()}${path}?t=${encodeURIComponent(token)}`;
}

/** Убрать протухшие заявки. Зовётся из того же места, что чистило коды. */
export async function sweepLinks(): Promise<number> {
  const gone = await db
    .delete(authChallenges)
    .where(sql`${authChallenges.expiresAt} < now() - interval '1 day'`)
    .returning({ id: authChallenges.id });
  if (gone.length) await logSecurity({ event: 'auth.links.swept', data: { n: gone.length } });
  return gone.length;
}
