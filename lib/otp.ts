import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { authChallenges, type AuthChallenge } from './db/schema';
import { sendSms } from './sms';
import { logSecurity, logSecurityInBackground } from './security-log';
import { maskPhone } from './phone';
import { CODE_LENGTH } from './otp-shared';
import { env } from './env';
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18n';

/* Телефон в заявке стал обнуляемым: заявку теперь адресуют почтой
   (`lib/email-link.ts`), и у писем номера нет вовсе. Здесь, в коде
   кодов из SMS, пустой номер невозможен по построению — заявку заводит
   `startChallenge`, который без номера не зовут, — но тип этого не
   знает. Пустая строка вместо номера означает «такой заявки нет»: хеш
   по ней не сойдётся ни с чем, а `sendSms` отвергнет пустой адрес.

   Этот модуль доживает до переезда приложения на пароли и уходит
   вместе с ним. */

/**
 * Одноразовые коды.
 *
 * Один модуль на все поводы: регистрация, восстановление PIN,
 * подтверждение с незнакомого устройства, смена номера. Правила у них
 * общие, и держать их в одном месте — единственный способ не забыть срок
 * годности в четвёртом по счёту сценарии.
 *
 * ЧТО ЗДЕСЬ ВАЖНО
 *
 * Код не хранится. В базе лежит HMAC-SHA256 от него на серверном
 * секрете. Не scrypt: шесть цифр живут десять минут и защищены счётчиком
 * попыток, а дорогой хеш на каждую проверку — это способ положить сервер
 * запросами, а не защита. Секрет при этом обязателен: без него хеш
 * миллиона вариантов считается за секунду прямо по дампу базы.
 *
 * Код одноразовый по-настоящему: `consumedAt` ставится в том же UPDATE,
 * который его находит, с условием `consumed_at is null`. Две
 * одновременные проверки одного кода не пройдут обе — вторая не найдёт
 * строку.
 *
 * Новый код гасит предыдущие для той же пары «номер + повод». Иначе
 * человек, нажавший «выслать ещё раз» трижды, имел бы три живых кода, и
 * окно перебора выросло бы втрое.
 *
 * Лимиты стоят на СЕРВЕРЕ. Обратный отсчёт в браузере — украшение; он
 * подсказывает, а не запрещает.
 */

export { CODE_LENGTH };

/** Сколько живёт код. Десять минут — SMS в Армении иногда идёт минуту-две. */
const TTL_MINUTES = 10;

/** Сколько раз можно ошибиться в коде, прежде чем он сгорит. */
const MAX_ATTEMPTS = 5;

/** Сколько раз можно попросить выслать повторно в рамках одной заявки. */
const MAX_RESENDS = 3;

/** Пауза перед повторной отправкой, по номеру попытки. */
const RESEND_COOLDOWN = [45, 90, 180];

/** Сколько кодов на один номер за час — считая все поводы. */
const PER_PHONE_HOURLY = 6;

/** Сколько кодов с одного адреса за час — защита от рассылки по чужим номерам. */
const PER_IP_HOURLY = 20;

/**
 * Зачем выдан код.
 *
 * `entry` — главный вход: телефон и код, без PIN. Один повод и для
 * входа, и для регистрации, и это не экономия на типах, а требование:
 * будь их два, по поводу заявки можно было бы узнать, знаком нам номер
 * или нет. Ровно то, от чего этот вход и защищает.
 */
export type Purpose =
  | 'entry'
  | 'register'
  | 'reset'
  | 'step_up'
  | 'phone_change'
  /**
   * Подтверждение удаления бизнеса тем, у кого нет PIN.
   *
   * Отдельный повод, а не переиспользованный `step_up`, и это не
   * педантизм. Заявки различаются только поводом: возьми мы чужой,
   * незакрытая заявка со входа подошла бы для удаления бизнеса. Код из
   * неё лежит в том же сообщении и на том же телефоне, то есть разница
   * между «войти» и «стереть всё» держалась бы на одном лишь намерении
   * того, кто держит трубку.
   */
  | 'account_delete';

export type StartResult =
  | {
      ok: true;
      challengeId: string;
      /** когда UI разрешит нажать «выслать ещё раз» */
      resendAt: Date;
      expiresAt: Date;
      /** сколько повторов ещё осталось */
      resendsLeft: number;
    }
  | { ok: false; reason: 'THROTTLED'; retryAfter: number }
  | { ok: false; reason: 'SEND_FAILED' };

export type VerifyResult<T = Record<string, unknown>> =
  | { ok: true; challenge: AuthChallenge; payload: T }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'TOO_MANY_TRIES' };

/* --------------------------- секрет --------------------------- */

/**
 * Ключ, которым подписывается код.
 *
 * Отдельная переменная, а не SESSION_SECRET: разные секреты для разных
 * задач — правило, из-за которого утечка одного не отдаёт второе.
 * Но требовать её отдельно в проде значило бы уронить выкат у того, кто
 * обновился и не прочитал changelog, поэтому есть запасной путь: тот же
 * SESSION_SECRET, но пропущенный через собственную метку назначения.
 * Одинаковым с сессионным ключ не станет никогда.
 */
function pepper(): string {
  const own = env('OTP_SECRET');
  if (own) return own;

  const session = env('SESSION_SECRET');
  if (session) return `otp:${session}`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('OTP_SECRET или SESSION_SECRET не задан');
  }
  return 'otp:dev-only-insecure-secret';
}

function hashCode(code: string, phone: string, purpose: Purpose): string {
  /* Номер и повод входят в подпись: хеш кода «123456» для регистрации не
     совпадает с хешем того же кода для восстановления, и перенести его
     между заявками нельзя. */
  return createHmac('sha256', pepper()).update(`${purpose}:${phone}:${code}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Шесть цифр из криптографического источника, а не из Math.random. */
function makeCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/* ------------------------- сообщение -------------------------- */

/**
 * Длина одной SMS, когда в тексте есть армянский или русский.
 *
 * Ни те, ни другие буквы не помещаются в GSM-7, поэтому сообщение
 * кодируется UCS-2, а там в один сегмент влезает 70 символов, а не 160.
 * Всё, что длиннее, оператор режет на части и берёт деньги за каждую.
 */
const ONE_SEGMENT = 70;

/**
 * Текст SMS на языке, который человек выбрал в окне входа.
 *
 * Здесь единственное упоминание кода в открытом виде за весь модуль.
 *
 * ПОЧЕМУ ТАК КОРОТКО И ПОЧЕМУ БЕЗ ССЫЛКИ — две отдельные истории, и обе
 * стоили доставки.
 *
 * Первая про длину. Начальный текст был вежливым и двуязычным сразу:
 * «код подтверждения» на двух языках плюс «никому не сообщайте» тоже на
 * двух. Сто двенадцать символов — это ДВА сегмента и двойная цена за
 * каждый вход, каждую регистрацию и каждое восстановление. По счёту
 * оператора такое замечаешь, только если знаешь, что искать.
 *
 * Вторая про ссылку. В конце стояло `@tetrin.pro #123456` — формат
 * Origin-bound One-Time Codes, по которому Safari подставляет код сам.
 * Красиво и совершенно бесполезно: армянские операторы режут SMS с
 * доменами от незарегистрированных отправителей, и сообщение просто не
 * доходило. Проверено вживую на трёх отправках: тот же отправитель, тот
 * же номер, разница только в этой строке — с ней `un_delivered`, без
 * неё `delivered`.
 *
 * Что осталось:
 *   `Tetrin: 123456` в начале — по нему iOS и Android достают код для
 *   автозаполнения, и это работает без всякого домена;
 *   одна строка «никому не сообщайте» — единственная защита от того,
 *   что код продиктуют по телефону «сотруднику банка».
 *
 * Повод (вход, регистрация, восстановление) не пишем: человек знает,
 * что он только что нажал, а каждое слово здесь стоит места в сегменте.
 */
const SMS_TEXT: Record<Locale, (code: string) => string> = {
  hy: (code) => `Tetrin: ${code}\nՄի փոխանցեք ոչ ոքի`,
  ru: (code) => `Tetrin: ${code}\nНикому не сообщайте`,
  en: (code) => `Tetrin: ${code}\nDo not share this code`,
};

function smsText(code: string, locale: Locale): string {
  const text = (SMS_TEXT[locale] ?? SMS_TEXT[DEFAULT_LOCALE])(code);

  /* Текст правят руками, а лишний символ стоит второго сегмента на
     каждой отправке. Пусть об этом скажут в логах при первой же, чем
     это найдётся в счёте через месяц. */
  if (text.length > ONE_SEGMENT) {
    console.warn(
      `[otp] текст SMS (${locale}) ${text.length} символов — это два сегмента и двойная цена`,
    );
  }

  return text;
}

/**
 * Текст без отправки — только для проверок.
 *
 * Нужен, чтобы регрессия ловила слишком длинный перевод и вернувшуюся
 * ссылку до того, как их увидят люди, а не по счёту оператора.
 */
export function smsPreview(code: string, locale: Locale): string {
  return smsText(code, locale);
}

/* --------------------------- выдача --------------------------- */

async function tooManyRecently(phone: string, ip: string | null): Promise<number | null> {
  const hourAgo = new Date(Date.now() - 3_600_000);

  const [byPhone] = await db
    .select({ n: count() })
    .from(authChallenges)
    .where(and(eq(authChallenges.phone, phone), gt(authChallenges.createdAt, hourAgo)));

  if ((byPhone?.n ?? 0) >= PER_PHONE_HOURLY) return 3600;

  if (ip) {
    const [byIp] = await db
      .select({ n: count() })
      .from(authChallenges)
      .where(and(eq(authChallenges.ip, ip), gt(authChallenges.createdAt, hourAgo)));

    if ((byIp?.n ?? 0) >= PER_IP_HOURLY) return 3600;
  }

  return null;
}

/**
 * Выдать код и отправить его.
 *
 * `payload` — то, что код подтверждает: заявка на регистрацию, id
 * человека для восстановления. Хранится как есть, поэтому класть туда
 * открытые секреты нельзя; вызывающие кладут только уже посчитанный хеш
 * PIN и безобидные поля.
 */
export async function startChallenge(input: {
  purpose: Purpose;
  phone: string;
  payload?: Record<string, unknown>;
  ip?: string | null;
  accountId?: string | null;
  /**
   * Язык человека — тот, что выбран в окне входа.
   *
   * Кладётся в заявку, а не берётся заново при повторной отправке:
   * между «выслать ещё раз» и первой отправкой человек мог сменить
   * язык или вообще уйти на другое устройство, а второй код обязан
   * прийти таким же, как первый.
   */
  locale?: string;
  /**
   * Завести заявку, но SMS не отправлять.
   *
   * Ровно один случай: восстановление PIN по номеру, которого мы не
   * знаем или который не подтверждён. Ответить «такого номера нет»
   * нельзя — форма открыта без входа и стала бы справочником
   * зарегистрированных. Отвечать успехом, но выдавать выдуманный
   * идентификатор, тоже нельзя: следующий шаг ведёт себя иначе, и
   * разница видна — настоящая заявка после пяти ошибок отвечает «слишком
   * много попыток», выдуманная всегда «неверный код».
   *
   * Поэтому заявка настоящая во всём, кроме доставки. Подобрать её код
   * невозможно ровно настолько же, насколько невозможно подобрать любой
   * другой, — а вести себя она будет неотличимо.
   */
  silent?: boolean;
}): Promise<StartResult> {
  const { purpose, phone } = input;
  const ip = input.ip ?? null;

  const throttled = await tooManyRecently(phone, ip);
  if (throttled !== null) {
    await logSecurity({
      event: 'auth.otp.throttled',
      phone,
      ip,
      accountId: input.accountId ?? null,
      data: { purpose },
    });
    return { ok: false, reason: 'THROTTLED', retryAfter: throttled };
  }

  const code = makeCode();
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;
  const now = Date.now();

  /* Прежние живые коды на эту же пару гасим ДО выдачи нового: иначе у
     человека, нажавшего «выслать ещё раз», их становится несколько, и
     перебирать можно любой. */
  await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authChallenges.phone, phone),
        eq(authChallenges.purpose, purpose),
        isNull(authChallenges.consumedAt),
      ),
    );

  const [row] = await db
    .insert(authChallenges)
    .values({
      purpose,
      phone,
      codeHash: hashCode(code, phone, purpose),
      payload: { ...(input.payload ?? {}), __locale: locale },
      ip,
      nextResendAt: new Date(now + RESEND_COOLDOWN[0] * 1000),
      expiresAt: new Date(now + TTL_MINUTES * 60_000),
    })
    .returning();

  const sent = input.silent
    ? ({ ok: true, provider: 'silent' } as const)
    : await sendSms({ to: phone, text: smsText(code, locale) });

  if (!sent.ok) {
    /* Заявку гасим: живая заявка без доставленного кода — это тупик, из
       которого человек выберется только новой попыткой, а счётчик
       повторов будет считать её за использованную. */
    await db.update(authChallenges).set({ consumedAt: new Date() }).where(eq(authChallenges.id, row.id));
    await logSecurity({
      event: 'auth.otp.send_failed',
      phone,
      ip,
      accountId: input.accountId ?? null,
      data: { purpose, provider: sent.provider, reason: sent.reason },
    });
    return { ok: false, reason: 'SEND_FAILED' };
  }

  if (!input.silent) {
    await logSecurity({
      event: 'auth.otp.sent',
      phone,
      ip,
      accountId: input.accountId ?? null,
      data: { purpose, provider: sent.provider, to: maskPhone(phone) },
    });
  }

  void prune();

  return {
    ok: true,
    challengeId: row.id,
    resendAt: row.nextResendAt,
    expiresAt: row.expiresAt,
    resendsLeft: MAX_RESENDS,
  };
}

/**
 * Выслать код повторно по уже начатой заявке.
 *
 * Не то же самое, что новая заявка: `payload` сохраняется, а счётчик
 * повторов растёт и упирается в потолок. Пауза между повторами тоже
 * растёт — 45, 90, 180 секунд.
 */
export async function resendChallenge(input: {
  challengeId: string;
  ip?: string | null;
}): Promise<StartResult> {
  const [row] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.id, input.challengeId));

  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'THROTTLED', retryAfter: 0 };
  }

  const now = Date.now();
  if (row.nextResendAt.getTime() > now) {
    return {
      ok: false,
      reason: 'THROTTLED',
      retryAfter: Math.ceil((row.nextResendAt.getTime() - now) / 1000),
    };
  }

  if (row.resends >= MAX_RESENDS) {
    await logSecurity({
      event: 'auth.otp.throttled',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose: row.purpose, reason: 'MAX_RESENDS' },
    });
    return { ok: false, reason: 'THROTTLED', retryAfter: TTL_MINUTES * 60 };
  }

  const purpose = row.purpose as Purpose;
  const code = makeCode();
  const resends = row.resends + 1;
  const cooldown = RESEND_COOLDOWN[Math.min(resends, RESEND_COOLDOWN.length - 1)];

  /* Новый код замещает прежний В ТОЙ ЖЕ строке, а попытки обнуляются:
     считать ошибки от старого кода против нового нечестно — человек их
     делал не по этому коду. Потолок повторов при этом не обнуляется, он
     и держит общее окно. */
  await db
    .update(authChallenges)
    .set({
      codeHash: hashCode(code, row.phone ?? '', purpose),
      attempts: 0,
      resends,
      nextResendAt: new Date(now + cooldown * 1000),
    })
    .where(eq(authChallenges.id, row.id));

  /* Заявка без доставки остаётся без доставки и на повторе: иначе
     «выслать ещё раз» на незарегистрированном номере отличалось бы от
     первой отправки — то самое различие, ради устранения которого она и
     заводилась. */
  const stored = row.payload as { __silent?: boolean; __locale?: string } | null;
  const silent = stored?.__silent === true;
  const locale: Locale = isLocale(stored?.__locale) ? stored.__locale : DEFAULT_LOCALE;

  const sent = silent
    ? ({ ok: true, provider: 'silent' } as const)
    : await sendSms({ to: row.phone ?? '', text: smsText(code, locale) });
  if (!sent.ok) {
    await logSecurity({
      event: 'auth.otp.send_failed',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose, provider: sent.provider, reason: sent.reason },
    });
    return { ok: false, reason: 'SEND_FAILED' };
  }

  if (!silent) {
    await logSecurity({
      event: 'auth.otp.sent',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose, resend: resends },
    });
  }

  return {
    ok: true,
    challengeId: row.id,
    resendAt: new Date(now + cooldown * 1000),
    expiresAt: row.expiresAt,
    resendsLeft: MAX_RESENDS - resends,
  };
}

/* --------------------------- сверка --------------------------- */

/**
 * Проверить код и сжечь заявку.
 *
 * Успех возможен ровно один раз: `consumedAt` ставится тем же UPDATE,
 * который строку находит, с условием `consumed_at is null`. Гонка двух
 * одинаковых запросов заканчивается тем, что второй не находит строку —
 * а не тем, что оба считают код верным.
 */
export async function verifyChallenge<T = Record<string, unknown>>(input: {
  challengeId: string;
  code: string;
  purpose: Purpose;
  ip?: string | null;
  /**
   * Проверить, но не сжигать.
   *
   * Нужно ровно одному экрану — восстановлению PIN. Там между вводом
   * кода и нажатием «сохранить» стоит ещё один шаг: человек придумывает
   * новый код. Сожги мы заявку на входе в этот шаг — она умрёт, пока он
   * думает, и всё придётся начинать сначала.
   *
   * Одноразовость от этого не страдает: сжигает та проверка, которая
   * действительно что-то меняет, и она идёт последней. Ошибки при
   * подглядывании считаются наравне с обычными — окно перебора не
   * расширяется.
   */
  peek?: boolean;
}): Promise<VerifyResult<T>> {
  const code = String(input.code ?? '').replace(/\D/g, '');

  const [row] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.id, input.challengeId));

  /* Одинаковый ответ на «заявки нет», «повод не тот» и «код неверный»:
     идентификатор заявки виден в браузере, и по разнице ответов можно
     было бы проверять чужие. */
  if (!row || row.purpose !== input.purpose) return { ok: false, reason: 'INVALID' };

  if (row.consumedAt) return { ok: false, reason: 'INVALID' };

  if (row.expiresAt.getTime() < Date.now()) {
    await logSecurity({
      event: 'auth.otp.expired',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose: row.purpose },
    });
    return { ok: false, reason: 'EXPIRED' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.update(authChallenges).set({ consumedAt: new Date() }).where(eq(authChallenges.id, row.id));
    await logSecurity({
      event: 'auth.suspicious_activity',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose: row.purpose, reason: 'OTP_ATTEMPTS_EXHAUSTED' },
    });
    return { ok: false, reason: 'TOO_MANY_TRIES' };
  }

  if (code.length !== CODE_LENGTH || !sameHash(row.codeHash, hashCode(code, row.phone ?? '', row.purpose as Purpose))) {
    const [after] = await db
      .update(authChallenges)
      .set({ attempts: sql`${authChallenges.attempts} + 1` })
      .where(eq(authChallenges.id, row.id))
      .returning({ attempts: authChallenges.attempts });

    await logSecurity({
      event: 'auth.otp.failed',
      phone: row.phone,
      ip: input.ip ?? null,
      data: { purpose: row.purpose, attempt: after?.attempts ?? row.attempts + 1 },
    });

    if ((after?.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_TRIES' };
    return { ok: false, reason: 'INVALID' };
  }

  /* Сжигаем ровно ту строку, которая ещё не сожжена. Пустой результат
     означает, что кто-то успел раньше, — и это отказ, а не успех. */
  const [burned] = input.peek
    ? [row]
    : await db
        .update(authChallenges)
        .set({ consumedAt: new Date() })
        .where(and(eq(authChallenges.id, row.id), isNull(authChallenges.consumedAt)))
        .returning();

  if (!burned) return { ok: false, reason: 'INVALID' };

  await logSecurity({
    event: 'auth.otp.verified',
    phone: row.phone,
    ip: input.ip ?? null,
    data: { purpose: row.purpose },
  });

  return { ok: true, challenge: burned, payload: (burned.payload ?? {}) as T };
}

/** Живая заявка по идентификатору — чтобы экран знал, сколько ещё ждать. */
export async function challengeState(id: string): Promise<{
  phone: string;
  purpose: Purpose;
  resendAt: Date;
  expiresAt: Date;
  resendsLeft: number;
} | null> {
  const [row] = await db.select().from(authChallenges).where(eq(authChallenges.id, id));
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return null;

  return {
    phone: row.phone ?? '',
    purpose: row.purpose as Purpose,
    resendAt: row.nextResendAt,
    expiresAt: row.expiresAt,
    resendsLeft: Math.max(MAX_RESENDS - row.resends, 0),
  };
}

/**
 * Уборка.
 *
 * Просроченные заявки не просто мусор: в `payload` регистрации лежит
 * название бизнеса и хеш кода, и держать это вечно незачем. Заодно
 * подрезаем журнал безопасности — отдельного расписания ради этого
 * заводить не стоит.
 */
let lastPrune = 0;

async function prune(): Promise<void> {
  if (Date.now() - lastPrune < 3_600_000) return;
  lastPrune = Date.now();

  try {
    await db
      .delete(authChallenges)
      .where(lt(authChallenges.expiresAt, new Date(Date.now() - 86_400_000)));

    const { pruneSecurityEvents } = await import('./security-log');
    await pruneSecurityEvents();
  } catch (e) {
    console.error('[otp] уборка не удалась:', e);
  }
}

/** Последняя заявка на номер — для тестов и диагностики. */
export async function lastChallengeFor(phone: string, purpose: Purpose) {
  const [row] = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.phone, phone), eq(authChallenges.purpose, purpose)))
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);
  return row;
}

export const OTP_LIMITS = {
  CODE_LENGTH,
  TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  RESEND_COOLDOWN,
  PER_PHONE_HOURLY,
  PER_IP_HOURLY,
} as const;

export { logSecurityInBackground };
