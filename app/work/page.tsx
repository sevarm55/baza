import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getShift, getTenant, getUser, listServices, startOfDay } from '@/lib/queries';
import { currentShift } from '@/lib/shifts';
import { listPoints } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { TopBar } from '@/components/top-bar';
import { Rail } from '@/components/rail';
import { Grid, Reading, Tile } from '@/components/board';
import { passesEnabled } from '@/lib/features';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { ShiftToggle } from '@/components/shift-toggle';
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
  const [services, shift, open, points] = await Promise.all([
    listServices(tenant.id),
    getShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    currentShift(tenant.id, me.id, startOfDay(tenant.timezone)),
    me.accountId ? listPoints(me.accountId) : Promise.resolve([]),
  ]);

  /* Владелец приходит сюда из кабинета, поэтому у него остаётся боковая
     колонка: на маленькой мойке он моет сам и переключается между двумя
     половинами продукта по десять раз за день. У мойщика разделов нет —
     ему колонка не нужна, у него шапка. */
  const owner = session.role === 'owner';
  const onShift = Boolean(open);

  /* Экран смены на языке табло.

     Собран по четырём вопросам мойщика, в порядке частоты: записать
     машину (десятки раз за смену), сколько я заработал (после каждой),
     на смене ли я (дважды в день), что я только что записал (когда
     ошибся). Слева показание, приборы и единственное действие; справа
     журнал.

     Прежняя разметка была на две равные половины, и нижние две трети
     экрана пустовали. Равные половины врали: слева стояло то, что
     читают, справа — то, что нажимают, и по площади выходило, будто
     это одинаково важно. Семь к пяти — то же соотношение, что во всех
     разделах кабинета. */
  const body = (
    <>
      <BillingBanner access={access} role={session.role} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-7">
          {/* Свои деньги — тем же прибором, что выручка в кабинете, а не
              собственной градиентной карточкой. Мойщик и владелец
              смотрят на одно и то же число разными глазами, и незачем
              рисовать для этого два разных предмета.

              Состояние смены встало строкой сравнения под цифрой:
              «сколько» и «работаю ли я» читаются одним взглядом, а
              зелёная точка здесь — тот же знак, которым владелец видит
              человека на смене. */}
          <Reading
            caption={hy.work.shiftTitle}
            value={formatMoney(shift.earned, tenant.currency)}
            compare={onShift ? hy.work.onShift : hy.work.offShift}
            tone={onShift ? 'good' : 'warn'}
          />

          <Grid>
            <Tile tone="teal" label={tenant.unitOne} value={shift.count} />
            <Tile
              tone="slate"
              label={hy.owner.revenueToday}
              value={formatMoney(shift.revenue, tenant.currency)}
              note={`${hy.work.yourShare} ${me.percent}%`}
            />
          </Grid>

          {/* Одно действие, и оно никогда не серое.

              Было так: вне смены наверху висела погашенная кнопка
              «+ машина», а объяснение, почему она не работает, стояло в
              другой колонке под случайной линией. Погашенная кнопка без
              объяснения читается поломкой, а с объяснением в стороне —
              поломкой, которую зачем-то описали. Теперь вне смены её
              нет вовсе: следующее действие человека там не «записать», а
              «начать смену», её и показываем.

              На смене всё наоборот: запись становится самым громким на
              экране, а выключатель смены уходит вниз и затихает — его
              жмут дважды в день, а кнопку записи сорок раз. */}
          {!onShift && <ShiftToggle open={false} />}
        </div>

        <div className="min-w-0 lg:col-span-5">
          <OrderFlow
            canWrite={access.canWrite && onShift}
            services={services.map((s) => ({ id: s.id, name: s.name, price: s.price }))}
            currency={tenant.currency}
            clientIdLabel={tenant.clientIdLabel}
            clientIdType={tenant.clientIdType}
            addLabel={`+ ${tenant.unitOne}`}
            percent={me.percent}
            recent={shift.orders.slice(0, 6).map((o) => ({
              id: o.id,
              serviceName: o.serviceName,
              price: o.price,
              payment: o.payment,
              at: o.createdAt.toISOString(),
            }))}
          />

          {onShift && <ShiftToggle open className="mt-[var(--seam)]" />}
        </div>
      </div>
    </>
  );

  return (
    <div className={`shell ${owner ? '' : 'shell-solo'}`}>
      {owner && (
        <Rail
          tenantName={tenant.name}
          userName={me.name}
          points={points}
          currentTid={tenant.id}
          passes={passesEnabled()}
          active="work"
        />
      )}

      <div className="min-w-0">
        <div className={owner ? 'lg:hidden' : undefined}>
          <TopBar
            tenantName={tenant.name}
            subtitle={me.name}
            role={session.role}
            active="work"
            points={points}
            currentTid={tenant.id}
          />
        </div>

        <main className="canvas">
          <div className="canvas-inner">{body}</div>
        </main>
      </div>
    </div>
  );
}
