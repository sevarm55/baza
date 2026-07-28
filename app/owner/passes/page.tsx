import { notFound, redirect } from 'next/navigation';
import { passesEnabled } from '@/lib/features';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices, startOfDay } from '@/lib/queries';
import { getPassSales, listPasses } from '@/lib/passes';
import { formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Stat, StatGrid } from '@/components/stat';
import { SellPassForm } from './sell-pass-form';

export default async function PassesPage() {
  // спрятанную фичу нельзя открыть и прямой ссылкой
  if (!passesEnabled()) notFound();

  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const [services, list, salesToday] = await Promise.all([
    listServices(tenant.id),
    listPasses(tenant.id),
    getPassSales(tenant.id, startOfDay(tenant.timezone)),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  const usedTotal = list.reduce((s, p) => s + p.usedUses, 0);
  const soldTotal = list.reduce((s, p) => s + p.totalUses, 0);

  return (
    <>
      <StatGrid>
        <Stat label={hy.passes.sold} value={list.length} />
        <Stat label={hy.owner.revenue} value={money(salesToday.revenue)} tone="good" />
        <Stat label={hy.passes.used} value={`${usedTotal} ${hy.passes.of} ${soldTotal}`} />
        <Stat
          label={hy.passes.remaining}
          value={soldTotal - usedTotal}
          tone={soldTotal - usedTotal > 0 ? 'warn' : undefined}
        />
      </StatGrid>

      <h2 className="h-section">{hy.passes.sell}</h2>
      <SellPassForm
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          price: toMajor(s.price, tenant.currency),
        }))}
        clientIdLabel={tenant.clientIdLabel}
        clientIdPlaceholder={tenant.clientIdType === 'plate' ? '12 AB 345' : '+374 77 123 456'}
      />

      <p className="note mt-3.5">
        {hy.passes.note}
      </p>

      <h2 className="h-section">{hy.passes.title}</h2>
      <div className="list">
        {list.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{hy.passes.empty}</div>
        ) : (
          list.map((p) => {
            const left = p.totalUses - p.usedUses;
            const expired = !!p.expiresAt && p.expiresAt.getTime() < Date.now();
            const dead = left <= 0 || expired;
            return (
              <div key={p.id} className="li">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2">
                  {dead ? '🚫' : '🎟'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{p.clientKey ?? '—'}</div>
                  <div className="truncate text-[12.5px] text-muted">
                    {p.serviceName} · {money(p.price)}
                    {p.expiresAt && ` · ${hy.passes.until} ${shortDate(p.expiresAt)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-[14.5px] font-semibold ${dead ? 'text-muted' : 'text-good'}`}
                  >
                    {left} {hy.passes.of} {p.totalUses}
                  </div>
                  <div className="text-xs text-muted">{shortDate(p.soldAt)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
