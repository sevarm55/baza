import { ensureDb } from '@/lib/db/ready';
import { forgetToken, rememberToken } from '@/lib/push';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent, str } from '@/lib/api/respond';

/**
 * Токен устройства для уведомлений.
 *
 * `anyPlan` намеренно: приложение присылает токен сразу после входа, а
 * вход открыт и на просроченной подписке. Отбивать его там значило бы
 * молча оставить человека без уведомлений после оплаты — до следующего
 * перезапуска приложения.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ token?: string; sandbox?: boolean; platform?: string }>(request);
    const token = str(input?.token);
    if (!token) return fail('BAD_REQUEST', 400);

    await rememberToken({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      accountId: ctx.account.id,
      token,
      /* Платформа приходит от клиента: сам токен о ней не говорит ничего,
         это просто строка. Признаём только известное слово — на всё
         остальное отвечаем 'apns', как вели себя все сборки до Android.
         Чужое значение в этой колонке означало бы токен, который не понесут
         никуда. */
      platform: input?.platform === 'fcm' || input?.platform === 'android' ? 'fcm' : 'apns',
      sandbox: input?.sandbox === true,
    });

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}

/** Выход с устройства: больше сюда не шлём. */
export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ token?: string }>(request);
    const token = str(input?.token);
    if (token) await forgetToken(token);

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
