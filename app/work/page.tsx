import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getShift, getTenant, getUser, listServices, startOfDay } from '@/lib/queries';
import { currentShift } from '@/lib/shifts';
import { listPoints } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { TopBar } from '@/components/top-bar';
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

  return (
    <>
      <TopBar
        tenantName={tenant.name}
        subtitle={me.name}
        role={session.role}
        active="work"
        points={points}
        currentTid={tenant.id}
      />

      <main className="mx-auto w-full max-w-[520px] px-4 pb-24">
        <BillingBanner access={access} role={session.role} />
        {/* Личный заработок в реальном времени. Это не украшение:
            без него сотруднику незачем вбивать записи вообще. */}
        {/* Заливка индиго, текст белый: на светлом экране это единственный
            способ сказать «вот твои деньги» так, чтобы читалось на солнце.
            Цвета берутся не от общих токенов текста — на цветном фоне
            приглушённый серый превращается в грязь. */}
        <section className="mb-3.5 rounded-[var(--radius-card)] bg-gradient-to-br from-shift-from to-shift-to p-5 text-shift-ink">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">
            {hy.work.shiftTitle}
          </div>
          <div className="num my-1.5 text-[40px] font-bold leading-none tracking-tight">
            {formatMoney(shift.earned, tenant.currency)}
          </div>
          <div className="num text-[13px] opacity-70">
            {shift.count} {tenant.unitOne} · {formatMoney(shift.revenue, tenant.currency)} ·{' '}
            {hy.work.yourShare} {me.percent}%
          </div>
        </section>

        <ShiftToggle open={Boolean(open)} />

        {/* Вне смены записывать нельзя: машина, записанная мимо смены, не
            попадает в сдачу наличных при закрытии. То же правило в
            приложении и на сервере.

            Отключённая кнопка без объяснения читается как поломка, а не
            как правило, — поэтому строка над ней. */}
        {!open && <p className="note mb-3">{hy.work.needShift}</p>}

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
      </main>
    </>
  );
}
