import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getShift, getTenant, getUser, listServices, startOfDay } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { TopBar } from '@/components/top-bar';
import { BillingBanner } from '@/components/billing-banner';
import { currentAccess } from '@/lib/subscription';
import { OrderFlow } from './order-flow';

export default async function WorkPage() {
  const session = await requireSession();
  await ensureDb();

  const [tenant, me] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
  ]);
  if (!tenant || !me) redirect('/login');

  const access = currentAccess(tenant);
  if (!access.canRead) redirect('/blocked');
  const [services, shift] = await Promise.all([
    listServices(tenant.id),
    getShift(tenant.id, me.id, startOfDay(tenant.timezone)),
  ]);

  return (
    <>
      <TopBar tenantName={tenant.name} subtitle={me.name} role={session.role} />

      <main className="mx-auto w-full max-w-[520px] px-4 pb-24">
        <BillingBanner access={access} role={session.role} />
        {/* Личный заработок в реальном времени. Это не украшение:
            без него сотруднику незачем вбивать записи вообще. */}
        <section className="mb-3.5 rounded-[14px] border border-shift-line bg-gradient-to-br from-shift-from to-shift-to p-[18px]">
          <div className="text-xs uppercase tracking-[1px] text-muted">
            {hy.work.shiftTitle}
          </div>
          <div className="my-1.5 text-[32px] font-bold leading-none tracking-tight text-good">
            {formatMoney(shift.earned, tenant.currency)}
          </div>
          <div className="text-[13px] text-muted">
            {shift.count} {tenant.unitOne} · {formatMoney(shift.revenue, tenant.currency)} ·{' '}
            {hy.work.yourShare} {me.percent}%
          </div>
        </section>

        <OrderFlow
          canWrite={access.canWrite}
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
