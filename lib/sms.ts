/**
 * Отправка SMS.
 *
 * Провайдер спрятан за одним интерфейсом намеренно: у операторов в
 * Армении разные API, договор меняют, а переписывать из-за этого
 * авторизацию нельзя. Весь остальной код зовёт `sendSms` и про провайдера
 * не знает ничего.
 *
 * Ключи живут в окружении. Ни один из них не попадает ни в репозиторий,
 * ни в бандл клиента: файл серверный, а значения читаются из
 * `process.env` в момент вызова, а не при импорте, — иначе смена ключа
 * требовала бы пересборки образа.
 *
 * Текста кода в логах нет ни в одной ветке, включая ветку ошибки.
 */

import { env } from './env';
import { isStaging } from './staging';

export type SmsMessage = {
  /** E.164 */
  to: string;
  text: string;
};

export type SmsResult =
  | { ok: true; provider: string }
  | { ok: false; provider: string; reason: string };

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsResult>;
}

/**
 * Провайдер для разработки: код печатается в консоль сервера.
 *
 * Работает ТОЛЬКО когда боевого провайдера не настроено И это либо не
 * production, либо тестовый стенд (`STAGING=1`, см. `lib/staging.ts`).
 * Второе условие — не перестраховка: в бою без ключей должен быть отказ,
 * а не тихая печать кода в логи, которые читает половина команды.
 *
 * Стенд — единственное исключение, и оно оплачено тем, что стенд виден:
 * его метка висит в интерфейсе, а поисковики к нему не допущены. Плата
 * за отказ от исключения была бы выше: каждая проверка входа списывала
 * бы деньги с того же баланса D7, что и боевые регистрации, а значит
 * стенд начали бы проверять реже, чем нужно.
 */
const consoleProvider: SmsProvider = {
  name: 'console',
  async send({ to, text }) {
    console.warn(`[sms:dev] → ${to}\n${text}`);
    return { ok: true, provider: 'console' };
  },
};

/**
 * Twilio.
 *
 * Отдельной функцией, а не через общий шаблон, и это не прихоть: у
 * Twilio HTTP-запрос устроен иначе, чем у большинства. Авторизация
 * Basic, а не Bearer; тело form-urlencoded, а не JSON; успех — 201, а не
 * 200. Подгонять под это `SMS_BODY` пришлось бы обманом, и первая же
 * правка шаблона всё сломала бы.
 *
 *   TWILIO_ACCOUNT_SID   ACxxxxxxxx… из консоли
 *   TWILIO_AUTH_TOKEN    там же, рядом
 *   TWILIO_FROM          имя отправителя `Tetrin` или купленный номер
 *   TWILIO_MESSAGING_SERVICE_SID  (необязательно) MGxxxxxxxx…
 *
 * Про два последних. Пока имя отправителя не зарегистрировано у
 * армянских операторов — а это недели, — в `TWILIO_FROM` кладут
 * купленный у Twilio номер, и всё работает. После регистрации туда
 * пишется `Tetrin`, и это единственная правка.
 *
 * `MessagingServiceSid` сильнее `From`: если он задан, Twilio сам
 * выбирает отправителя из пула. Так удобнее, когда номеров несколько,
 * но обязательным он не является.
 */
function twilioProvider(accountSid: string): SmsProvider {
  return {
    name: 'twilio',
    async send({ to, text }) {
      const token = env('TWILIO_AUTH_TOKEN');
      if (!token) return { ok: false, provider: 'twilio', reason: 'NO_AUTH_TOKEN' };

      const service = env('TWILIO_MESSAGING_SERVICE_SID');
      const from = env('TWILIO_FROM') ?? env('SMS_SENDER');
      if (!service && !from) return { ok: false, provider: 'twilio', reason: 'NO_SENDER' };

      const form = new URLSearchParams({ To: to, Body: text });
      if (service) form.set('MessagingServiceSid', service);
      else form.set('From', from!);

      try {
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString('base64')}`,
            },
            body: form.toString(),
            /* Отправка не должна держать человека дольше нескольких
               секунд: он ждёт экран ввода кода, а не ответ Twilio. */
            signal: AbortSignal.timeout(8000),
          },
        );

        if (response.status === 201) return { ok: true, provider: 'twilio' };

        /* В лог уходит ТОЛЬКО номер ошибки Twilio, не тело ответа: в
           теле лежит поле `body` с отправленным текстом, то есть с самим
           кодом. Номер ошибки при этом говорит всё нужное — 21608
           «непроверенный номер на пробном счету», 21612 «оператор не
           принимает такого отправителя», 20003 «неверный ключ». */
        const failure = (await response.json().catch(() => null)) as { code?: number } | null;
        return {
          ok: false,
          provider: 'twilio',
          reason: failure?.code ? `TWILIO_${failure.code}` : `HTTP_${response.status}`,
        };
      } catch (e) {
        return { ok: false, provider: 'twilio', reason: e instanceof Error ? e.name : 'UNKNOWN' };
      }
    },
  };
}

/**
 * Vonage.
 *
 * Тоже отдельной функцией, и по причине более неприятной, чем у Twilio.
 * Форма запроса чужая — form-urlencoded и Basic, — но главное не это.
 *
 * VONAGE ОТВЕЧАЕТ 200 И НА ОТКАЗ. Настоящий исход лежит внутри тела, в
 * поле `status`: ноль — принято, всё остальное — отказ, от «кончились
 * деньги» до «оператор не пустил отправителя». Наивная проверка
 * `response.ok` считала бы успехом каждый второй провал, и продукт
 * молча показывал бы человеку экран ввода кода, которого ему никто не
 * отправлял. Это тот случай, когда общий шаблон не просто неудобен, а
 * опасен.
 *
 * `type=unicode` обязателен: армянские буквы в GSM-7 не помещаются, и
 * без этого поля вместо кода приезжают вопросительные знаки.
 *
 *   VONAGE_API_KEY
 *   VONAGE_API_SECRET
 *   VONAGE_FROM      имя отправителя `Tetrin` или номер
 */
function vonageProvider(apiKey: string): SmsProvider {
  return {
    name: 'vonage',
    async send({ to, text }) {
      const secret = env('VONAGE_API_SECRET');
      if (!secret) return { ok: false, provider: 'vonage', reason: 'NO_API_SECRET' };

      const from = env('VONAGE_FROM') ?? env('SMS_SENDER') ?? 'Tetrin';

      try {
        const response = await fetch('https://rest.nexmo.com/sms/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            api_key: apiKey,
            api_secret: secret,
            to: to.replace(/^\+/, ''),
            from,
            text,
            type: 'unicode',
          }).toString(),
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return { ok: false, provider: 'vonage', reason: `HTTP_${response.status}` };

        /* Разбираем только `status`, а не всё тело: в ответе есть и
           отправленный текст, то есть сам код. */
        const parsed = (await response.json().catch(() => null)) as {
          messages?: { status?: string }[];
        } | null;

        const status = parsed?.messages?.[0]?.status;
        if (status === '0') return { ok: true, provider: 'vonage' };

        return { ok: false, provider: 'vonage', reason: `VONAGE_${status ?? 'NO_STATUS'}` };
      } catch (e) {
        return { ok: false, provider: 'vonage', reason: e instanceof Error ? e.name : 'UNKNOWN' };
      }
    },
  };
}

/**
 * Обобщённый HTTP-провайдер.
 *
 * Подходит любому оператору, у которого отправка — это один POST с JSON.
 * Шаблон тела задаётся строкой с подстановками `{to}`, `{text}` и
 * `{sender}`, поэтому смена оператора не требует выката кода — даже если
 * поля называются иначе и лежат во вложенных объектах.
 *
 *   SMS_ENDPOINT      https://api.example.am/send
 *   SMS_TOKEN         секрет для заголовка Authorization
 *   SMS_AUTH_SCHEME   слово перед секретом; по умолчанию `Bearer`
 *   SMS_SENDER        имя отправителя
 *   SMS_BODY          {"to":"{to}","from":"{sender}","text":"{text}"}
 *
 * `SMS_AUTH_SCHEME` появился не для красоты: `Bearer` — не единственное
 * слово в ходу. У Infobip это `App`, у кого-то `Basic`, и без этой
 * переменной каждый такой оператор требовал бы своей функции ради одного
 * слова в заголовке.
 *
 * И одно, что стоит помнить, составляя `SMS_BODY`: если у оператора есть
 * поле кодировки, там должен стоять UNICODE, а не «текст» и не
 * «определить самому». Армянские буквы в GSM-7 не существуют, и оператор
 * молча заменяет их вопросительными знаками — сообщение уходит, отчёт
 * говорит «доставлено», а человек получает `????` и шесть цифр. Проверено
 * вживую на D7.
 */
function httpProvider(endpoint: string): SmsProvider {
  return {
    name: 'http',
    async send({ to, text }) {
      const token = env('SMS_TOKEN');
      const scheme = env('SMS_AUTH_SCHEME') ?? 'Bearer';
      const sender = env('SMS_SENDER') ?? 'Tetrin';
      const template =
        env('SMS_BODY') ?? '{"to":"{to}","from":"{sender}","text":"{text}"}';

      /* Подстановка через JSON.stringify каждой части, а не склейкой:
         текст кода содержит перевод строки, и наивная склейка сделала бы
         из тела невалидный JSON — ровно в проде и ровно в тот момент,
         когда SMS нужнее всего. */
      const body = template
        .replace('"{to}"', JSON.stringify(to))
        .replace('{to}', to)
        .replace('"{text}"', JSON.stringify(text))
        .replace('{text}', text.replace(/\n/g, ' '))
        .replace('"{sender}"', JSON.stringify(sender))
        .replace('{sender}', sender);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `${scheme} ${token}` } : {}),
          },
          body,
          /* Отправка не должна держать запрос человека дольше нескольких
             секунд: он ждёт экран ввода кода, а не ответ оператора. */
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
          /* Тело ответа в лог не идёт: некоторые операторы возвращают в
             нём отправленный текст целиком, то есть сам код. */
          return { ok: false, provider: 'http', reason: `HTTP_${response.status}` };
        }
        return { ok: true, provider: 'http' };
      } catch (e) {
        const reason = e instanceof Error ? e.name : 'UNKNOWN';
        return { ok: false, provider: 'http', reason };
      }
    },
  };
}

/**
 * Провайдер для автоматических проверок: код дописывается в файл.
 *
 * Это единственный «тестовый режим OTP» во всём продукте, и сделан он
 * НАРОЧНО так, а не в виде кода-отмычки вроде «000000 всегда подходит».
 * Отмычка живёт в коде проверки кода — то есть ровно там, где однажды
 * забудут условие окружения, и она поедет в бой. Здесь же подменяется
 * доставка: сам код настоящий, случайный, одноразовый, с теми же
 * сроками и счётчиками. Проверка просто читает его из файла вместо
 * телефона.
 *
 * В production невозможно по построению: ветка стоит под явной
 * проверкой окружения, и переменная её не включает.
 */
function sinkProvider(path: string): SmsProvider {
  return {
    name: 'sink',
    async send({ to, text }) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(path, `${JSON.stringify({ to, text, at: Date.now() })}\n`);
      return { ok: true, provider: 'sink' };
    },
  };
}

let resolved: SmsProvider | null = null;

export function smsProvider(): SmsProvider {
  if (resolved) return resolved;

  const sink = env('SMS_TEST_SINK');
  if (sink && (process.env.NODE_ENV !== 'production' || isStaging())) {
    resolved = sinkProvider(sink);
    return resolved;
  }

  /* Именные провайдеры раньше общего шаблона: если заданы оба, значит
     оператора выбрали осознанно, а `SMS_ENDPOINT` остался от прежнего. */
  const twilio = env('TWILIO_ACCOUNT_SID');
  if (twilio) {
    resolved = twilioProvider(twilio);
    return resolved;
  }

  const vonage = env('VONAGE_API_KEY');
  if (vonage) {
    resolved = vonageProvider(vonage);
    return resolved;
  }

  const endpoint = env('SMS_ENDPOINT');
  if (endpoint) {
    resolved = httpProvider(endpoint);
    return resolved;
  }

  if (process.env.NODE_ENV === 'production' && !isStaging()) {
    /* Ни консоли, ни тихого «ок»: в бою неотправленная SMS обязана быть
       видимой ошибкой. Иначе регистрация молча ломается на подтверждении,
       и понять это можно только по жалобам.

       Тестовый стенд сюда не попадает намеренно и проваливается ниже, на
       консольный провайдер: там неотправленная SMS — это норма, а не
       поломка, потому что отправлять её некому и незачем. */
    console.error('[sms] провайдер не настроен: нет ни TWILIO_ACCOUNT_SID, ни VONAGE_API_KEY, ни SMS_ENDPOINT');
    resolved = {
      name: 'none',
      async send() {
        return { ok: false, provider: 'none', reason: 'SMS_NOT_CONFIGURED' };
      },
    };
    return resolved;
  }

  resolved = consoleProvider;
  return resolved;
}

/** Настроена ли отправка по-настоящему. Экран регистрации это учитывает. */
export function smsConfigured(): boolean {
  return smsProvider().name !== 'none';
}

export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  return smsProvider().send(message);
}

/** Только для тестов: подменить провайдера. */
export function __setSmsProvider(provider: SmsProvider | null): void {
  resolved = provider;
}
