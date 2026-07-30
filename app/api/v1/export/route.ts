import { ensureDb } from '@/lib/db/ready';
import { buildOrdersCsv } from '@/lib/export-csv';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError } from '@/lib/api/respond';

/**
 * Выгрузка для приложения.
 *
 * Отдаёт тот же файл, что и кабинет: собирает его общий модуль. Владелец
 * не должен обнаружить, что выгрузка с телефона отличается от выгрузки
 * с компьютера.
 *
 * Приложение получает CSV и отдаёт его системе — дальше человек сам
 * решает, отправить его себе в почту, положить в «Файлы» или открыть
 * в Excel.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    /* anyPlan: забрать свои данные можно в любом состоянии счёта.
       Выгрузка — не функция тарифа, а право на своё; и без неё выбор
       «сохранить базу» при удалении не работал бы у тех, кому как раз
       и надо уйти. */
    const ctx = await authorize(request, { owner: true, anyPlan: true });
    if (denied(ctx)) return ctx;

    /* days=all — прощальный архив перед удалением аккаунта. Он же
       единственная причина, по которой выгрузка доступна и с закрытой
       подпиской: забрать своё человек вправе в любом состоянии счёта. */
    const raw = new URL(request.url).searchParams.get('days') ?? '30';
    const csv = await buildOrdersCsv(ctx.tenant, raw === 'all' ? 'all' : Number(raw));

    return new Response(csv.content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csv.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return failFromError(e);
  }
}
