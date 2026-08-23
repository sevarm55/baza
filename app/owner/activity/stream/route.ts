import { getLiveSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { listActivity } from '@/lib/activity';

/**
 * Живой поток ленты: Server-Sent Events.
 *
 * Без отдельной инфраструктуры: сервер раз в несколько секунд
 * спрашивает базу, не появилось ли событий новее последнего, и
 * досылает их. Это дешёвый индексный запрос по (tenant, created_at),
 * и он стоит меньше, чем любой брокер ради одного виджета. Браузер
 * переподключается сам, если соединение оборвалось; при отказе SSE
 * клиент переходит на обычный опрос (см. live-activity.tsx).
 *
 * Поток живёт ограниченное время и закрывается сам: на прокси и
 * балансировщиках вечные соединения умирают тихо, а переподключение
 * раз в несколько минут ничего не стоит.
 */
export const dynamic = 'force-dynamic';

const TICK_MS = 4_000;
const KEEPALIVE_MS = 20_000;
const MAX_LIFE_MS = 5 * 60_000;

export async function GET(request: Request) {
  const session = await getLiveSession();
  if (!session || session.role !== 'owner') {
    return new Response('unauthorized', { status: 401 });
  }
  await ensureDb();

  const url = new URL(request.url);
  const afterRaw = url.searchParams.get('after');
  let after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : new Date();
  const tenantId = session.tid;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      send(`retry: 5000\n\n`);

      const tick = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await listActivity(tenantId, { after, limit: 50 });
          if (rows.length > 0) {
            /* Новые сверху, поэтому самое свежее первое. */
            after = new Date(rows[0].at);
            send(`event: activity\ndata: ${JSON.stringify(rows)}\n\n`);
          }
        } catch {
          /* База моргнула: следующий тик попробует снова. */
        }
      }, TICK_MS);

      const keep = setInterval(() => send(`: keep\n\n`), KEEPALIVE_MS);

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(tick);
        clearInterval(keep);
        clearTimeout(life);
        try {
          controller.close();
        } catch {
          /* уже закрыт */
        }
      };

      const life = setTimeout(stop, MAX_LIFE_MS);
      request.signal.addEventListener('abort', stop);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
