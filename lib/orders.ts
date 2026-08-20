import { and, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { priceForTier, tierIndexOf, tiersOf } from './catalog';
import { crewOf, crewSplit, MAX_CREW } from './crew';
import { db } from './db';
import {
  audit,
  clients,
  orderItems,
  orderShares,
  orders,
  passes,
  services,
  shifts,
  tenants,
  users,
} from './db/schema';
import { formatMoney } from './money';
import { notifyOwnersInBackground } from './push';
import { normalizeClientKey } from './client-key';
import { startOfDay } from './time';
import { DEFAULT_LOCALE, dict } from './i18n';
import { serviceNameTerm } from './i18n/terms';

export type Payment = 'cash' | 'card' | 'transfer' | 'pass';

export type CreateOrderInput = {
  tenantId: string;
  /** кто вносит запись; он же первый участник работы */
  staffId: string;
  /**
   * Кто ещё мыл эту машину, кроме автора записи.
   *
   * Пусто или не передано — одиночная мойка, всё как раньше до знака.
   * Автора сюда класть не нужно: он участник по определению, и требовать
   * от него отметить самого себя значило бы однажды оставить его без
   * денег за собственную работу.
   *
   * Проверяется здесь, а не в форме: прислать чужой id — вопрос одного
   * запроса мимо интерфейса.
   */
  participantIds?: string[];
  /**
   * Одна услуга. Оставлена ради телефонов со старой версией: в их
   * офлайн-очереди лежат записи этого вида, и они обязаны доехать.
   * Новые записи присылают `serviceIds`.
   */
  serviceId?: string;
  /** Несколько услуг за один заезд: комплекс и химчистка салона. */
  serviceIds?: string[];
  /** номер машины или телефон — то, что ввёл сотрудник */
  clientKey: string;
  payment: Payment;
  /** обязателен при payment: 'pass' */
  passId?: string;
  /** идентификатор с телефона: делает повторную отправку безопасной */
  clientRef?: string;
  /**
   * Тариф — СЛОВОМ, как его видел мойщик («Ջիպ»).
   *
   * Не номером: телефон мог не знать о вчерашней перестановке классов, и
   * номер указал бы на соседний. Слово либо совпадает с одним из тарифов
   * бизнеса, либо не совпадает ни с одним — и тогда цена базовая.
   */
  tier?: string;
  note?: string;
  /**
   * Сколько взяли на самом деле, если меньше прайса.
   *
   * Скидки на мойке дают — постоянному клиенту, за брак, «по-соседски».
   * Пока продукт этого не умел, мойщик выбирал услугу подешевле или не
   * записывал вовсе, и цифры расходились с кассой. А как только они
   * разошлись, продукту перестают верить.
   */
  price?: number;
  /**
   * Язык и валюта уведомления — бизнеса, а не того, кто нажал кнопку.
   *
   * Пуш собирает сервер, спросить человека негде; то же правило уже
   * работает у смен (`openShift`). Оба необязательны и падают на
   * умолчания: запись машины не имеет права сломаться из-за того, что
   * вызывающий не передал язык сообщения.
   */
  locale?: string;
  currency?: string;
};

export class NotFoundError extends Error {}
/** Такая запись уже есть — повторная досылка, не ошибка пользователя. */
export class DuplicateError extends Error {}

/**
 * Создание записи.
 *
 * Три вещи, которые здесь важнее всего:
 *
 * 1. Всё в одной транзакции. Запись без обновлённого клиента или наоборот —
 *    это расхождение цифр, а расхождение цифр убивает доверие к продукту.
 *
 * 2. Цена, название услуги и процент сотрудника пишутся СНИМКОМ.
 *    Владелец поднимет цену в марте — февральская зарплата обязана
 *    остаться прежней.
 *
 * 3. Услуга, сотрудник и абонемент проверяются на принадлежность тенанту.
 *    Server Action можно дёрнуть напрямую POST-запросом с чужим id.
 */
export async function createOrder(input: CreateOrderInput) {
  const key = normalizeClientKey(input.clientKey);
  if (!key) throw new NotFoundError('EMPTY_CLIENT_KEY');
  /* Номер машины — семь знаков, телефон — двенадцать. Всё, что длиннее
     тридцати двух, приходит не от человека: так выглядит вставленный
     мимо поля текст или сорвавшийся сканер. Пустить это в базу значит
     получить в списке клиентов строку на весь экран и такую же в
     выгрузке — а чинить её потом нечем, ключ клиента не правится. */
  if (key.length > 32) throw new NotFoundError('CLIENT_KEY_TOO_LONG');
  if (input.payment === 'pass' && !input.passId) throw new NotFoundError('PASS_REQUIRED');

  const made = await db.transaction(async (tx) => {
    /* Досылка из офлайн-очереди может прийти дважды: телефон не дождался
       ответа и повторил. Ту же запись просто возвращаем — счётчики
       клиента и абонемента при этом не трогаются вообще. */
    if (input.clientRef) {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(
          and(eq(orders.tenantId, input.tenantId), eq(orders.clientRef, input.clientRef)),
        );
      if (existing) {
        /* Состав повторной досылки не пересобираем и не сверяем: доли за
           эту машину уже лежат в базе с первой попытки, и вторая обязана
           быть ровно ничем. */
        return {
          order: existing,
          client: null,
          service: null,
          duplicate: true,
          crew: null,
          shares: null,
        };
      }
    }

    /* Список услуг в порядке, в котором их выбрали: он же порядок строк
       и порядок слов в названии записи. */
    const wanted = input.serviceIds?.length
      ? input.serviceIds
      : input.serviceId
        ? [input.serviceId]
        : [];
    if (wanted.length === 0) throw new NotFoundError('SERVICE_NOT_FOUND');

    const found = await tx
      .select()
      .from(services)
      .where(and(inArray(services.id, wanted), eq(services.tenantId, input.tenantId)));

    /* Порядок восстанавливаем по запросу, а не по тому, как их вернула
       база: «комплекс + химчистка» и «химчистка + комплекс» — это одно и
       то же для денег, но разное для человека, который перечитывает
       список. */
    const picked = wanted.map((id) => found.find((s) => s.id === id));
    if (picked.some((s) => !s)) throw new NotFoundError('SERVICE_NOT_FOUND');
    const chosen = picked as typeof found;

    // первая услуга — та, по которой запись называют и ищут
    const service = chosen[0];

    const [staff] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.staffId), eq(users.tenantId, input.tenantId)));
    if (!staff) throw new NotFoundError('STAFF_NOT_FOUND');

    /* Бизнес читаем здесь, а не ниже у цены: его часовой пояс задаёт
       границу суток, а она нужна уже проверке состава. «Сегодня» на
       мойке в Ереване и на сервере в Германии это разные сутки, и
       считать её по часам сервера значило бы вечером отвергать
       настоящую работу, а ночью принимать вчерашнюю. */
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, input.tenantId));

    /* Состав работы. Автор первым и без права его пропустить; остальные
       приходят снаружи и проверяются здесь по одному.

       Проверка обязана быть на сервере целиком, а не «ещё и на сервере»:
       список коллег рисует форма, но отправить можно что угодно — id
       уволенного, id человека с соседней мойки, id из чужого бизнеса.
       Каждое из трёх означало бы начисление зарплаты тому, кто её не
       заработал, и увидел бы это владелец в лучшем случае в день
       расчёта. */
    const crewIds = crewOf(staff.id, input.participantIds ?? []);
    if (crewIds.length > MAX_CREW) throw new NotFoundError('CREW_TOO_BIG');

    const team = crewIds.length > 1;
    let crew = [staff];

    if (team) {
      const mates = await tx
        .select()
        .from(users)
        .where(
          and(
            inArray(users.id, crewIds),
            /* Свой бизнес и только он. Условие стоит рядом с выборкой, а
               не проверяется потом по результату: забыть его в проверке
               можно, а здесь нечего забывать — чужие строки просто не
               приедут. */
            eq(users.tenantId, input.tenantId),
            /* Уволенный в состав не входит. Его карточка ещё жива —
               людей не удаляют, у них история, — но начислять ему за
               сегодняшнюю работу не за что. */
            eq(users.active, true),
          ),
        );

      /* Порядок восстанавливаем по списку, а не по тому, как их вернула
         база: от порядка зависит, кому достанется лишний драм остатка, и
         он обязан быть тем же, что показала форма. */
      const picked = crewIds.map((id) => mates.find((m) => m.id === id));
      if (picked.some((m) => !m)) throw new NotFoundError('CREW_MEMBER_NOT_FOUND');
      crew = picked as typeof mates;

      /* НА СМЕНЕ, а не просто «числится в бизнесе».
       *
       * Правило то же, по которому человек вообще получает право
       * записывать (`canRecord`): не встал на смену, значит сегодня не
       * работал. Без него совместная запись стала бы способом начислить
       * зарплату тому, кого на мойке не было, и заметил бы это владелец
       * в лучшем случае в день расчёта, а работник, которому долю
       * разделили с отсутствующим, не заметил бы вовсе.
       *
       * Проверка мягкая ровно на один случай, и на тот же, что у автора
       * записи: годится и закрытая сегодня смена. Телефон копит записи
       * без связи и досылает их вечером, когда смены уже закрылись сами;
       * отвергнуть такую досылку значило бы объявить ошибкой настоящую
       * работу. Вчерашняя смена основанием уже не является.
       */
      const dayStart = startOfDay(tenant?.timezone ?? 'UTC');
      const working = await tx
        .select({ userId: shifts.userId })
        .from(shifts)
        .where(
          and(
            eq(shifts.tenantId, input.tenantId),
            inArray(shifts.userId, crewIds),
            or(isNull(shifts.closedAt), gte(shifts.openedAt, dayStart)),
          ),
        );

      const onShift = new Set(working.map((r) => r.userId));
      if (crew.some((m) => !onShift.has(m.id))) {
        throw new NotFoundError('CREW_NOT_ON_SHIFT');
      }
    }

    const now = new Date();

    /* Цену считаем ДО клиента: его итог обязан расти на взятую сумму, а
       не на прайсовую. Иначе скидка раздувала бы историю клиента, и
       «всего оставил 80 000» перестало бы быть правдой. */
    /* Тариф разрешаем по названию и один раз на всю запись: класс машины
       принадлежит машине, а не услуге, и «джип по комплексу, седан по
       химчистке» — это не бизнес-случай, а способ ошибиться. */
    const tierIndex = tenant ? tierIndexOf(tenant, input.tier) : null;
    const tierName = tierIndex == null ? null : tiersOf(tenant!)[tierIndex];

    /* Совместная мойка без настроенной ставки команды — отказ, а не
       «посчитаем чем-нибудь». Подставить сюда личный процент автора
       значило бы, что одна и та же бригада получает разные деньги в
       зависимости от того, чей телефон оказался под рукой. Форма такую
       запись и не предложит; отказ ловит запрос мимо неё. */
    const teamPercent = tenant?.teamPercent ?? null;
    if (team && teamPercent === null) throw new NotFoundError('TEAM_PERCENT_UNSET');

    const listPrice = chosen.reduce((sum, s) => sum + priceForTier(s, tierIndex), 0);
    let price = listPrice;

    /* Скидка — только вниз и только в пределах прайса. Свободное поле
       цены превратило бы запись в место, где сумму назначают, а не
       фиксируют, и контроль, ради которого продукт стоит, исчез бы.
       Наценка — отдельный разговор, здесь её намеренно нет. */
    if (typeof input.price === 'number' && input.payment !== 'pass') {
      const asked = Math.round(input.price);
      if (!Number.isFinite(asked) || asked < 0 || asked > listPrice) {
        throw new NotFoundError('BAD_PRICE');
      }
      price = asked;
    }

    // upsert клиента одним запросом — счётчики не разъедутся при гонке
    const [client] = await tx
      .insert(clients)
      .values({
        tenantId: input.tenantId,
        key,
        visits: 1,
        total: input.payment === 'pass' ? 0 : price,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [clients.tenantId, clients.key],
        set: {
          visits: sql`${clients.visits} + 1`,
          total: sql`${clients.total} + ${input.payment === 'pass' ? 0 : price}`,
          lastSeenAt: now,
        },
      })
      .returning();

    /* Списание с абонемента. Условия проверяются прямо в UPDATE:
       два мойщика могут нажать «абонемент» одновременно, и только один
       из них должен списать последнюю мойку. */
    let passId: string | null = null;

    if (input.payment === 'pass') {
      const [used] = await tx
        .update(passes)
        .set({ usedUses: sql`${passes.usedUses} + 1` })
        .where(
          and(
            eq(passes.id, input.passId!),
            eq(passes.tenantId, input.tenantId),
            eq(passes.clientId, client.id),
            sql`${passes.usedUses} < ${passes.totalUses}`,
            or(isNull(passes.expiresAt), gt(passes.expiresAt, now)),
          ),
        )
        .returning();
      if (!used) throw new NotFoundError('PASS_UNAVAILABLE');

      // выручки нет — деньги пришли при продаже; но мойщику платим
      // от номинала одной мойки внутри абонемента
      price = used.unitPrice;
      passId = used.id;
    }

    /* Зарплату считаем ПОСЛЕ того, как цена окончательна: списание с
       абонемента подменяет её номиналом одной мойки внутри него, и
       посчитанная раньше доля относилась бы к сумме, которой не было.

       Ставка уходит в запись снимком, как цена и название услуги. У
       одиночной мойки это личный процент человека — ровно как до
       совместной; у совместной это ставка команды, то есть весь фонд
       машины. Инвариант «фонд записи = сумма долей» держится в обоих
       случаях, и всё, что считает зарплату бизнеса по записям, продолжает
       считать её верно, ничего не зная про участников. */
    const split = crewSplit({
      price,
      people: crew.length,
      soloPercent: staff.percent,
      teamPercent,
    });

    const [order] = await tx
      .insert(orders)
      .values({
        tenantId: input.tenantId,
        clientId: client.id,
        staffId: staff.id,
        serviceId: service.id,
        serviceName: chosen.map((s) => s.name).join(' + '),
        tier: tierName,
        price,
        listPrice,
        staffPercent: split.percent,
        payment: input.payment,
        passId,
        clientRef: input.clientRef ?? null,
        note: input.note?.trim() || null,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [orders.tenantId, orders.clientRef] })
      .returning();

    // одновременная досылка того же ref: транзакция откатится целиком,
    // и счётчики клиента с абонементом не удвоятся
    if (!order) throw new DuplicateError('DUPLICATE_REF');

    await tx.insert(orderItems).values(
      chosen.map((s, i) => ({
        tenantId: input.tenantId,
        orderId: order.id,
        serviceId: s.id,
        serviceName: s.name,
        price: priceForTier(s, tierIndex),
        sort: i,
      })),
    );

    /* Доли участников — той же транзакцией, что запись. Запись без долей
       это машина, за которую никому не начислено; доли без записи —
       начисление из ниоткуда. Ни то ни другое не должно пережить сбой
       посередине. */
    await tx.insert(orderShares).values(
      crew.map((person, i) => ({
        tenantId: input.tenantId,
        orderId: order.id,
        staffId: person.id,
        earned: split.shares[i],
        sort: i,
      })),
    );

    await tx.insert(audit).values({
      tenantId: input.tenantId,
      userId: staff.id,
      action: 'create',
      entity: 'order',
      entityId: order.id,
      data: {
        key,
        services: chosen.map((s) => s.name),
        price,
        listPrice,
        payment: input.payment,
        /* Состав пишем в журнал только когда мыли вместе: у одиночной
           мойки исполнитель и так назван автором записи, и повторять его
           списком из одного имени значит засорять журнал ровно тем, что
           в нём и так есть. */
        ...(team ? { crew: crew.map((p) => p.name), teamPercent: split.percent } : {}),
      },
    });

    return { order, client, service, duplicate: false, crew, shares: split };
  });

  /* Уведомление шлём ПОСЛЕ транзакции и в фоне.
     После — потому что внутри запись ещё может откатиться, и владелец
     получил бы сообщение о машине, которой нет. В фоне — потому что
     недоступность Apple не должна ронять запись: мойщик стоит с
     телефоном у машины, и его дело важнее нашего уведомления.

     Досылку из очереди не объявляем: `duplicate` означает, что запись
     уже была, и второе сообщение о ней — шум. */
  if (!made.duplicate) {
    /* Язык уведомления — бизнеса, а не того, кто записал машину: читает
       его владелец. Название услуги переводится тем же правилом, что на
       экране: заводское на язык, своё владельца насквозь. */
    const locale = input.locale ?? DEFAULT_LOCALE;
    notifyOwnersInBackground(
      input.tenantId,
      made.order.staffId,
      {
        title: made.client?.key ?? serviceNameTerm(made.order.serviceName, locale),
        // скидку показываем сразу: она всплывает в тот же вечер, а не
        // через месяц при сверке
        body: discountLine(
          serviceNameTerm(made.order.serviceName, locale),
          made.order.price,
          made.order.listPrice,
          locale,
          input.currency,
        ),
        thread: 'orders',
      },
      'orders',
    );
  }

  return made;
}

/**
 * «Комплекс · 4 000 ֏» или «Комплекс · 4 000 ֏ (вместо 5 000 ֏)».
 *
 * Язык — бизнеса (`tenants.locale`), а не того, кто нажал кнопку: пуш
 * собирает сервер, спросить человека негде, и то же правило уже работает
 * у смен (`openShift`). Здесь вторая половина строки была написана
 * по-армянски прямо в коде, и у русского владельца получалось
 * «Комплекс · 4 000 ֏ (5 000-ի փոխարեն)» — половина фразы на чужом
 * языке.
 */
function discountLine(
  service: string,
  price: number,
  listPrice: number | null,
  locale: string,
  currency?: string,
): string {
  const money = (sum: number) => formatMoney(sum, currency, locale);
  const line = `${service} · ${money(price)}`;
  if (listPrice === null || listPrice <= price) return line;
  return `${line} (${dict(locale).push.orderInstead(money(listPrice))})`;
}

/**
 * Изменить состав уже записанной мойки.
 *
 * Нужно ровно для одного случая, и он частый: машину мыли втроём, а
 * записавший отметил двоих. Без правки третий остаётся без денег
 * навсегда, и единственным выходом была бы отмена записи и повторный
 * ввод — то есть потеря времени машины, номера и порядка в ленте ради
 * одной галочки.
 *
 * КАКОЙ ПРОЦЕНТ ПРИМЕНИТЬ. Здесь легко молча переписать историю, поэтому
 * правило узкое:
 *
 *   было вместе, стало вместе — ставка НЕ трогается. Она уже лежит
 *     снимком в записи, и добавление человека делит тот же фонд на
 *     большее число, а не пересчитывает его по сегодняшней настройке.
 *     Ровно этого и ждут: 5 000 на двоих превращаются в 5 000 на троих,
 *     а не в другую сумму, потому что владелец месяц назад правил ставку;
 *
 *   было одному, стало вместе — снимка ставки команды у записи нет и
 *     взяться ему неоткуда, кроме текущей настройки бизнеса;
 *
 *   стало одному — работает личная ставка этого человека, как у любой
 *     одиночной мойки.
 *
 * Состав, совпадающий с нынешним, не делает ничего. Это не оптимизация:
 * пересчёт «на месте» по текущим ставкам был бы способом задним числом
 * поменять зарплату, ни о чём не спросив.
 */
export async function setOrderCrew(params: {
  tenantId: string;
  orderId: string;
  byUserId: string;
  /**
   * Весь состав работы, включая того, кто записал. Порядок значим: по
   * нему раздаётся остаток от деления фонда.
   *
   * Автор записи (`orders.staffId`) при этом не трогается никогда: кто
   * внёс запись — факт прошлого, и правкой состава он не меняется.
   */
  participantIds: string[];
}) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, params.orderId), eq(orders.tenantId, params.tenantId)));
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND');
    /* Отменённая запись не заработала ничего, и делить в ней нечего.
       Разрешив правку, мы бы завели начисления, которые нигде не видны:
       все зарплатные запросы такую запись отбрасывают. */
    if (order.canceledAt) throw new NotFoundError('ORDER_CANCELED');

    const wanted = crewOf(
      String(params.participantIds[0] ?? ''),
      params.participantIds.slice(1),
    ).filter(Boolean);
    if (wanted.length === 0) throw new NotFoundError('CREW_REQUIRED');
    if (wanted.length > MAX_CREW) throw new NotFoundError('CREW_TOO_BIG');

    const mates = await tx
      .select()
      .from(users)
      .where(
        and(
          inArray(users.id, wanted),
          eq(users.tenantId, params.tenantId),
          eq(users.active, true),
        ),
      );
    const picked = wanted.map((id) => mates.find((m) => m.id === id));
    if (picked.some((m) => !m)) throw new NotFoundError('CREW_MEMBER_NOT_FOUND');
    const crew = picked as typeof mates;

    /* На смене В ТОТ ДЕНЬ, а не сегодня.
     *
     * Правку состава владелец делает задним числом: «мыли втроём, а
     * отметили двоих» выясняется вечером или назавтра. Спрашивать при
     * этом сегодняшнюю смену значило бы запретить исправлять вчерашнее —
     * то есть оставить человека без денег ровно в том случае, ради
     * которого правка и заведена.
     *
     * Годится любая смена, пересекающаяся с сутками записи: человек мог
     * выйти до полуночи и уйти после. Тот же отбор, которым история дня
     * показывает, кто в этот день стоял на мойке (`shiftsOnDay`). */
    const zone = (await tx.select().from(tenants).where(eq(tenants.id, params.tenantId)))[0]
      ?.timezone;
    const dayStart = startOfDay(zone ?? 'UTC', order.createdAt);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const working = await tx
      .select({ userId: shifts.userId })
      .from(shifts)
      .where(
        and(
          eq(shifts.tenantId, params.tenantId),
          inArray(shifts.userId, wanted),
          lt(shifts.openedAt, dayEnd),
          or(isNull(shifts.closedAt), gt(shifts.closedAt, dayStart)),
        ),
      );

    const onShift = new Set(working.map((r) => r.userId));
    if (crew.some((m) => !onShift.has(m.id))) {
      throw new NotFoundError('CREW_NOT_ON_SHIFT');
    }

    const was = await tx
      .select()
      .from(orderShares)
      .where(eq(orderShares.orderId, order.id))
      .orderBy(orderShares.sort);

    /* Тот же состав в том же порядке — выходим. Пересчёт здесь означал
       бы правку прошлой зарплаты по сегодняшним ставкам, ни о чём не
       спросив; см. рассуждение над функцией. */
    const same =
      was.length === crew.length && was.every((s, i) => s.staffId === crew[i].id);
    if (same) {
      return {
        order,
        changed: false,
        percent: order.staffPercent,
        pool: was.reduce((sum, s) => sum + s.earned, 0),
      };
    }

    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId));
    const teamPercent = tenant?.teamPercent ?? null;

    const percent =
      crew.length > 1
        ? was.length > 1
          ? order.staffPercent
          : (teamPercent ?? null)
        : crew[0].percent;
    if (percent === null) throw new NotFoundError('TEAM_PERCENT_UNSET');

    const split = crewSplit({
      price: order.price,
      people: crew.length,
      soloPercent: percent,
      teamPercent: percent,
    });

    /* Начисто, а не правкой строк. Состав меняется целиком — кого-то
       убрали, кого-то добавили, — и попытка сопоставить старые строки с
       новыми стоила бы кода ровно для того, чтобы получить тот же
       результат. Осиротевших начислений после этого не остаётся по
       построению: старых строк больше нет. */
    await tx.delete(orderShares).where(eq(orderShares.orderId, order.id));
    await tx.insert(orderShares).values(
      crew.map((person, i) => ({
        tenantId: params.tenantId,
        orderId: order.id,
        staffId: person.id,
        earned: split.shares[i],
        sort: i,
      })),
    );

    const [updated] = await tx
      .update(orders)
      .set({ staffPercent: split.percent })
      .where(eq(orders.id, order.id))
      .returning();

    await tx.insert(audit).values({
      tenantId: params.tenantId,
      userId: params.byUserId,
      action: 'update',
      entity: 'order',
      entityId: order.id,
      data: {
        what: 'crew',
        crew: crew.map((p) => p.name),
        percent: split.percent,
        pool: split.pool,
      },
    });

    return { order: updated, changed: true, percent: split.percent, pool: split.pool };
  });
}

/**
 * Мягкая отмена: запись остаётся в истории и в аудите, но перестаёт
 * попадать в выручку и зарплату. Счётчики клиента откатываются,
 * списанная мойка возвращается в абонемент.
 *
 * Доли участников при этом НЕ удаляются, и это важно: отмена — признак
 * самой записи (`canceledAt`), а все зарплатные запросы ходят к долям
 * через неё. Стирание строк было бы вторым способом отменять, который
 * разойдётся с первым, — а пока способ один, совместная мойка исчезает
 * у всех участников сразу и целиком.
 */
export async function cancelOrder(params: {
  tenantId: string;
  orderId: string;
  byUserId: string;
  /** если задано — отменить можно только запись этого сотрудника */
  onlyOwnedBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, params.orderId),
          eq(orders.tenantId, params.tenantId),
          params.onlyOwnedBy ? eq(orders.staffId, params.onlyOwnedBy) : undefined,
        ),
      );
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND');
    if (order.canceledAt) return order;

    await tx.update(orders).set({ canceledAt: new Date() }).where(eq(orders.id, order.id));

    if (order.clientId) {
      await tx
        .update(clients)
        .set({
          visits: sql`greatest(${clients.visits} - 1, 0)`,
          total: sql`greatest(${clients.total} - ${
            order.payment === 'pass' ? 0 : order.price
          }, 0)`,
        })
        .where(eq(clients.id, order.clientId));
    }

    if (order.passId) {
      await tx
        .update(passes)
        .set({ usedUses: sql`greatest(${passes.usedUses} - 1, 0)` })
        .where(eq(passes.id, order.passId));
    }

    await tx.insert(audit).values({
      tenantId: params.tenantId,
      userId: params.byUserId,
      action: 'cancel',
      entity: 'order',
      entityId: order.id,
      data: { price: order.price, service: order.serviceName },
    });

    return order;
  });
}
