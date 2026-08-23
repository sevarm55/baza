import { ensureDb } from '@/lib/db/ready';
import { archiveService, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, isUuid, noContent } from '@/lib/api/respond';

/** Убрать услугу из прайса. Не удаляем: на неё ссылаются прошлые записи. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    await archiveService({ tenantId: ctx.tenant.id, id, actorId: ctx.user.id });
    return noContent();
  } catch (e) {
    if (e instanceof ValidationError) return fail('NOT_FOUND', 404);
    return failFromError(e);
  }
}
