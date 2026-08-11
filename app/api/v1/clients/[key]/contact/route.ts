import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { clients } from '@/lib/db/schema';
import { normalizePhone } from '@/lib/phone';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Имя и телефон клиента.
 *
 * Отдельно от записи машины: мойщик вводит номер, услугу и оплату
 * мокрыми руками, с очередью за спиной — просить у него ещё и телефон
 * значит либо получать пустое поле, либо задерживать машину. Владелец
 * заходит в карточку постоянного спокойно и вписывает там.
 *
 * Владельцу и только: телефоны клиентов — это база бизнеса, а не
 * рабочий инструмент мойщика.
 *
 * Пустая строка стирает: человек попросил себя не беспокоить, и
 * выполняться это должно одним движением.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { key } = await params;
    const input = await body<{ name?: string; phone?: string }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const phone = str(input.phone);
    const [row] = await db
      .update(clients)
      .set({
        name: str(input.name) || null,
        phone: phone ? normalizePhone(phone) : null,
      })
      .where(and(eq(clients.tenantId, ctx.tenant.id), eq(clients.key, decodeURIComponent(key))))
      .returning();

    if (!row) return fail('NOT_FOUND', 404);
    return ok({ key: row.key, name: row.name, phone: row.phone });
  } catch (e) {
    return failFromError(e);
  }
}
