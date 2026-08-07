import { ensureDb } from '@/lib/db/ready';
import { tiersOf } from '@/lib/catalog';
import { listServices } from '@/lib/queries';
import { passesEnabled } from '@/lib/features';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Всё, что нужно приложению на старте, одним запросом.
 *
 * Отдельными вызовами это было бы четыре round-trip на связи, которой во
 * дворе мойки может и не быть. Ответ кэшируется на устройстве и работает
 * офлайн: услуги и термины бизнеса меняются редко.
 *
 * Термины отдаются как есть из тенанта — `clientIdLabel`, `unitOne`,
 * `staffRole`. Приложение не должно знать, что бывают ниши: для него это
 * просто слова, которые прислал сервер.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    /* anyPlan: bootstrap — это то, из чего приложение узнаёт своё
       состояние, включая состояние счёта. Закрыть его на просрочке
       значит оставить клиента без ответа на вопрос «что случилось»: он
       увидел бы экран входа вместо объяснения. Всё остальное закрыто. */
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const services = await listServices(ctx.tenant.id);

    return ok({
      tenant: {
        id: ctx.tenant.id,
        name: ctx.tenant.name,
        currency: ctx.tenant.currency,
        locale: ctx.tenant.locale,
        timezone: ctx.tenant.timezone,
        clientIdLabel: ctx.tenant.clientIdLabel,
        clientIdType: ctx.tenant.clientIdType,
        staffRole: ctx.tenant.staffRole,
        unitOne: ctx.tenant.unitOne,
        /* Тарифы. Пустой список — свойства у бизнеса нет, и приложение не
           показывает ни ряда классов, ни второй цены. Именно списком, а не
           флагом: слова придумывает владелец, продукт про «седаны» ничего
           не знает и знать не должен. */
        tierLabel: ctx.tenant.tierLabel,
        tiers: tiersOf(ctx.tenant),
      },
      me: {
        id: ctx.user.id,
        name: ctx.user.name,
        role: ctx.user.role,
        percent: ctx.user.percent,
        notifyOrders: ctx.user.notifyOrders,
        // телефон — это логин, и человек должен видеть, каким он входит
        phone: ctx.user.phone,
      },
      access: ctx.access,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        tierPrices: s.tierPrices ?? null,
        sort: s.sort,
      })),
      features: { passes: passesEnabled() },
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return failFromError(e);
  }
}
