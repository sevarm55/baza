import { ensureDb } from '@/lib/db/ready';
import { saveTiers, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Тарифные варианты бизнеса: у мойки — класс машины.
 *
 * Отдельный маршрут, а не поле в профиле: список тарифов меняет прайс
 * целиком, и место ему рядом с прайсом, а не рядом с именем владельца.
 *
 * Пустой список выключает свойство. Один тариф запрещён: один вариант —
 * это отсутствие вариантов, поданное как выбор, и мойщик каждый раз жал бы
 * единственную кнопку.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ label?: string; tiers?: unknown }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const list = Array.isArray(input.tiers) ? input.tiers.map((t) => str(t)) : [];

    const tenant = await saveTiers({
      tenantId: ctx.tenant.id,
      label: str(input.label) || null,
      tiers: list,
    });

    return ok({ tierLabel: tenant.tierLabel, tiers: tenant.tiers ?? [] });
  } catch (e) {
    if (e instanceof ValidationError) return fail('BAD_REQUEST', 400, { reason: e.message });
    return failFromError(e);
  }
}
