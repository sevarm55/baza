/**
 * Витринная мойка — та, которую владелец открывает на встрече.
 *
 * Печатает SQL, создающий отдельный бизнес с четырьмя месяцами работы.
 * К базе не подключается: боевой Postgres наружу не смотрит.
 *
 *   npx tsx scripts/demo-showcase.ts > /tmp/showcase.sql
 *   ssh contabo 'docker exec -i bazis-postgres psql -U bazis -d bazis' < /tmp/showcase.sql
 *
 * Чем отличается от `demo-account.ts` и `demo-history.ts`. Те наполняют
 * `Tetrin Դեմո` — демо для ревью App Store, где задача одна: доказать, что
 * приложение не пустое. Здесь задача другая — за пять минут разговора
 * показать хозяину мойки его собственную мойку. Поэтому включено всё, что
 * у него в жизни есть, а у ревьюера смысла не имело:
 *
 *   - классы машин: джип и седан не стоят одинаково, и это первое, что
 *     спрашивают про прайс;
 *   - совместные мойки: машину моют вдвоём, и «кому сколько» — главный
 *     повод для ссоры в бригаде;
 *   - абонементы: постоянный клиент платит один раз за десять моек, и
 *     деньги при этом не должны посчитаться дважды.
 *
 * Аккаунты не пересоздаются: `on conflict do nothing` бережёт PIN, который
 * владелец мог сменить у себя в телефоне. Пересобирается только мойка со
 * всей историей, так что скрипт можно гонять повторно.
 *
 * Срок доступа — 2099 год: демо, упёршееся в «срок истёк» посреди
 * разговора с клиентом, стоит дороже, чем вся встреча.
 */
import { randomUUID } from 'node:crypto';
import { hashPin } from '../lib/pin';

const TENANT = 'Ավտոլվացում Արշակունյաց';

const OWNER = { phone: '+37499855546', name: 'Սևակ', pin: '855546' };
const STAFF = [
  { phone: '+37499000010', name: 'Դավիթ', pin: '445566', percent: 40 },
  { phone: '+37499000011', name: 'Կարեն', pin: '447788', percent: 45 },
];

/* PIN владельца — его собственный, тот же, которым он ходил раньше. Хеш
   приезжает переменной окружения и в репозитории не лежит: это боевой
   аккаунт, а не выдуманный. Не передали — заводится PIN из OWNER.pin, и
   он печатается в конце вместе с остальными. */
const OWNER_PIN_HASH = process.env.OWNER_PIN_HASH ?? '';

/**
 * Ставка команды за совместную мойку — на всю бригаду, а не каждому.
 *
 * Сложить личные проценты двоих нельзя: 40 + 45 отдаёт мойщикам больше
 * трёх четвертей чека. Поэтому у совместной свой процент, и он делится
 * между участниками.
 */
const TEAM_PERCENT = 55;

/** Классы машин и цены по ним. Первая цена — базовая, она же `services.price`. */
const TIER_LABEL = 'Դաս';
const TIERS = ['Սեդան', 'Ջիպ', 'Միկրոավտոբուս'];
/** Доли классов в потоке: седанов большинство, микроавтобус — редкость. */
const TIER_SHARE = [0.62, 0.31, 0.07];

/**
 * Абонементы — по требованию, а не всегда.
 *
 * В продукте раздел спрятан за `PASSES_ENABLED`, и на боевом сервере
 * флага нет. Витрина с проданными абонементами при выключенной фиче
 * получилась бы хуже, чем без них: в ленте и в разбивке оплат всплыл бы
 * способ «абонемент», а открыть и объяснить его было бы негде — гость
 * спрашивает, а показать нечего.
 *
 * Включается тем же прогоном, что и фича: `PASSES=1 npx tsx …`.
 */
const WITH_PASSES = process.env.PASSES === '1';

/** Услуга, на которую продаётся абонемент: самая ходовая в прайсе. */
const PASS_SERVICE = 'Կոմպլեքս';

const services = [
  { name: PASS_SERVICE, prices: [5000, 6500, 8000], weight: 34, long: false },
  { name: 'Թափք', prices: [3000, 3500, 4500], weight: 26, long: false },
  { name: 'Սալոն', prices: [2500, 3000, 4000], weight: 18, long: false },
  { name: 'Քիմմաքրում', prices: [12000, 15000, 18000], weight: 15, long: true },
  { name: 'Փայլեցում', prices: [20000, 25000, 30000], weight: 7, long: true },
];

/**
 * Сколько разных машин знает мойка.
 *
 * Числа здесь важнее, чем кажется. Первая версия крутила все четыре
 * месяца на двадцати номерах, и на экране клиентов выходило по двести
 * пятьдесят визитов на машину — то есть каждая моется дважды в день.
 * Хозяин мойки видит такое сразу: он знает своих клиентов и понимает,
 * что столько не ездит никто.
 *
 * Живая мойка выглядит иначе: небольшое ядро постоянных, которые
 * приезжают раз в неделю, и длинный хвост случайных, заехавших однажды.
 * Отсюда две цифры и деление потока пополам между ними.
 */
const REGULARS = 45;
const PASSERSBY = 700;

/** Имена постоянных клиентов: карточка с именем читается лучше, чем номер. */
const regularNames = [
  'Արմեն', 'Գոռ', 'Հայկ', 'Նարեկ', 'Տիգրան', 'Վահե', 'Արտակ',
  'Սամվել', 'Դավիթ', 'Կարեն', 'Ռուբեն', 'Աշոտ',
];

const MONTHS = 4;
const DAYS = MONTHS * 30 + 15; // с запасом, чтобы накрыть четыре календарных
/** За сколько последних дней заводить живую ленту. */
const FEED_DAYS = 3;

/** Загрузка по дням недели: суббота — пик, понедельник — провал. */
const byWeekday = [1.15, 0.62, 0.78, 0.85, 0.95, 1.1, 1.35];
/** Ход по месяцам: рост, слабый месяц, снова рост. Ровная линия мертва. */
const byMonth = [0.82, 1.0, 0.88, 1.12];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Момент внутри дня N суток назад, в поясе бизнеса. */
const at = (daysAgo: number, minutes: number) =>
  `date_trunc('day', now() at time zone 'Asia/Yerevan') at time zone 'Asia/Yerevan'` +
  ` - interval '${daysAgo} days' + interval '${minutes} minutes'`;

/** mulberry32: детерминированный шум, чтобы прогон повторялся. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const rand = rng(20260828);
  const out: string[] = [];

  const ownerHash = OWNER_PIN_HASH || (await hashPin(OWNER.pin));
  const staffHashes = await Promise.all(STAFF.map((s) => hashPin(s.pin)));

  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const staffIds = STAFF.map(() => randomUUID());
  const serviceIds = services.map(() => randomUUID());

  const acc = (phone: string) => `(select id from accounts where phone = ${q(phone)})`;
  const svcId = (name: string) => serviceIds[services.findIndex((s) => s.name === name)];

  /* Номера армянского вида: две цифры региона, две буквы, три цифры.
     Генерируются, а не перечисляются: их под восемь сотен, и список
     такой длины в исходнике никто не прочитает. Повторы отсеиваются —
     номер в базе уникален на бизнес. */
  const letters = 'ABCDFGHKLMNOPRSTVXZ';
  const seen = new Set<string>();
  const makePlate = () => {
    for (;;) {
      const p =
        `${String(Math.floor(rand() * 95) + 1).padStart(2, '0')} ` +
        `${letters[Math.floor(rand() * letters.length)]}${letters[Math.floor(rand() * letters.length)]} ` +
        `${String(Math.floor(rand() * 999) + 1).padStart(3, '0')}`;
      if (!seen.has(p)) {
        seen.add(p);
        return p;
      }
    }
  };
  const regularPlates = Array.from({ length: REGULARS }, makePlate);
  const passerbyPlates = Array.from({ length: PASSERSBY }, makePlate);

  out.push(`\\set ON_ERROR_STOP on
begin;

-- Прошлый прогон витрины уходит целиком: заказы, клиенты, смены и выплаты
-- висят на tenant_id каскадом. Учётки при этом остаются — см. ниже.
delete from tenants where name = ${q(TENANT)};`);

  out.push(`
-- Люди заводятся раньше участия: телефон и PIN принадлежат человеку, а
-- строка в users — только его работе на этой мойке.
--
-- do nothing, а не do update: владелец мог сменить свой PIN в приложении,
-- и повторный прогон витрины не имеет права откатить это за него.
--
-- Номер владельца подтверждён — он живой, SMS на него доходит. Номера
-- мойщиков НЕ подтверждены, и это главное здесь.
--
-- Подтверждённый номер включает проверку по SMS при входе с незнакомого
-- устройства (assessLogin: первое устройство запоминается молча, второе
-- уже требует код). Демо-мойщики живой трубки не имеют, код ушёл бы в
-- никуда — и показать экран работника со второго телефона стало бы
-- нельзя. Ровно та ловушка, на которой Apple не вошла в демо: дверь
-- исправна, а код взять негде.
insert into accounts (phone, pin_hash, phone_verified_at) values
  (${q(OWNER.phone)}, ${q(ownerHash)}, now()),
${STAFF.map((s, i) => `  (${q(s.phone)}, ${q(staffHashes[i])}, null)`).join(',\n')}
on conflict (phone) do nothing;`);

  out.push(`
insert into tenants (
  id, name, niche, client_id_label, client_id_type, staff_role, unit_one,
  tier_label, tiers, team_percent, plan, paid_until
) values (
  ${q(tenantId)}, ${q(TENANT)}, 'carwash', ${q('Պետհամարանիշ')}, 'plate',
  ${q('Լվացող')}, ${q('մեքենա')},
  ${q(TIER_LABEL)}, ${q(JSON.stringify(TIERS))}::jsonb, ${TEAM_PERCENT},
  'active', timestamptz '2099-01-01 00:00:00+04'
);`);

  out.push(`
insert into users (id, tenant_id, account_id, phone, pin_hash, name, role, percent) values
  (${q(ownerId)}, ${q(tenantId)}, ${acc(OWNER.phone)}, ${q(OWNER.phone)},
   (select pin_hash from accounts where phone = ${q(OWNER.phone)}), ${q(OWNER.name)}, 'owner', 0),
${STAFF.map(
  (s, i) =>
    `  (${q(staffIds[i])}, ${q(tenantId)}, ${acc(s.phone)}, ${q(s.phone)},` +
    ` (select pin_hash from accounts where phone = ${q(s.phone)}), ${q(s.name)}, 'staff', ${s.percent})`,
).join(',\n')};`);

  out.push(`
-- Цены по классам: массив в порядке tenants.tiers, первая цена дублирует
-- базовую. Короче списка классов — недостающие берутся из price.
insert into services (id, tenant_id, name, price, tier_prices, sort) values
${services
  .map(
    (s, i) =>
      `  (${q(serviceIds[i])}, ${q(tenantId)}, ${q(s.name)}, ${s.prices[0]},` +
      ` ${q(JSON.stringify(s.prices))}::jsonb, ${i})`,
  )
  .join(',\n')};`);

  /* ── записи ── */
  type Client = {
    id: string;
    name: string | null;
    visits: number;
    total: number;
    /** сутки назад: когда машину увидели впервые и в последний раз */
    firstAgo: number;
    lastAgo: number;
  };
  const clients = new Map<string, Client>();
  const orderRows: string[] = [];
  const shareRows: string[] = [];
  /** наличные по дню и мойщику — из них считается сдача смены */
  const cashBy = new Map<string, number>();
  /** абонементы: сколько моек по каждому уже использовано */
  const passUses: { passId: string; clientKey: string; used: number }[] = [];
  /** строки живой ленты за последние дни */
  const feedRows: string[] = [];

  const pickService = () => {
    const total = services.reduce((n, s) => n + s.weight, 0);
    let r = rand() * total;
    for (const s of services) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return services[0];
  };

  const pickTier = () => {
    let r = rand();
    for (let i = 0; i < TIER_SHARE.length; i++) {
      r -= TIER_SHARE[i];
      if (r <= 0) return i;
    }
    return 0;
  };

  /* Абонементы продаются постоянным клиентам месяц назад: к сегодняшнему
     дню часть моек израсходована, часть осталась — только так виден смысл
     остатка на карточке. Десять моек по цене восьми. */
  const passClients = WITH_PASSES ? regularPlates.slice(0, 3) : [];
  const passes = passClients.map((plate) => ({
    id: randomUUID(),
    plate,
    total: 10,
    price: 5000 * 8,
    unit: Math.floor((5000 * 8) / 10),
    soldDaysAgo: 30 + Math.floor(rand() * 20),
  }));
  const passByPlate = new Map(passes.map((p) => [p.plate, p]));

  /* Сегодняшний день здесь не наполняется — он растёт по часам, из
     `infra/showcase-topup.sql`.

     Причина в том, что скрипт печатает SQL заранее, а исполняется он
     неизвестно когда. Заезды, назначенные на весь день, при накатке в
     полдень пришлось бы обрезать по «сейчас» — и половина дня легла бы
     одной минутой: столб на графике, полтора десятка одинаковых времён
     в ленте. Живой день так не выглядит. */
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(Date.now() - daysAgo * 86_400_000);
    const monthBucket = Math.min(MONTHS - 1, Math.floor((DAYS - daysAgo) / 30));
    const load = byWeekday[day.getDay()] * byMonth[monthBucket];

    // 12–34 машины в день с шумом
    const cars = Math.max(6, Math.round(18 * load + (rand() - 0.5) * 7));

    for (let i = 0; i < cars; i++) {
      /* Половина потока — свои, половина — заехавшие мимо. Так у ядра
         набирается история визитов, а у хвоста остаётся один-два заезда:
         ровно то, что владелец видит у себя на мойке. */
      const regular = rand() < 0.5;
      const plateIndex = Math.floor(rand() * (regular ? REGULARS : PASSERSBY));
      const plate = regular ? regularPlates[plateIndex] : passerbyPlates[plateIndex];

      let c = clients.get(plate);
      if (!c) {
        c = {
          id: randomUUID(),
          /* Имена — только у первых постоянных: владелец подписывает тех,
             кого знает, а не всю базу. Пустое имя показывает номер, и это
             честная картина мойки, а не заполненная анкета. */
          name: regular && plateIndex < regularNames.length ? regularNames[plateIndex] : null,
          visits: 0,
          total: 0,
          firstAgo: daysAgo,
          lastAgo: daysAgo,
        };
        clients.set(plate, c);
      }

      /* Мойка по абонементу: денег в кассу не приходит — они пришли в день
         продажи, — но машина помыта и мойщику причитается процент от
         номинала одной мойки. Считать выручку второй раз нельзя, это и
         есть главная ловушка абонемента.

         Человек с абонементом им и моется: он за это заплатил вперёд.
         Поэтому услуга здесь не выпадает случайно, а берётся из самого
         абонемента — иначе на купленных десяти мойках к показу стояло бы
         «использовано 0», и раздел выглядел бы мёртвым. */
      const pass = passByPlate.get(plate);
      const passLeft = pass ? pass.total - (passUses.find((u) => u.passId === pass.id)?.used ?? 0) : 0;
      const usePass =
        pass != null &&
        daysAgo < pass.soldDaysAgo &&
        passLeft > 3 && // три мойки остаются неизрасходованными: остаток должен быть виден
        rand() < 0.85;

      const svc = usePass ? services.find((s) => s.name === PASS_SERVICE)! : pickService();
      const tier = pickTier();
      const listPrice = svc.prices[tier];

      /* Раз в двадцатую запись — скидка, иначе цена по прайсу мертва.
         Округляется до сотни: «2 125 драм» на мойке не берут ни с кого. */
      const discount = !usePass && rand() < 0.05;
      const price = usePass
        ? pass!.unit
        : discount
          ? Math.round((listPrice * 0.85) / 100) * 100
          : listPrice;

      /* Длинную работу — химчистку и полировку — часто делают вдвоём.
         Это и есть тот случай, ради которого существует общий процент. */
      const together = svc.long && rand() < 0.45;

      const r = rand();
      // владелец иногда моет сам, но редко: у него процент ноль
      const who = together ? -1 : r < 0.45 ? 0 : r < 0.9 ? 1 : 2;
      const percent = together ? TEAM_PERCENT : who === 0 ? STAFF[0].percent : who === 1 ? STAFF[1].percent : 0;
      // автор записи: у совместной это первый из бригады
      const authorId = together ? staffIds[0] : who === 2 ? ownerId : staffIds[who];

      const p = rand();
      const payment = usePass ? 'pass' : p < 0.45 ? 'cash' : p < 0.85 ? 'card' : 'transfer';

      // заезды с 9:00 до 20:00, гуще к вечеру
      const minutes = Math.round(540 + rand() ** 0.8 * 660);

      c.visits += 1;
      c.total += price;
      /* Дни первого и последнего заезда. Без них обе даты встают в момент
         накатки, и на экране клиентов вся база «была сегодня»: раздел
         «давно не были» пуст, а он и есть повод позвонить. */
      c.firstAgo = Math.max(c.firstAgo, daysAgo);
      c.lastAgo = Math.min(c.lastAgo, daysAgo);

      if (usePass) {
        const u = passUses.find((x) => x.passId === pass!.id);
        if (u) u.used += 1;
        else passUses.push({ passId: pass!.id, clientKey: plate, used: 1 });
      }

      /* Наличные спрашиваются с автора записи: деньги взял тот, кто их
         взял. Делится потом заработок, а не касса. */
      if (payment === 'cash' && authorId !== ownerId) {
        const key = `${daysAgo}|${authorId}`;
        cashBy.set(key, (cashBy.get(key) ?? 0) + price);
      }

      const orderId = randomUUID();
      const when = at(daysAgo, minutes);

      orderRows.push(
        `  (${q(orderId)}, ${q(tenantId)}, ${q(c.id)}, ${q(authorId)}, ${q(svcId(svc.name))}, ` +
          `${q(svc.name)}, ${q(TIERS[tier])}, ${price}, ${listPrice}, ${percent}, ${q(payment)}, ` +
          `${usePass ? q(pass!.id) : 'null'}, ${when})`,
      );

      /* Доли. У одиночной мойки она одна и равна прежней формуле. У
         совместной фонд делится поровну, остаток от деления раздаётся по
         одному драму сверху вниз — иначе один драм пропадал бы, и суммы
         в ведомости не сходились бы с начисленным. */
      const fund = Math.floor((price * percent) / 100);
      if (together) {
        const each = Math.floor(fund / 2);
        const rest = fund - each * 2;
        shareRows.push(
          `  (${q(tenantId)}, ${q(orderId)}, ${q(staffIds[0])}, ${each + rest}, 0)`,
          `  (${q(tenantId)}, ${q(orderId)}, ${q(staffIds[1])}, ${each}, 1)`,
        );
      } else {
        shareRows.push(`  (${q(tenantId)}, ${q(orderId)}, ${q(authorId)}, ${fund}, 0)`);
      }

      /* Живая лента. Пишется только за последние дни: она читается сверху
         вниз и глубже трёх суток её никто не листает, а строк на день
         выходит по два десятка. Заводить их на все четыре месяца значило
         бы положить сорок тысяч записей ради экрана, который показывает
         последние двадцать. */
      if (daysAgo <= FEED_DAYS) {
        const actorName = together
          ? STAFF[0].name
          : authorId === ownerId
            ? OWNER.name
            : STAFF[staffIds.indexOf(authorId)].name;
        const data: Record<string, unknown> = {
          key: plate,
          service: svc.name,
          amount: price,
          payment,
        };
        if (listPrice > price) data.listPrice = listPrice;
        if (together) data.crew = [STAFF[0].name, STAFF[1].name];

        feedRows.push(
          `  (${q(tenantId)}, ${q(authorId)}, ${q(actorName)}, ` +
            `${q(authorId === ownerId ? 'owner' : 'staff')}, 'car.created', 'car', ${q(orderId)}, ` +
            `${q(JSON.stringify(data))}::jsonb, ${when})`,
        );
      }
    }
  }

  const clientRows = [...clients.entries()].map(
    ([plate, c]) =>
      `  (${q(c.id)}, ${q(tenantId)}, ${q(plate)}, ${c.name ? q(c.name) : 'null'}, ${c.visits}, ${c.total},` +
      ` ${at(c.firstAgo, 600)}, ${at(c.lastAgo, 600)})`,
  );
  for (let i = 0; i < clientRows.length; i += 400) {
    out.push(`
insert into clients (id, tenant_id, key, name, visits, total, first_seen_at, last_seen_at) values
${clientRows.slice(i, i + 400).join(',\n')};`);
  }

  if (passes.length) {
    out.push(`
-- Абонементы проданы месяц назад: часть моек израсходована, часть осталась.
-- Пустой остаток не показал бы, ради чего абонемент вообще заводят.
insert into passes (id, tenant_id, client_id, service_id, service_name, total_uses, used_uses, price, unit_price, sold_by, sold_at) values
${passes
  .map((p) => {
    const client = clients.get(p.plate);
    const used = passUses.find((u) => u.passId === p.id)?.used ?? 0;
    return (
      `  (${q(p.id)}, ${q(tenantId)}, ${q(client!.id)}, ${q(svcId(PASS_SERVICE))}, ${q(PASS_SERVICE)}, ` +
      `${p.total}, ${used}, ${p.price}, ${p.unit}, ${q(ownerId)}, ${at(p.soldDaysAgo, 660)})`
    );
  })
  .join(',\n')};`);
  }

  // порциями: psql переварит и один insert на две тысячи строк, но читать
  // его при отладке невозможно
  for (let i = 0; i < orderRows.length; i += 400) {
    out.push(`
insert into orders (id, tenant_id, client_id, staff_id, service_id, service_name, tier, price, list_price, staff_percent, payment, pass_id, created_at) values
${orderRows.slice(i, i + 400).join(',\n')};`);
  }

  out.push(`
-- Кому причитается за машину. Ведомость и экран смены ходят к деньгам
-- через order_shares, а не через orders.staff_id: без этих строк
-- начисленное не увидит никто.
--
-- Записи из будущего сюда не попадают: сегодняшние заезды обрезаны по
-- «сейчас», а доля считается от того, что уже случилось.`);
  for (let i = 0; i < shareRows.length; i += 400) {
    out.push(`
insert into order_shares (tenant_id, order_id, staff_id, earned, sort) values
${shareRows.slice(i, i + 400).join(',\n')}
on conflict (order_id, staff_id) do nothing;`);
  }

  /* ── смены ── */
  const shiftRows: string[] = [];
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    for (const id of staffIds) {
      const expected = cashBy.get(`${daysAgo}|${id}`) ?? 0;
      if (expected === 0) continue;

      /* Недостача раз в семь смен, и небольшая. Это то, ради чего в
         кассовом бизнесе вообще ставят учёт, и на встрече она должна быть
         видна — но как исключение, а не как правило. */
      const short = rand() < 0.14 ? Math.round((expected * (0.04 + rand() * 0.08)) / 100) * 100 : 0;
      shiftRows.push(
        `  (${q(tenantId)}, ${q(id)}, ${at(daysAgo, 540)}, ${at(daysAgo, 1230)}, ${expected - short}, ${expected})`,
      );
    }
  }
  out.push(`
insert into shifts (tenant_id, user_id, opened_at, closed_at, cash_declared, cash_expected) values
${shiftRows.join(',\n')};`);

  /* Смены на сегодня здесь не открываются: их, как и сами заезды,
     открывает `infra/showcase-topup.sql` — там же, где считается, что
     из сегодняшнего дня уже прошло. Два места, открывающие одну смену,
     разошлись бы в первый же день. */

  /* ── расходы ── */
  const oneOff: string[] = [];
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo -= 1) {
    if (rand() < 0.12) {
      const kind = rand() < 0.6 ? { name: 'Քիմիա', base: 18000 } : { name: 'Ջուր', base: 6500 };
      const amount = Math.round((kind.base * (0.7 + rand() * 0.8)) / 500) * 500;
      oneOff.push(`  (${q(tenantId)}, ${amount}, ${q(kind.name)}, false, ${at(daysAgo, 600)})`);
    }
  }
  out.push(`
-- Аренда и свет действуют весь период: в календарном месяце входят полной
-- суммой, внутри суток — дневной долей.
insert into expenses (tenant_id, amount, category, monthly, at) values
  (${q(tenantId)}, 300000, ${q('Վարձ')}, true, ${at(DAYS + 5, 0)}),
  (${q(tenantId)}, 45000, ${q('Հոսանք')}, true, ${at(DAYS + 5, 0)}),
${oneOff.join(',\n')};`);

  /* ── выплаты ──

     Отсчёт ведётся от конца, а не от начала: непокрытым должен остаться
     ровно последний неполный период, и он должен быть коротким. Считая
     от начала истории, хвост получался в три недели, и владелец на
     экране зарплат выглядел человеком, который не платит бригаде месяц.

     Самая ранняя выплата закрывает всё до себя: заработок первых дней
     иначе висел бы долгом вечно. */
  const payoutRows: string[] = [];
  const marks: number[] = [];
  for (let daysAgo = 7; daysAgo + 14 <= DAYS; daysAgo += 14) marks.push(daysAgo);

  for (const daysAgo of marks) {
    const first = daysAgo === marks[marks.length - 1];
    const from = first ? at(DAYS + 1, 0) : at(daysAgo + 14, 0);
    for (const id of staffIds) {
      payoutRows.push(
        `  (${q(tenantId)}, ${q(id)}, ${from}, ${at(daysAgo, 0)}, ` +
          `(select coalesce(sum(s.earned), 0)::int from order_shares s join orders o on o.id = s.order_id ` +
          `where s.tenant_id = ${q(tenantId)} and s.staff_id = ${q(id)} ` +
          `and o.canceled_at is null and o.created_at >= ${from} and o.created_at < ${at(daysAgo, 0)}), ` +
          `${at(daysAgo, 1200)})`,
      );
    }
  }
  out.push(`
-- Выплаты раз в две недели: без них «начислено» и «к выплате» совпадают, и
-- смысл раздела зарплат не виден. Последняя неделя намеренно не закрыта —
-- на экране должен быть живой долг перед бригадой, но недельный, а не
-- такой, за который бригада уходит.
insert into payouts (tenant_id, staff_id, period_from, period_to, amount, paid_at) values
${payoutRows.join(',\n')};`);

  /* ── живая лента ── */
  out.push(`
-- Живая лента. Главный экран читает её, а не записи: мойка с полной
-- кассой и пустой лентой выглядит выключенной, и это первое, что видит
-- гость.
--
-- Сегодняшний день сюда не входит: его пишет showcase-topup.sql по мере
-- того, как день идёт.
insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, data, created_at
) values
${feedRows.join(',\n')};`);

  out.push(`
-- Выходы на смену и сдача кассы: без них лента состоит из одних машин, а
-- смена — половина того, ради чего продукт ставят.
insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, created_at
)
select sh.tenant_id, sh.user_id, u.name, 'staff', 'shift.started', 'shift', sh.id, sh.opened_at
from shifts sh join users u on u.id = sh.user_id
where sh.tenant_id = ${q(tenantId)} and sh.opened_at >= ${at(FEED_DAYS, 0)};

insert into activity_events (
  tenant_id, actor_id, actor_name, actor_role, event_type, entity_type, entity_id, data, created_at
)
select sh.tenant_id, sh.user_id, u.name, 'staff', 'shift.finished', 'shift', sh.id,
       jsonb_build_object('cashExpected', sh.cash_expected, 'cashDeclared', sh.cash_declared),
       sh.closed_at
from shifts sh join users u on u.id = sh.user_id
where sh.tenant_id = ${q(tenantId)} and sh.closed_at >= ${at(FEED_DAYS, 0)};`);

  out.push(`
commit;

select
  (select count(*) from orders   where tenant_id = ${q(tenantId)}) as записей,
  (select count(*) from orders   where tenant_id = ${q(tenantId)} and payment = 'pass') as по_абонементу,
  (select count(*) from clients  where tenant_id = ${q(tenantId)}) as клиентов,
  (select count(*) from shifts   where tenant_id = ${q(tenantId)}) as смен,
  (select count(*) from payouts  where tenant_id = ${q(tenantId)}) as выплат,
  (select to_char(min(created_at) at time zone 'Asia/Yerevan', 'DD.MM.YYYY') from orders where tenant_id = ${q(tenantId)}) as с,
  (select to_char(max(created_at) at time zone 'Asia/Yerevan', 'DD.MM.YYYY') from orders where tenant_id = ${q(tenantId)}) as по,
  (select sum(price) from orders where tenant_id = ${q(tenantId)}) as выручка;`);

  console.log(out.join('\n'));

  console.error(`\nмойка: ${TENANT}`);
  console.error(
    `владелец: ${OWNER.phone}  PIN ${OWNER_PIN_HASH ? '(прежний, из OWNER_PIN_HASH)' : OWNER.pin}`,
  );
  STAFF.forEach((s) => console.error(`${s.name}: ${s.phone}  PIN ${s.pin}  ${s.percent}%`));
  console.error(`\nдней: ${DAYS}, записей: ${orderRows.length}, клиентов: ${clients.size}`);
  console.error(`смен: ${shiftRows.length}, выплат: ${payoutRows.length}, абонементов: ${passes.length}\n`);
}

main();
