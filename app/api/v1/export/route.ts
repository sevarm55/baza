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
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
    const csv = await buildOrdersCsv(ctx.tenant, days);

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
