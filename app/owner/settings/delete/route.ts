import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { getTenant } from '@/lib/queries';
import { endSession, getLiveSession } from '@/lib/auth';
import { accountOf } from '@/lib/accounts';
import { checkDeleteProof, deleteBusiness } from '@/lib/account';
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
 * соседним компьютером не знает. Подтверждают ПАРОЛЕМ — тем же, чем
 * входят. Проверяет его общий код, тот же, которым живёт приложение.
 *
 * Счётчик попыток тот же, что на входе, — иначе форма превращается в
 * тихий способ подобрать пароль владельца.
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

  const proof = await checkDeleteProof({
    account,
    ip,
    password: String(form.get('password') ?? ''),
  });

  if (!proof.ok) {
    if (proof.problem === 'THROTTLED') return back({ delete: 'throttled' });
    return back({ delete: 'password' });
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
