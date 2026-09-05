import { ensureDb } from '@/lib/db/ready';
import { tiersOf } from '@/lib/catalog';
import { listServices, listStaff, startOfDay } from '@/lib/queries';
import { whoIsOnShift } from '@/lib/shifts';
import { listPoints } from '@/lib/accounts';
import { hasPin } from '@/lib/pin';
import { hasOrders } from '@/lib/profile';
import { passesEnabled } from '@/lib/features';
import { authorize, denied } from '@/lib/api/guard';
import { clientIdLabelTerm, serviceNameTerm, staffRoleTerm, unitForms } from '@/lib/i18n/terms';
import { failFromError, ok } from '@/lib/api/respond';
import { IOS_APP_LATEST } from '@/lib/plan';

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

    /* Коллеги приезжают вместе с услугами и по той же причине: их
       спрашивают в момент записи машины, во дворе, где связи может не
       быть. Отдельный запрос за списком людей ровно тогда, когда мойщик
       уже держит телефон мокрыми руками, — это пауза на самом частом
       действии продукта.

       Только имя и id. Ни телефона, ни ставки, ни долга: мойщику нужно
       отметить, с кем он работал, а не изучать чужие условия. */
    const [services, staff, present] = await Promise.all([
      listServices(ctx.tenant.id),
      listStaff(ctx.tenant.id),
      /* Кто сейчас на мойке. Отметить участником можно только его: не
         встал на смену — значит сегодня не работал. То же правило
         проверяет запись, здесь оно только убирает из списка имена, по
         которым всё равно придёт отказ. */
      whoIsOnShift(ctx.tenant.id, startOfDay(ctx.tenant.timezone)),
    ]);

    const onShift = new Set(present.map((p) => p.userId));

    return ok({
      tenant: {
        id: ctx.tenant.id,
        name: ctx.tenant.name,
        currency: ctx.tenant.currency,
        /* Можно ли ещё её сменить. Первая же запись закрывает выбор
           навсегда: суммы лежат в валюте, пересчитать их не по чему. */
        currencyLocked: await hasOrders(ctx.tenant.id),
        locale: ctx.tenant.locale,
        timezone: ctx.tenant.timezone,
        /* Заводские слова ниши приезжают на языке телефона; своё
           название владельца проходит насквозь — см. lib/i18n/terms.ts.
           Приложению по-прежнему не надо знать, что бывают ниши: оно
           получает готовые слова, как и раньше. */
        clientIdLabel: clientIdLabelTerm(ctx.tenant.clientIdLabel, ctx.locale),
        clientIdType: ctx.tenant.clientIdType,
        staffRole: staffRoleTerm(ctx.tenant.staffRole, ctx.locale),
        unitOne: unitForms(ctx.tenant.unitOne, ctx.locale).nom,
        /* Тарифы. Пустой список — свойства у бизнеса нет, и приложение не
           показывает ни ряда классов, ни второй цены. Именно списком, а не
           флагом: слова придумывает владелец, продукт про «седаны» ничего
           не знает и знать не должен. */
        tierLabel: ctx.tenant.tierLabel,
        tiers: tiersOf(ctx.tenant),
      },
      /* Совместная работа: одну машину моют вдвоём-втроём.
       *
       * `percent` — ставка на ВСЮ команду, а не каждому: цена × процент
       * даёт фонд, фонд делится поровну. Null означает, что свойство у
       * бизнеса не включено, и приложение не показывает ни одного нового
       * пикселя — ровно как с тарифами.
       *
       * `members` — активные люди точки, включая смотрящего: убирать
       * себя из списка обязан тот, кто его рисует, а не тот, кто отдаёт,
       * иначе «кроме меня» пришлось бы считать по двум полям. */
      crew: {
        percent: ctx.tenant.teamPercent,
        /* Признак смены, а не отфильтрованный список: «коллег нет вовсе»
           и «все ушли домой» — разные ответы, и экран записи обязан их
           различать. Список при этом переживает потерю связи: он лежит в
           кэше bootstrap, а смены открывают утром и закрывают вечером. */
        members: staff.map((u) => ({
          id: u.id,
          name: u.name,
          onShift: onShift.has(u.id),
        })),
      },
      me: {
        id: ctx.user.id,
        name: ctx.user.name,
        role: ctx.user.role,
        percent: ctx.user.percent,
        notifyOrders: ctx.user.notifyOrders,
        // телефон — это логин, и человек должен видеть, каким он входит
        phone: ctx.user.phone,
        /* Есть ли у человека код вовсе.
         *
         * У заведённых по SMS его нет: входят они кодом из сообщения, и
         * `pin_hash` у них помечен «кода нет» (см. lib/pin.ts). Клиенту
         * это нужно в двух местах, и оба неотвечаемы без признака: в
         * профиле стоит «задать код», а не «сменить», и текущий у такого
         * человека не спрашивают, потому что спрашивать нечего; а
         * подтвердить удаление бизнеса ему нечем, кроме кода из SMS.
         *
         * Сам хеш наружу не уходит ни в каком виде — только этот факт. */
        hasPin: hasPin(ctx.account.pinHash),
        /* Код временный: его выдал админ платформы, когда человеку было
         * нечем войти. Клиент по этому признаку просит сменить код на
         * свой — временный сгорит в свой срок, и человек останется без
         * входа посреди смены, если не сменит его сейчас. */
        tempAccess: ctx.account.tempAccessUntil !== null
          ? ctx.account.tempAccessUntil.toISOString()
          : null,
        /* Доказан ли номер кодом из SMS.
         *
         * Значит ровно одно, и оно важное: восстановить доступ по SMS
         * можно только по подтверждённому номеру — иначе восстановление
         * само стало бы способом забрать чужой непроверенный аккаунт.
         * Поэтому у неподтверждённых приложение предлагает подтвердить, а
         * у остальных не показывает ни одного нового пикселя. */
        phoneVerified: ctx.account.phoneVerifiedAt !== null,
        /* Читал ли человек приветствие первого входа.
           Признак живёт на сервере, а не в памяти телефона: приложение
           переустанавливают, телефон меняют, а владелец, который вчера
           завёл мойку в браузере, сегодня не должен знакомиться с
           продуктом заново (см. lib/onboarding.ts). */
        welcomeSeen: ctx.user.welcomeSeenAt !== null,
        /* Убрано ли «Начало работы» с главной. Нужно одному месту —
           предложению вернуть настройку в разделах: сама она приезжает
           со сводкой, а до сводки в «Ավելին» не доходят. */
        setupHidden: ctx.user.setupHiddenAt !== null,
      },
      access: ctx.access,
      /* Последняя версия приложения в App Store. Старый клиент этого
         поля не знает и просто не читает; новый сравнивает со своей и
         при отставании закрывается стеной обновления. Число живёт в
         lib/plan.ts и меняется только после того, как релиз реально
         доступен в магазине. */
      app: { iosLatest: IOS_APP_LATEST },
      /* Точки человека. Приложение показывает переключатель только когда
         их больше одной — у остальных ни одного нового пикселя. */
      points: await listPoints(ctx.account.id),
      services: services.map((s) => ({
        id: s.id,
        /* Заводские услуги — на языке телефона, названия владельца
           проходят насквозь (см. lib/i18n/terms.ts). */
        name: serviceNameTerm(s.name, ctx.locale),
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
