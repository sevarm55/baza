import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { ensureDb } from '@/lib/db/ready';
import { getShift, getTenant, getUser, listServices, startOfDay } from '@/lib/queries';
import { closedShiftToday, currentShift } from '@/lib/shifts';
import { hhmm } from '@/lib/time';
import { listPoints } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { TopBar } from '@/components/top-bar';
import { Rail } from '@/components/rail';
import { Logo } from '@/components/logo';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Grid, Reading, Tile } from '@/components/board';
import { passesEnabled } from '@/lib/features';
import { priceForTier, tiersOf } from '@/lib/catalog';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { EndShift, StartShift } from './shift-controls';
import { ShiftClock } from './shift-clock';
import { OrderFlow } from './order-flow';

export default async function WorkPage() {
  const session = await requireSession();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/session-ended');

  const access = currentAccess(tenant);
  if (!access.canRead) redirect('/blocked');
  const [services, shift, open, closed, points] = await Promise.all([
    listServices(tenant.id),
    getShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    currentShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    closedShiftToday(tenant.id, me.id, startOfDay(tenant.timezone)),
    me.accountId ? listPoints(me.accountId) : Promise.resolve([]),
  ]);

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
        {hy.work.onShift} · {hy.work.since(hhmm(open.openedAt, tenant.timezone))}
        <ShiftClock openedAt={open.openedAt.toISOString()} />
      </>
    ) : state === 'done' && closed ? (
      <>
        {hy.work.shiftDone} ·{' '}
        {hy.work.range(
          hhmm(closed.openedAt, tenant.timezone),
          hhmm(closed.closedAt, tenant.timezone),
        )}
      </>
    ) : (
      hy.work.shiftNotStarted
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
            caption={takesShare ? hy.work.earnedToday : hy.work.shiftRevenue}
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
            <Tile tone="teal" label={tenant.unitOne} value={shift.count} wide={!takesShare} />
            {takesShare && (
              <Tile
                tone="slate"
                label={hy.work.worksTotal}
                value={formatMoney(shift.revenue, tenant.currency)}
                note={hy.work.yourShare(me.percent)}
              />
            )}
          </Grid>

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
            tierLabel={tenant.tierLabel ?? hy.work.tier}
            currency={tenant.currency}
            clientIdLabel={tenant.clientIdLabel}
            clientIdType={tenant.clientIdType}
            unitOne={tenant.unitOne}
            addLabel={`+ ${tenant.unitOne}`}
            timezone={tenant.timezone}
            recent={shift.orders.map((o) => ({
              id: o.id,
              clientKey: o.clientKey,
              serviceName: o.serviceName,
              price: o.price,
              payment: o.payment,
              at: o.createdAt.toISOString(),
            }))}
          />

          {/* Закрыть смену спрашивает и показывает итог дня: после
              закрытия записывать нельзя, а жмут её один раз. */}
          {onShift && (
            <EndShift
              count={shift.count}
              revenue={shift.revenue}
              earned={shift.earned}
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
          <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/92 px-3 backdrop-blur md:hidden">
            <SidebarTrigger aria-label={hy.common.expand} title={hy.common.expand} />
            <Logo size={24} withName={false} />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{tenant.name}</div>
              <div className="truncate text-[11.5px] text-sidebar-foreground/55">{me.name}</div>
            </div>
          </header>
          <div className="canvas">
            <div className="canvas-inner">{body}</div>
          </div>
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
