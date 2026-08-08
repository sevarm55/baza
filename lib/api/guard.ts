import type { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tenants, users, type Account, type Tenant, type User } from '../db/schema';
import { accountOf } from '../accounts';
import { readToken, sessionAlive, type Claims } from '../auth';
import { currentAccess, type Access } from '../subscription';
import { fail } from './respond';

/**
 * Проверка запроса к API.
 *
 * Делает ровно то же, что делают экраны, и в том же порядке: токен →
 * жива ли сессия → состояние подписки → роль. Порядок не случаен: пока
 * непонятно, кто пришёл, спрашивать про подписку нечего.
 *
 * Каждый обработчик зовёт это сам. Общего middleware нет намеренно —
 * с ним легко завести маршрут и забыть его защитить, а тут забыть
 * невозможно: без контекста нет ни tenantId, ни userId.
 */

export type ApiContext = {
  claims: Claims;
  tenant: Tenant;
  /** участие: роль и процент на ЭТОЙ точке */
  user: User;
  /** человек: телефон, код, его точки */
  account: Account;
  access: Access;
};

export type Need = {
  /** нужна ли возможность записывать: просрочка её закрывает */
  write?: boolean;
  /** только владелец */
  owner?: boolean;
  /**
   * Не смотреть на подписку.
   *
   * Нужно ровно одному действию — удалению аккаунта. Отключённый за
   * неуплату владелец обязан иметь возможность уйти и забрать свои
   * данные: иначе блокировка перестаёт быть напоминанием заплатить и
   * становится удержанием чужого.
   */
  anyPlan?: boolean;
};

function bearer(request: Request): string | null {
  const h = request.headers.get('authorization');
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function authorize(
  request: Request,
  need: Need = {},
): Promise<ApiContext | NextResponse> {
  const token = bearer(request);
  if (!token) return fail('UNAUTHORIZED', 401);

  const claims = await readToken(token);
  if (!claims) return fail('UNAUTHORIZED', 401);
  if (!(await sessionAlive(claims))) return fail('UNAUTHORIZED', 401);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, claims.tid));
  const [user] = await db.select().from(users).where(eq(users.id, claims.uid));
  if (!tenant || !user || !user.active) return fail('UNAUTHORIZED', 401);

  /* Участие обязано принадлежать той точке, о которой говорит токен.
     Проверки не было вовсе: доступ держался на том, что токен когда-то
     выписали правильно. Пока у человека была одна мойка, разницы не
     было — теперь старый токен стал бы вечным пропуском в точку, из
     которой человек ушёл. */
  if (user.tenantId !== claims.tid) return fail('UNAUTHORIZED', 401);

  /* Человек, а не участие. Нужен там, где речь о нём самом: его точки,
     его код, его устройство. `ctx.user` остаётся участием — иначе
     пришлось бы править все маршруты разом. */
  const account = await accountOf(user);

  const access = currentAccess(tenant);
  if (!need.anyPlan) {
    if (!access.canRead) return fail('SUBSCRIPTION_BLOCKED', 403);
    if (need.write && !access.canWrite) return fail('SUBSCRIPTION_EXPIRED', 402);
  }
  if (need.owner && user.role !== 'owner') return fail('FORBIDDEN', 403);

  return { claims, tenant, user, account, access };
}

/** Отличить контекст от готового ответа с ошибкой. */
export function denied(x: ApiContext | NextResponse): x is NextResponse {
  return !('claims' in x);
}
