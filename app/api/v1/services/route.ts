import { ensureDb } from '@/lib/db/ready';
import { listServices } from '@/lib/queries';
import { upsertService, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/** Прайс целиком. Цены в минимальных единицах — как везде. */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const rows = await listServices(ctx.tenant.id);
    return ok({
      services: rows.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        tierPrices: s.tierPrices ?? null,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Создать услугу или поправить существующую.
 *
 * Один метод на оба случая: с `id` — правка, без — создание. Так же
 * устроено в кабинете, и логика у них общая — иначе цена, поставленная
 * с телефона, однажды разойдётся с той, что видна в браузере.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ id?: string; name?: string; price?: number; tierPrices?: number[] | null }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const service = await upsertService({
      tenantId: ctx.tenant.id,
      id: str(input.id) || undefined,
      name: str(input.name),
      price: Number(input.price),
      // undefined — не трогать прежние; null — стереть
      tierPrices: input.tierPrices === undefined ? undefined : input.tierPrices,
    });

    return ok(
      {
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          tierPrices: service.tierPrices ?? null,
        },
      },
      201,
    );
  } catch (e) {
    if (e instanceof ValidationError) return fail('BAD_REQUEST', 400, { reason: e.message });
    return failFromError(e);
  }
}
