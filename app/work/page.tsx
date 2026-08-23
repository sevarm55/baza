import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { requireSession } from '@/lib/auth';
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
import { passesEnabled } from '@/lib/features';
import { priceForTier, tiersOf } from '@/lib/catalog';
import { currentAccess } from '@/lib/subscription';
import { getAlerts } from '@/lib/alerts';
import { getSetup, needsWelcome } from '@/lib/onboarding';
import { getDict } from '@/lib/i18n/server';
import { localizeTenant, serviceNameTerm, unitForms, unitWord } from '@/lib/i18n/terms';
import { AppShell } from '@/components/shell/app-shell';
import { SoloShell } from '@/components/shell/solo-shell';
import { Panel } from '@/components/patterns/panel';
import { Metric } from '@/components/patterns/metric';
import { StatusBadge } from '@/components/patterns/status-badge';
import { NumericText } from '@/components/patterns/numeric-text';
import { WorkerWelcome } from './welcome';
import { EndShift, StartShift } from './shift-controls';
import { ShiftClock } from './shift-clock';
import { OrderFlow } from './order-flow';

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
       загрузку там дороже всего. Себя убираем здесь, а не в форме:
       автор записи участник по определению. */
    listStaff(tenant.id),
  ]);

  /* Кто из коллег сейчас на мойке. Отметить участником можно только
     того, кто встал на смену; то же правило проверяет сервер, здесь оно
     только убирает из списка имена, по которым всё равно придёт отказ.
     Признак едет вместе с человеком: без коллег вовсе и «все ушли
     домой» — разные ответы, и форма обязана их различать. */
  const present = await whoIsOnShift(tenant.id, startOfDay(tenant.timezone));
  const presentIds = new Set(present.map((p) => p.userId));
  const mates = staff
    .filter((s) => s.id !== me.id)
    .map((s) => ({ id: s.id, name: s.name, onShift: presentIds.has(s.id) }));

  /* Сколько наличных на руках с начала смены. Считает тот же
     `cashInShift`, которым сервер посчитает ожидаемое при закрытии. */
  const cashSoFar = open
    ? await cashInShift(tenant.id, me.id, open.openedAt, new Date())
    : 0;

  /* Владелец приходит сюда из кабинета, поэтому у него остаётся боковая
     колонка. У мойщика разделов нет — ему колонка не нужна, у него
     полоса сверху. */
  const owner = session.role === 'owner';
  const onShift = Boolean(open);

  /* Состояний смены три: «ещё не вставал», «работаю», «отработал и
     закрылся». Источник правды — сервер: открытая смена или её
     сегодняшний след. */
  const state: 'on' | 'done' | 'off' = onShift ? 'on' : closed ? 'done' : 'off';

  /* Главное число — то, которое принадлежит смотрящему. У мойщика это
     его доля, у владельца доли обычно нет вовсе: он получает всё, и
     главным становится выручка смены. */
  const takesShare = me.percent > 0;

  /* Классы машин. Пусто — ряда на экране нет вовсе. */
  const tiers = tiersOf(tenant);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);

  /* Строка под главным числом: состояние смены и её часы. Зелёная
     точка — тот же знак, которым владелец видит человека на смене. */
  const status =
    state === 'on' && open ? (
      <>
        <StatusBadge tone="success" dot>
          {t.work.onShift}
        </StatusBadge>
        <span>
          {t.work.since(hhmm(open.openedAt, tenant.timezone))}
          <ShiftClock openedAt={open.openedAt.toISOString()} />
        </span>
      </>
    ) : state === 'done' && closed ? (
      <>
        <StatusBadge tone="neutral">{t.work.shiftDone}</StatusBadge>
        <span className="num">
          {t.work.range(
            hhmm(closed.openedAt, tenant.timezone),
            hhmm(closed.closedAt, tenant.timezone),
          )}
        </span>
      </>
    ) : (
      <StatusBadge tone="neutral">{t.work.shiftNotStarted}</StatusBadge>
    );

  /* Экран смены одной колонкой: сколько заработал, сколько машин и
     денег, кнопка записи и журнал. Порядок задан частотой: записать
     машину — десятки раз за смену, заработок — после каждой, состояние
     смены — дважды в день, журнал — когда ошибся. */
  const body = (
    <div className="flex flex-col gap-4">
      {/* Приветствие мойщика — только его и только один раз. Владелец
          свой первый экран уже прочитал в кабинете. */}
      {!owner && needsWelcome(me) && <WorkerWelcome />}

      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-3">
            <Metric
              size="lg"
              label={takesShare ? t.work.earnedToday : t.work.shiftRevenue}
              value={<NumericText>{money(takesShare ? shift.earned : shift.revenue)}</NumericText>}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {status}
            </div>
          </div>

          {/* Второе денежное число — деньги мойки, и подпись обязана это
              говорить. Тому, у кого доли нет, сумма работ уже стоит
              наверху; вместо неё наличные: их спросят при закрытии. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:flex sm:shrink-0 sm:gap-8 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            <Metric
              size="sm"
              label={unitWord(shift.count, tenant.unitOne, t.locale)}
              value={<NumericText>{String(shift.count)}</NumericText>}
            />
            {takesShare ? (
              <Metric
                size="sm"
                label={t.work.worksTotal}
                value={<NumericText>{money(shift.revenue)}</NumericText>}
                hint={t.work.yourShare(me.percent)}
              />
            ) : (
              <Metric
                size="sm"
                label={t.payment.cash}
                value={<NumericText>{money(cashSoFar)}</NumericText>}
                hint={onShift ? t.work.toHandOver : undefined}
              />
            )}
            {/* Наличные на руках третьим показанием тому, кто берёт долю:
                первые два у него заняты своими деньгами и суммой работ, а
                спросят при закрытии всё равно наличные. Только на
                открытой смене: закрытой сдавать нечего. */}
            {takesShare && onShift && (
              <Metric
                size="sm"
                label={t.payment.cash}
                value={<NumericText>{money(cashSoFar)}</NumericText>}
                hint={t.work.toHandOver}
              />
            )}
          </div>
        </div>
      </Panel>

      {/* Одно действие, и оно никогда не серое: вне смены на месте
          записи стоит начало смены. */}
      {state !== 'on' && <StartShift />}

      <OrderFlow
        canWrite={access.canWrite && onShift}
        shiftOpen={onShift}
        /* Цены по классам приезжают уже посчитанными, по одной на класс
           в порядке `tiers`: правило «нет своей цены — берёт базовую»
           живёт в `priceForTier` и остаётся в одном месте. */
        services={services.map((s) => ({
          id: s.id,
          name: serviceNameTerm(s.name, t.locale),
          price: s.price,
          prices: tiers.map((_, i) => priceForTier(s, i)),
        }))}
        tiers={tiers}
        tierLabel={tenant.tierLabel ?? t.work.tier}
        currency={tenant.currency}
        clientIdLabel={tenant.clientIdLabel}
        clientIdType={tenant.clientIdType}
        unitOne={tenant.unitOne}
        addLabel={unitForms(tenant.unitOne, t.locale).acc}
        timezone={tenant.timezone}
        /* Пусто в `teamPercent` — свойства у бизнеса нет, и выбора «кто
           мыл» на экране не будет вовсе. */
        mates={mates}
        teamPercent={tenant.teamPercent}
        staffRole={tenant.staffRole}
        recent={shift.orders.map((o) => ({
          id: o.id,
          clientKey: o.clientKey,
          serviceName: serviceNameTerm(o.serviceName, t.locale),
          price: o.price,
          payment: o.payment,
          at: o.createdAt.toISOString(),
          earned: o.earned,
          crew: o.crew,
          /* Запись сделал смотрящий: от этого зависит, показывать ли
             отмену. Чужую совместную мойку он видит, но отменять её не
             вправе. */
          mine: o.staffId === me.id,
        }))}
      />

      {/* Закрыть смену спрашивает и показывает итог дня. */}
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
  );

  if (owner) {
    /* Та же колонка и полоса, что во всём кабинете: числа в них
       считаются тем же кодом, что в app/owner/layout.tsx. */
    const [alerts, setup, cookieStore] = await Promise.all([
      getAlerts(tenant.id, me.id, tenant.timezone, t.locale),
      getSetup(raw, me),
      cookies(),
    ]);
    const hint = setup.visible ? (setup.next?.href ?? null) : null;
    const sidebarOpen = cookieStore.get('sidebar_state')?.value !== 'false';

    return (
      <AppShell
        tenantName={tenant.name}
        userName={me.name}
        roleLabel={t.roles.owner}
        points={points}
        currentTid={tenant.id}
        passes={passesEnabled()}
        alerts={alerts}
        hint={hint}
        access={access}
        sidebarOpen={sidebarOpen}
        quickAdd={null}
        narrow
      >
        {body}
      </AppShell>
    );
  }

  return (
    <SoloShell
      tenantName={tenant.name}
      userName={me.name}
      roleLabel={tenant.staffRole}
      points={points}
      currentTid={tenant.id}
      access={access}
      shiftOpen={onShift}
    >
      {body}
    </SoloShell>
  );
}
