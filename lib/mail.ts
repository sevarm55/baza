import nodemailer, { type Transporter } from 'nodemailer';

import { env } from './env';
import { isStaging } from './staging';

/**
 * Отправка писем.
 *
 * Пришла на место SMS и по той же причине, по которой SMS ушли: код из
 * SMS зависел от того, пропустит ли армянский оператор буквенного
 * отправителя, и в один день он перестал пропускать молча — квитанция о
 * доставке приходила, письмо до трубки не доходило. Письмо доставляет
 * почтовый ящик, а не оператор, и о недоставке он говорит вслух.
 *
 * Провайдер спрятан за интерфейсом так же, как раньше был спрятан
 * оператор SMS: сегодня это Gmail по SMTP, завтра почтовая служба на
 * своём домене, и переписывать из-за этого регистрацию нельзя.
 *
 * Ключи читаются из окружения в момент вызова, а не при импорте: смена
 * пароля приложения не должна требовать пересборки образа.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** простой текст: его видят почтовики без картинок и читалки экрана */
  text: string;
  /** разметка; необязательна */
  html?: string;
};

export type MailResult =
  | { ok: true; provider: string }
  | { ok: false; provider: string; reason: string };

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}

/**
 * Провайдер для разработки: письмо печатается в консоль сервера целиком.
 *
 * Работает только когда настоящего провайдера нет И это либо не
 * production, либо тестовый стенд. Правило то же, что было у SMS: в бою
 * без ключей должен быть отказ, а не тихая печать ссылки в логи.
 *
 * Ссылку печатаем полностью и намеренно: на стенде и локально она
 * единственный способ пройти регистрацию, а читать её оттуда некому.
 */
const consoleProvider: MailProvider = {
  name: 'console',
  async send({ to, subject, text }) {
    console.warn(`[mail:dev] → ${to}\n${subject}\n${text}`);
    return { ok: true, provider: 'console' };
  },
};

/**
 * Gmail по SMTP.
 *
 *   MAIL_USER      ящик целиком, `tetrin@gmail.com`
 *   MAIL_PASSWORD  пароль ПРИЛОЖЕНИЯ, а не пароль от ящика
 *   MAIL_FROM      что увидит получатель: `Tetrin <tetrin@gmail.com>`
 *
 * Пароль приложения выдаётся в настройках Google при включённой
 * двухфакторке и отзывается там же. Обычный пароль от ящика Google для
 * SMTP не принимает вовсе, и это к лучшему: утечка образа не отдаёт
 * почту целиком.
 *
 * Порт 465 и TLS сразу, а не 587 со STARTTLS: соединение шифруется до
 * первого байта, и нет ветки, в которой сервер согласился говорить
 * открытым текстом.
 *
 * Предел Gmail — порядка 500 писем в сутки. Для подтверждения почты и
 * восстановления пароля это много; когда упрёмся, меняется одна
 * переменная окружения, а не код.
 */
function gmailProvider(user: string): MailProvider {
  let transport: Transporter | null = null;

  return {
    name: 'gmail',
    async send({ to, subject, text, html }) {
      const password = env('MAIL_PASSWORD');
      if (!password) return { ok: false, provider: 'gmail', reason: 'NO_PASSWORD' };

      transport ??= nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass: password },
      });

      try {
        await transport.sendMail({
          from: env('MAIL_FROM') ?? user,
          to,
          subject,
          text,
          html,
        });
        return { ok: true, provider: 'gmail' };
      } catch (error) {
        /* Наружу уходит только код ошибки: в тексте письма лежит ссылка,
           по которой входят, и ей не место в журнале. */
        const reason =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'SEND_FAILED';
        return { ok: false, provider: 'gmail', reason };
      }
    },
  };
}

/** Общий SMTP: любой сервер, если однажды уедем с Gmail. */
function smtpProvider(host: string): MailProvider {
  let transport: Transporter | null = null;

  return {
    name: 'smtp',
    async send({ to, subject, text, html }) {
      const user = env('MAIL_USER');
      const password = env('MAIL_PASSWORD');
      const port = Number(env('MAIL_PORT') ?? 465);

      transport ??= nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && password ? { user, pass: password } : undefined,
      });

      try {
        await transport.sendMail({ from: env('MAIL_FROM') ?? user, to, subject, text, html });
        return { ok: true, provider: 'smtp' };
      } catch (error) {
        const reason =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'SEND_FAILED';
        return { ok: false, provider: 'smtp', reason };
      }
    },
  };
}

let resolved: MailProvider | null = null;

function mailProvider(): MailProvider {
  if (resolved) return resolved;

  const host = env('MAIL_HOST');
  if (host && host !== 'smtp.gmail.com') {
    resolved = smtpProvider(host);
    return resolved;
  }

  const user = env('MAIL_USER');
  if (user) {
    resolved = gmailProvider(user);
    return resolved;
  }

  if (process.env.NODE_ENV === 'production' && !isStaging()) {
    /* Ни консоли, ни тихого «ок»: в бою неотправленное письмо обязано
       быть видимой ошибкой. Иначе регистрация молча ломается на
       подтверждении, и понять это можно только по жалобам. */
    console.error('[mail] провайдер не настроен: нет ни MAIL_HOST, ни MAIL_USER');
    resolved = {
      name: 'none',
      async send() {
        return { ok: false, provider: 'none', reason: 'MAIL_NOT_CONFIGURED' };
      },
    };
    return resolved;
  }

  resolved = consoleProvider;
  return resolved;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  return mailProvider().send(message);
}

/** Настроена ли отправка по-настоящему. Экран регистрации это учитывает. */
export function mailConfigured(): boolean {
  return mailProvider().name !== 'none';
}

/** Только для тестов: подменить провайдера. */
export function __setMailProvider(provider: MailProvider | null): void {
  resolved = provider;
}
