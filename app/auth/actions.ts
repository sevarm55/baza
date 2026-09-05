'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ensureDb } from '@/lib/db/ready';
import { startSession } from '@/lib/auth';
import { clientIp } from '@/lib/login-guard';
import { markPointUsed } from '@/lib/accounts';
import { signalsFromHeaders } from '@/lib/risk';
import { deviceLabel } from '@/lib/security-log';
import { completePasswordReset, completeRegistration } from '@/lib/auth-password';
import { getDict } from '@/lib/i18n/server';

/**
 * Что происходит по ссылке из письма.
 *
 * Отдельным файлом от двери витрины, потому что это другой разговор:
 * здесь человек уже доказал, что ящик его, и осталось одно действие.
 *
 * Оба действия — POST, хотя пришли по ссылке. Открытие страницы ничего
 * не гасит и ничего не создаёт: почтовые антивирусы ходят по ссылкам
 * сами и заранее, и одноразовая ссылка сгорала бы раньше, чем её увидит
 * получатель. Гасит нажатие кнопки.
 */

export type LinkState = { error: string } | null;

/** Подтвердить почту и завести бизнес. */
export async function confirmAction(_prev: LinkState, data: FormData): Promise<LinkState> {
  await ensureDb();
  const t = await getDict();
  const h = await headers();
  const token = String(data.get('token') ?? '');

  const done = await completeRegistration({
    token,
    ip: clientIp(h),
    signals: signalsFromHeaders(h),
  });

  if (!done.ok) {
    return {
      error:
        done.problem === 'LINK_EXPIRED'
          ? t.auth.linkExpired
          : done.problem === 'EMAIL_TAKEN'
            ? t.auth.emailTaken
            : done.problem === 'PHONE_TAKEN'
              ? t.auth.phoneTaken
              : t.auth.linkInvalid,
    };
  }

  await startSession(
    { uid: done.ownerId, tid: done.tenantId, role: 'owner' },
    { kind: 'web', device: deviceLabel(h.get('user-agent')) },
  );
  await markPointUsed(done.ownerId);

  redirect('/owner');
}

/** Задать новый пароль по ссылке восстановления. */
export async function resetAction(_prev: LinkState, data: FormData): Promise<LinkState> {
  await ensureDb();
  const t = await getDict();
  const h = await headers();

  const password = String(data.get('password') ?? '');
  const repeat = String(data.get('repeat') ?? '');
  if (password !== repeat) return { error: t.auth.passwordMismatch };

  const done = await completePasswordReset({
    token: String(data.get('token') ?? ''),
    password,
    ip: clientIp(h),
  });

  if (!done.ok) {
    return {
      error:
        done.problem === 'LINK_EXPIRED'
          ? t.auth.linkExpired
          : done.problem === 'PASSWORD_SHORT'
            ? t.auth.passwordShort
            : done.problem === 'PASSWORD_COMMON'
              ? t.auth.passwordCommon
              : t.auth.linkInvalid,
    };
  }

  /* Внутрь не пускаем: пароль только что сменили, и войти им — это и
     есть проверка, что человек его запомнил, а не закрыл вкладку с
     мыслью «потом посмотрю». */
  redirect('/?auth=signIn&reset=1');
}
