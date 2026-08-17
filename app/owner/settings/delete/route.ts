import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { getTenant } from '@/lib/queries';
import { endSession, getLiveSession } from '@/lib/auth';
import { accountOf } from '@/lib/accounts';
import {
  checkDeleteProof,
  deleteBusiness,
  deleteNeedsCode,
  startDeleteCode,
} from '@/lib/account';
import { clientIp } from '@/lib/login-guard';
import { buildOrdersCsv } from '@/lib/export-csv';
import { getLocale } from '@/lib/i18n/server';

/**
 * Удаление бизнеса из кабинета.
 *
 * Маршрут, а не серверное действие: при выборе «сохранить» ответом должен
 * уйти файл, а действие вернуть файл не умеет.
 *
 * Подтверждение спрашивается заново, хотя в кабинет уже вошли: между
 * «смотрю выручку» и «стёр всё» должно стоять что-то, чего человек за
 * соседним компьютером не знает. Чем подтверждать, решает состояние
 * аккаунта, а не форма (см. `deleteNeedsCode` в lib/account.ts): у кого
 * есть PIN — PIN, у заведённых по SMS — код на их номер. Проверяет то и
 * другое общий код, тот же, которым живёт приложение.
 *
 * Счётчик попыток тот же, что на входе, — иначе форма превращается в
 * тихий способ подобрать PIN владельца.
 *
 * Отличие от приложения — в порядке. На телефоне лист обмена сообщает,
 * сохранил человек файл или передумал, и удаление ждёт этого ответа.
 * У браузера такого сигнала нет: файл и удаление уходят одним ответом.
 * Поэтому CSV собирается ПЕРЕД удалением и целиком в памяти — так между
 * «данные ещё есть» и «файл готов» не остаётся промежутка.
 */
export async function POST(request: Request) {
  await ensureDb();

  const session = await getLiveSession();
  if (!session || session.role !== 'owner') {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const mode = String(form.get('mode') ?? '');
  const keepCopy = mode === 'keep';

  /* Возвращаемся в тот раздел настроек, откуда ушли: форма удаления
     живёт в «бизнесе», и отказ, показанный на прейскуранте, человек не
     увидит вовсе. */
  const back = (params: Record<string, string>) => {
    const url = new URL('/owner/settings', request.url);
    url.searchParams.set('s', 'business');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return Response.redirect(url, 303);
  };

  const [user] = await db.select().from(users).where(eq(users.id, session.uid));
  if (!user) return back({ delete: 'failed' });

  const account = await accountOf(user);
  const ip = clientIp(request.headers);
  const locale = await getLocale();

  /* Шаг первый для тех, у кого кода нет: выслать SMS и вернуться к форме
     с полем кода. Идентификатор заявки едет в адресе — сам по себе он
     ничего не открывает, код приходит на телефон. */
  if (deleteNeedsCode(account) && !String(form.get('challengeId') ?? '')) {
    const started = await startDeleteCode({ account, ip, locale });
    if (!started.ok) {
      return back({ delete: started.problem === 'THROTTLED' ? 'throttled' : 'sms' });
    }
    return back({ delete: 'sent', cid: started.challengeId });
  }

  const proof = await checkDeleteProof({
    account,
    ip,
    pin: String(form.get('pin') ?? '').trim(),
    challengeId: String(form.get('challengeId') ?? '').trim(),
    code: String(form.get('code') ?? '').trim(),
  });

  if (!proof.ok) {
    if (proof.problem === 'THROTTLED') return back({ delete: 'throttled' });
    if (proof.problem === 'WRONG_PIN') return back({ delete: 'pin' });
    /* Заявка сгорела или кончились попытки — возвращаем к самому началу:
       честного пути из этого состояния нет, код нужен новый. */
    if (proof.problem === 'CODE_EXPIRED' || proof.problem === 'CODE_TOO_MANY') {
      return back({ delete: 'codeExpired' });
    }
    if (proof.problem === 'CODE_INVALID') {
      return back({
        delete: 'code',
        cid: String(form.get('challengeId') ?? '').trim(),
      });
    }
    return back({ delete: 'failed' });
  }

  const tenant = await getTenant(session.tid);
  if (!tenant) return back({ delete: 'failed' });

  // собираем архив, пока есть что собирать
  const csv = keepCopy ? await buildOrdersCsv(tenant, 'all', locale) : null;

  const gone = await deleteBusiness(tenant.id);
  await endSession();

  /* Журнал ушёл вместе с бизнесом — единственный след операции
     остаётся в логе сервера. */
  console.warn(`[account] удалён бизнес ${tenant.id} (${tenant.name}), людей: ${gone.people}`);

  if (csv) {
    return new Response(csv.content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csv.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return Response.redirect(new URL('/', request.url), 303);
}
