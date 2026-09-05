import { ensureDb } from '@/lib/db/ready';
import { ProfileError, saveProfile } from '@/lib/profile';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent } from '@/lib/api/respond';

/**
 * Имя человека и название бизнеса.
 *
 * `anyPlan`: поправить своё имя можно и с закрытой подпиской — это не
 * работа, а данные о себе.
 */
export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{
      name?: string;
      businessName?: string;
      currency?: string;
      phone?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    // название бизнеса и валюта общие, а не личные: меняет только владелец
    if (
      (input.businessName !== undefined || input.currency !== undefined) &&
      ctx.user.role !== 'owner'
    ) {
      return fail('FORBIDDEN', 403);
    }

    await saveProfile({
      userId: ctx.user.id,
      tenantId: ctx.tenant.id,
      name: input.name,
      businessName: input.businessName,
      currency: input.currency,
      phone: input.phone,
    });

    return noContent();
  } catch (e) {
    if (e instanceof ProfileError) return fail('BAD_REQUEST', 400, { reason: e.message });
    return failFromError(e);
  }
}
