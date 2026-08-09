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
import { NumericText } from '@/components/numeric-text';
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

  /* Экран записи живёт на телефоне, и его порядок задан рукой: сначала
     свои деньги, потом смена, потом кнопка. На компьютере тот же порядок
     разъезжается в две колонки — слева заработок и смена, справа запись,
     — но шире 1100 не растёт: это экран для одной руки, а кнопка во весь
     монитор не становится удобнее от того, что она большая.

     Владелец приходит сюда из кабинета, поэтому у него остаётся боковая
     колонка: на маленькой мойке он моет сам и переключается между двумя
     половинами продукта по десять раз за день. У мойщика разделов нет —
     ему колонка не нужна, у него шапка. */
  const owner = session.role === 'owner';

  const body = (
    <>
      <BillingBanner access={access} role={session.role} />

      <div className="mx-auto grid w-full max-w-[1100px] gap-[var(--seam)] lg:grid-cols-2">
        <div className="grid content-start gap-[var(--seam)]">
          {/* Личный заработок в реальном времени. Это не украшение:
              без него сотруднику незачем вбивать записи вообще.

              Заливка индиго, текст белый: это единственный способ
              сказать «вот твои деньги» так, чтобы читалось на солнце.
              Цвета берутся не от общих токенов текста — на цветном фоне
              приглушённый серый превращается в грязь. */}
          <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-shift-from to-shift-to p-5 text-shift-ink">
            {/* Строчными, как все подписи продукта: капслок в разрядку
                над собственным заработком читался как штамп на бланке. */}
            <div className="text-[12.5px] font-medium opacity-70">{hy.work.shiftTitle}</div>
            {/* Разряды перекатываются, когда мойщик записал машину: свои
                деньги он смотрит после каждой, и цифра должна не просто
                смениться, а показать, что выросла. */}
            <div className="num my-2 text-[clamp(38px,5vw,48px)] leading-[0.95] font-bold tracking-[-0.03em]">
              <NumericText>{formatMoney(shift.earned, tenant.currency)}</NumericText>
            </div>
            <div className="num text-[13px] opacity-70">
              {shift.count} {tenant.unitOne} · {formatMoney(shift.revenue, tenant.currency)} ·{' '}
              {hy.work.yourShare} {me.percent}%
            </div>
          </section>

          <ShiftToggle open={Boolean(open)} />

          {/* Вне смены записывать нельзя: машина, записанная мимо смены,
              не попадает в сдачу наличных при закрытии. То же правило в
              приложении и на сервере.

              Отключённая кнопка без объяснения читается как поломка, а
              не как правило, — поэтому строка над ней. */}
          {!open && <p className="note">{hy.work.needShift}</p>}
        </div>

        <div className="min-w-0">
          <OrderFlow
            canWrite={access.canWrite && Boolean(open)}
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
