import { ensureDb } from '@/lib/db/ready';
import { changePin, deletePin, ProfileError } from '@/lib/profile';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { issueForDevice } from '@/lib/api/tokens';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Смена PIN. И его установка впервые.
 *
 * Старый спрашивается обязательно, и тот же счётчик попыток, что на
 * входе: иначе это тихий способ подобрать PIN изнутри уже открытого
 * приложения — без блокировки и без следа в истории входов.
 *
 * ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ: у человека кода нет вовсе. Так живут все, кто
 * завёл мойку по коду из SMS, — `pin_hash` у них помечен «кода нет» (см.
 * lib/pin.ts). Спрашивать у них текущий значит задать вопрос, на который
 * нет верного ответа: `verifyPin` на этой метке отказывает всегда, и
 * второй двери у них не появилось бы никогда. А без второй двери
 * подтвердить нечем и удаление бизнеса.
 *
 * Дыры здесь нет: человек уже вошёл, и сам вход и есть доказательство,
 * что это он. Решает не маршрут, а `changePin` — по хешу в базе, а не по
 * тому, что прислал клиент: присланный признак «у меня нет кода» был бы
 * способом сменить чужой код, не зная старого.
 *
 * После смены все сессии гаснут, включая ту, из которой пришёл запрос, —
 * в этом весь смысл. Но человека, который только что сменил PIN, выкидывать
 * из приложения незачем: сразу выдаём ему новую пару токенов на это
 * устройство. Все остальные телефоны выходят.
 *
 * `anyPlan`: закрыть доступ можно в любом состоянии счёта. Безопасность
 * не должна зависеть от оплаты.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ current?: string; next?: string; device?: string }>(request);
    const current = str(input?.current);
    const next = str(input?.next);
    /* Текущий не обязателен: есть он у человека или нет, знает
       `changePin`, и знает по базе. Пустой при существующем коде там же
       и упрётся в `WRONG_PIN`. */
    if (!next) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const guard = await checkLogin(ctx.user.phone, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    try {
      await changePin(ctx.user.id, current, next);
    } catch (e) {
      if (e instanceof ProfileError && e.message === 'WRONG_PIN') {
        await noteLogin(ctx.user.phone, ip, false);
        return fail('WRONG_CREDENTIALS', 401);
      }
      throw e;
    }
    await noteLogin(ctx.user.phone, ip, true);

    const issued = await issueForDevice({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      role: ctx.user.role === 'owner' ? 'owner' : 'staff',
      device: str(input?.device) || null,
    });

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
    });
  } catch (e) {
    /* «Мало цифр» и «слишком очевидный» — отдельный код ответа, а не
       общий BAD_REQUEST: человек в этот момент придумывает код, и ему
       надо сказать, что именно с ним не так. Тот же `PIN_WEAK`, что
       отдаёт регистрация. */
    if (e instanceof ProfileError) {
      const weak = e.message === 'BAD_PIN' || e.message === 'TRIVIAL_PIN';
      return fail(weak ? 'PIN_WEAK' : 'BAD_REQUEST', 400, { reason: e.message });
    }
    return failFromError(e);
  }
}

/**
 * Убрать код доступа совсем.
 *
 * DELETE, а не `POST { next: null }`: действие ровно одно и оно
 * удаляющее, а маршрут с необязательным полем «а теперь без кода» читался
 * бы как опечатка ровно до того дня, когда её кто-нибудь допустит.
 *
 * Текущий код обязателен и здесь: телефон бывает разблокирован и лежит на
 * мойке, а «убрать вторую дверь» — то, что посторонний рядом сделал бы
 * первым. Счётчик попыток тот же, что на входе.
 *
 * Запертым человек не остаётся: вход по коду из SMS работает на любой
 * номер, а подтверждение удаления бизнеса само переходит на SMS.
 *
 * Все остальные устройства выходят, это устройство остаётся: человек
 * убрал код у себя же, и выкидывать его из приложения за это незачем.
 */
export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ current?: string; device?: string }>(request);
    const current = str(input?.current);
    if (!current) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const guard = await checkLogin(ctx.user.phone, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    try {
      await deletePin(ctx.user.id, current);
    } catch (e) {
      if (e instanceof ProfileError) {
        await noteLogin(ctx.user.phone, ip, false);
        return fail('WRONG_CREDENTIALS', 401);
      }
      throw e;
    }
    await noteLogin(ctx.user.phone, ip, true);

    const issued = await issueForDevice({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      role: ctx.user.role === 'owner' ? 'owner' : 'staff',
      device: str(input?.device) || null,
    });

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
    });
  } catch (e) {
    return failFromError(e);
  }
}
