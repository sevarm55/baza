import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureDb } from '@/lib/db/ready';
import {
  getShift,
  getTenant,
  getUser,
  listServices,
  listStaff,
  startOfDay,
} from '@/lib/queries';
import { cashInShift, closedShiftToday, currentShift, whoIsOnShift } from '@/lib/shifts';
import { hhmm } from '@/lib/time';
import { listPoints } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { TopBar } from '@/components/top-bar';
import { Rail } from '@/components/rail';
import { Logo } from '@/components/logo';
import { MobileHead } from '@/components/mobile-head';
import { MobileTabs } from '@/components/mobile-tabs';
import { PointSwitcher } from '@/components/point-switcher';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Grid, Reading, Tile } from '@/components/board';
import { passesEnabled } from '@/lib/features';
import { priceForTier, tiersOf } from '@/lib/catalog';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { needsWelcome } from '@/lib/onboarding';
import { WorkerWelcome } from './welcome';
import { EndShift, StartShift } from './shift-controls';
import { ShiftClock } from './shift-clock';
import { OrderFlow } from './order-flow';
import { getDict } from '@/lib/i18n/server';
import { unitForms, unitWord } from '@/lib/i18n/terms';
import { localizeTenant } from '@/lib/i18n/terms';

export default async function WorkPage() {
  const t = await getDict();
  const session = await requireSession();
  await ensureDb();

  const [raw, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!raw || !me) redirect('/session-ended');

  /* Слова бизнеса — на языке того, кто смотрит; заводские переводятся,
     своё название владельца проходит насквозь (см. terms.ts). */
  const tenant = localizeTenant(raw, t.locale);

  const access = currentAccess(tenant);
  if (!access.canRead) redirect('/blocked');
  const [services, shift, open, closed, points, staff] = await Promise.all([
    listServices(tenant.id),
    getShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    currentShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    closedShiftToday(tenant.id, me.id, startOfDay(tenant.timezone)),
    me.accountId ? listPoints(me.accountId) : Promise.resolve([]),
    /* Коллеги — для отметки «помыли вместе». Приезжают вместе со
       страницей, а не запросом по нажатию: список нужен ровно в тот
       момент, когда человек стоит у машины мокрыми руками, и пауза на
       загрузку там дороже всего.

       Себя убираем здесь, а не в форме: автор записи участник по
       определению, и галочка напротив собственного имени была бы
       способом однажды остаться без денег за свою же работу. */
    listStaff(tenant.id),
  ]);

  /* Кто из коллег сейчас на мойке.
   *
   * Отметить участником можно только того, кто встал на смену: не встал —
   * значит сегодня не работал, и начислять ему за чужую машину не за что.
   * То же правило проверяет сервер, здесь оно только убирает из списка
   * имена, по которым всё равно придёт отказ.
   *
   * Признак едет вместе с человеком, а не вырезает его из списка: без
   * коллег вовсе и «все ушли домой» — разные ответы, и форма обязана их
   * различать. */
  const present = await whoIsOnShift(tenant.id, startOfDay(tenant.timezone));
  const presentIds = new Set(present.map((p) => p.userId));
  const mates = staff
    .filter((s) => s.id !== me.id)
    .map((s) => ({ id: s.id, name: s.name, onShift: presentIds.has(s.id) }));

  /* Сколько наличных на руках с начала смены.
   *
   * Та цифра, ради которой экран открывают во второй раз за день:
   * столько с человека спросят при закрытии, и лучше увидеть её заранее,
   * чем узнать в момент сдачи. Считает тот же `cashInShift`, которым
   * сервер посчитает ожидаемое, — второй счёт разошёлся бы с ним на
   * первой же отменённой машине. */
  const cashSoFar = open
    ? await cashInShift(tenant.id, me.id, open.openedAt, new Date())
    : 0;

  /* Владелец приходит сюда из кабинета, поэтому у него остаётся боковая
     колонка: на маленькой мойке он моет сам и переключается между двумя
     половинами продукта по десять раз за день. У мойщика разделов нет —
     ему колонка не нужна, у него шапка. */
  const owner = session.role === 'owner';
  const onShift = Boolean(open);
  const sidebarOpen = owner
    ? (await cookies()).get('sidebar_state')?.value !== 'false'
    : true;

  /* Состояний смены три, а не два.
   *
   * «Ещё не вставал» и «отработал и закрылся» выглядели одинаково: под
   * заработком стояло «вне смены», и вечером экран возвращался ровно к
   * тому, что человек видел утром. Заработок при этом оставался
   * дневным — то есть экран одновременно показывал деньги за день и
   * сообщал, что дня не было.
   *
   * Источник правды один и тот же — сервер: открытая смена или её
   * сегодняшний след. Перезагрузка страницы посреди смены поэтому
   * восстанавливает состояние точно, а не по памяти браузера. */
  const state: 'on' | 'done' | 'off' = onShift ? 'on' : closed ? 'done' : 'off';

  /* Главное число — то, которое принадлежит смотрящему. У мойщика это
     его доля, у владельца доли обычно нет вовсе: он моет сам и получает
     всё. Показывать ему «твой заработок — 0 ֏» крупнее всего на экране
     значит отдать главное место пустоте. Так же решено в приложении. */
  const takesShare = me.percent > 0;

  /* Классы машин. Пусто — ряда на экране нет вовсе: у мойки без тарифов
     он был бы управлением, которое ничего не меняет. */
  const tiers = tiersOf(tenant);

  /* Строка под главным числом: состояние смены и её часы. Точка слева —
     тот же знак, которым владелец видит человека на смене. */
  const status =
    state === 'on' && open ? (
      <>
        {t.work.onShift} · {t.work.since(hhmm(open.openedAt, tenant.timezone))}
        <ShiftClock openedAt={open.openedAt.toISOString()} />
      </>
    ) : state === 'done' && closed ? (
      <>
        {t.work.shiftDone} ·{' '}
        {t.work.range(
          hhmm(closed.openedAt, tenant.timezone),
          hhmm(closed.closedAt, tenant.timezone),
        )}
      </>
    ) : (
      t.work.shiftNotStarted
    );

  /* Экран смены на языке табло — одной колонкой, а не разложенный по
     ширине монитора.

     Содержимого здесь четыре вещи: сколько заработал, сколько машин и
     денег, кнопка записи и журнал. Кабинет живёт во всю ширину, потому
     что там десять приборов и им тесно; здесь четыре, и растянутые на
     тысячу триста пикселей они читаются не как экран, а как остатки
     экрана — глаз ищет то, что должно было стоять в пустоте справа и
     снизу. Ограниченный столбец такого вопроса не задаёт: видно, где
     содержимое кончается, и что оно кончилось нарочно.

     Это и по сути правильно. Кабинет — приборная панель, её изучают.
     Смена — рабочее место для одной руки: пришёл, посмотрел цифру,
     записал машину, ушёл. На телефоне оно и так одной колонкой, и
     разница между телефоном и монитором тут должна быть в размере
     полей, а не в устройстве экрана.

     Порядок задан частотой: записать машину — десятки раз за смену,
     заработок — после каждой, состояние смены — дважды в день, журнал —
     когда ошибся. */
  const body = (
    <>
      <BillingBanner access={access} role={session.role} />

      {/* Приветствие мойщика — только его и только один раз. Владельцу
          оно здесь не показывается: свой первый экран он уже прочитал в
          кабинете, и второе окно про смену было бы третьим объяснением
          подряд человеку, который сюда зашёл записать машину. */}
      {!owner && needsWelcome(me) && <WorkerWelcome />}

      <div className="mx-auto grid w-full max-w-[46rem] gap-[var(--seam)]">
        <div className="grid content-start gap-[var(--seam)]">
          {/* Свои деньги — тем же прибором, что выручка в кабинете, а не
              собственной градиентной карточкой. Мойщик и владелец
              смотрят на одно и то же число разными глазами, и незачем
              рисовать для этого два разных предмета.

              Подпись называет чьи это деньги. «Твоя смена сегодня» над
              суммой заработка врала дважды: смена — это часы, а не
              драмы, и число под такой подписью читалось выручкой мойки.

              Состояние смены встало строкой сравнения под цифрой:
              «сколько» и «работаю ли я» читаются одним взглядом, а
              зелёная точка здесь — тот же знак, которым владелец видит
              человека на смене. */}
          <Reading
            caption={takesShare ? t.work.earnedToday : t.work.shiftRevenue}
            value={formatMoney(takesShare ? shift.earned : shift.revenue, tenant.currency)}
            compare={status}
            tone={state === 'on' ? 'good' : 'off'}
          />

          {/* Второе денежное число экрана — деньги мойки, и подпись
              обязана это говорить. Раньше здесь стояло то же слово, что
              у выручки в кабинете владельца, а под ним «твои 20%»: два
              похожих числа рядом, и какое из них твоё — вопрос.

              Тому, у кого доли нет, второго числа не нужно вовсе: сумма
              работ уже стоит наверху, и повторить её плиткой значило бы
              показать одно и то же дважды. Остаются машины — во всю
              ширину. */}
          <Grid>
            <Tile
              tone="teal"
              label={unitWord(shift.count, tenant.unitOne, t.locale)}
              value={shift.count}
            />
            {takesShare ? (
              <Tile
                tone="slate"
                label={t.work.worksTotal}
                value={formatMoney(shift.revenue, tenant.currency, t.locale)}
                note={t.work.yourShare(me.percent)}
              />
            ) : (
              /* Тому, у кого доли нет, сумма работ уже стоит наверху
                 главным числом, и повторять её плиткой значило бы
                 показать одни и те же деньги дважды. Вместо неё —
                 наличные: их спросят при закрытии. */
              <Tile
                tone="slate"
                label={t.payment.cash}
                value={formatMoney(cashSoFar, tenant.currency, t.locale)}
                note={onShift ? t.work.toHandOver : undefined}
              />
            )}
          </Grid>

          {/* Наличные на руках — отдельной строкой тому, кто берёт долю:
              у него обе плитки уже заняты своими деньгами и суммой
              работ, а спросят при закрытии всё равно наличные. Только на
              открытой смене: закрытой сдавать нечего. */}
          {takesShare && onShift && (
            <p className="quick">
              {t.payment.cash} <b className="num">{formatMoney(cashSoFar, tenant.currency, t.locale)}</b>
              <i />
              {t.work.toHandOver}
            </p>
          )}

          {/* Одно действие, и оно никогда не серое.

              Было так: вне смены наверху висела погашенная кнопка
              «+ машина», а объяснение, почему она не работает, стояло в
              другой колонке под случайной линией. Погашенная кнопка без
              объяснения читается поломкой, а с объяснением в стороне —
              поломкой, которую зачем-то описали. Теперь вне смены её
              нет вовсе: следующее действие человека там не «записать», а
              «начать смену», её и показываем.

              После закрытой смены — то же самое: запись невозможна, и
              единственное, что здесь может понадобиться, это выйти
              второй раз. Итог дня при этом уже прочитан выше — заработок,
              машины, сумма работ и часы смены, — и повторять его
              отдельной коробкой значило бы показать те же три числа
              дважды на одном экране.

              На смене всё наоборот: запись становится самым громким на
              экране, а выключатель смены уходит вниз и затихает — его
              жмут дважды в день, а кнопку записи сорок раз. */}
          {state !== 'on' && <StartShift />}

          {/* Журнал целиком, а не первые шесть. Обрезанный список
              оставлял внизу пустоту, которую нечем занять, и прятал
              ровно то, ради чего в него смотрят: ошибку ищут не среди
              последних шести, а среди всех за смену. */}
          <OrderFlow
            canWrite={access.canWrite && onShift}
            shiftOpen={onShift}
            /* Цены по классам приезжают уже посчитанными, по одной на
               класс в порядке `tiers`. Правило «нет своей цены — берёт
               базовую» живёт в `priceForTier` и остаётся в одном месте;
               браузеру достаётся выбрать из готового ряда, а не
               повторять правило второй раз и разойтись с сервером на
               первой же правке. */
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              price: s.price,
              prices: tiers.map((_, i) => priceForTier(s, i)),
            }))}
            tiers={tiers}
            tierLabel={tenant.tierLabel ?? t.work.tier}
            currency={tenant.currency}
            clientIdLabel={tenant.clientIdLabel}
            clientIdType={tenant.clientIdType}
            unitOne={tenant.unitOne}
            addLabel={`+ ${unitForms(tenant.unitOne, t.locale).acc}`}
            timezone={tenant.timezone}
            /* Совместная работа. Пусто в `teamPercent` — свойства у
               бизнеса нет, и выбора «кто мыл» на экране не будет вовсе:
               управление, которое ничего не меняет, приходится
               прочитать, чтобы это понять, а читают его сорок раз за
               смену. */
            mates={mates}
            teamPercent={tenant.teamPercent}
            staffRole={tenant.staffRole}
            recent={shift.orders.map((o) => ({
              id: o.id,
              clientKey: o.clientKey,
              serviceName: o.serviceName,
              price: o.price,
              payment: o.payment,
              at: o.createdAt.toISOString(),
              /* Своя доля и число участников. У одиночной мойки доля
                 равна прежнему расчёту, а `crew` равен единице — строка
                 журнала выглядит ровно как выглядела. */
              earned: o.earned,
              crew: o.crew,
              /* Запись сделал смотрящий: от этого зависит, показывать ли
                 отмену. Чужую совместную мойку он видит, но отменять её
                 не вправе. */
              mine: o.staffId === me.id,
            }))}
          />

          {/* Закрыть смену спрашивает и показывает итог дня: после
              закрытия записывать нельзя, а жмут её один раз. */}
          {onShift && (
            <EndShift
              count={shift.count}
              revenue={shift.revenue}
              earned={shift.earned}
              cash={cashSoFar}
              currency={tenant.currency}
              unitOne={tenant.unitOne}
            />
          )}
        </div>
      </div>
    </>
  );

  if (owner) {
    return (
      <SidebarProvider defaultOpen={sidebarOpen}>
        <Rail
          tenantName={tenant.name}
          userName={me.name}
          points={points}
          currentTid={tenant.id}
          passes={passesEnabled()}
          active="work"
        />
        <SidebarInset className="min-w-0 bg-board text-[color:var(--on-board)]">
          {/* Экран смены — корневой: из него не возвращаются, поэтому
              шапка называет бизнес, а разделы стоят внизу. Та же схема,
              что во всём кабинете; переключается она адресом, а не
              страницей. */}
          <MobileHead
            brand={
              points.length > 1 ? (
                <div className="min-w-0 flex-1">
                  <PointSwitcher points={points} currentId={tenant.id} subtitle={me.name} />
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Logo size={26} withName={false} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] leading-tight font-semibold">
                      {tenant.name}
                    </div>
                    <div
                      className="truncate text-[11.5px] leading-tight"
                      style={{ color: 'var(--board-muted)' }}
                    >
                      {me.name}
                    </div>
                  </div>
                </div>
              )
            }
          />
          <div className="canvas">
            <div className="canvas-inner">{body}</div>
          </div>
          <MobileTabs />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <div className="shell shell-solo">
      <div className="min-w-0">
        <TopBar
          tenantName={tenant.name}
          subtitle={me.name}
          role={session.role}
          active="work"
          points={points}
          currentTid={tenant.id}
          shiftOpen={onShift}
        />
        <main className="canvas">
          <div className="canvas-inner">{body}</div>
        </main>
      </div>
    </div>
  );
}
