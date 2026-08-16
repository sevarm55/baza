import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { listPoints, markPointUsed } from '../accounts';
import { issueForDevice } from './tokens';

/**
 * Общий хвост входа для приложения: токены, отметка точки, ответ.
 *
 * Один и тот же ответ отдают вход, подтверждение кодом и регистрация —
 * с точки зрения приложения это одно и то же событие «теперь я внутри».
 * Форма ответа — надмножество прежней: старые сборки лишние ключи
 * игнорируют и попадают туда же, куда попадали раньше.
 *
 * Отдельным модулем, а не функцией в route.ts: файл маршрута в Next
 * может экспортировать только методы HTTP, всё остальное там ошибка
 * сборки.
 */
export async function issueSession(input: {
  membership: { id: string; tenantId: string; role: 'owner' | 'staff' };
  accountId: string | null;
  device: string | null;
  after?: () => Promise<void>;
}) {
  const issued = await issueForDevice({
    tenantId: input.membership.tenantId,
    userId: input.membership.id,
    role: input.membership.role,
    device: input.device,
  });

  await markPointUsed(input.membership.id);
  await input.after?.();

  const [me] = await db.select().from(users).where(eq(users.id, input.membership.id));

  return {
    access: issued.access,
    refresh: issued.refresh,
    expiresIn: issued.expiresIn,
    user: { id: me.id, name: me.name, role: me.role, percent: me.percent },
    tenantId: input.membership.tenantId,
    points: input.accountId ? await listPoints(input.accountId) : [],
  };
}
