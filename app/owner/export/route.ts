import { getSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant } from '@/lib/queries';
import { buildOrdersCsv } from '@/lib/export-csv';

/**
 * Выгрузка для кабинета в браузере.
 *
 * Сам файл собирает lib/export-csv.ts — тот же, что отдаёт приложению.
 * Здесь остаётся только проверка прав и заголовки скачивания.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'owner') {
    return new Response('Unauthorized', { status: 401 });
  }
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return new Response('Not found', { status: 404 });

  const raw = new URL(request.url).searchParams.get('days') ?? '30';
  const csv = await buildOrdersCsv(tenant, raw === 'all' ? 'all' : Number(raw));

  return new Response(csv.content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csv.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
