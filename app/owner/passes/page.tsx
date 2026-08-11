import { notFound, redirect } from 'next/navigation';
import { passesEnabled } from '@/lib/features';
import { dayMonth } from '@/lib/time';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices, startOfDay } from '@/lib/queries';
import { getPassSales, listPasses } from '@/lib/passes';
import { formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Stat, StatGrid } from '@/components/stat';
import { IconTicket, IconVoid } from '@/components/icons';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
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
      <PageHead title={hy.passes.title} meta={hy.passes.note} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-8">
          <StatGrid className="sm:grid-cols-4">
            <Stat label={hy.passes.sold} value={list.length} />
            <Stat label={hy.owner.revenue} value={money(salesToday.revenue)} tone="good" />
            <Stat label={hy.passes.used} value={`${usedTotal} ${hy.passes.of} ${soldTotal}`} />
            <Stat
              label={hy.passes.remaining}
              value={soldTotal - usedTotal}
              tone={soldTotal - usedTotal > 0 ? 'warn' : undefined}
            />
          </StatGrid>

          <Panel title={hy.passes.title} count={list.length}>
            {list.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{hy.passes.empty}</p>
            ) : (
              <div className="list">
                {list.map((p) => {
                  const left = p.totalUses - p.usedUses;
                  const expired = !!p.expiresAt && p.expiresAt.getTime() < Date.now();
                  const dead = left <= 0 || expired;
                  return (
                    <div key={p.id} className="li">
                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-surface2 ${
                          dead ? 'text-faint' : 'text-good'
                        }`}
                      >
                        {dead ? (
                          <IconVoid className="size-[18px]" />
                        ) : (
                          <IconTicket className="size-[18px]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">
                          {p.clientKey ?? '—'}
                        </div>
                        <div className="truncate text-[13.5px] text-muted">
                          {p.serviceName} · {money(p.price)}
                          {p.expiresAt && ` · ${hy.passes.until} ${dayMonth(p.expiresAt, tenant.timezone)}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`text-[15px] font-semibold ${
                            dead ? 'text-muted' : 'text-good'
                          }`}
                        >
                          {left} {hy.passes.of} {p.totalUses}
                        </div>
                        <div className="text-xs text-muted">{dayMonth(p.soldAt, tenant.timezone)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <Panel title={hy.passes.sell} className="content-start lg:col-span-4">
          <SellPassForm
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              price: toMajor(s.price, tenant.currency),
            }))}
            clientIdLabel={tenant.clientIdLabel}
            clientIdPlaceholder={
              tenant.clientIdType === 'plate' ? '12 AB 345' : '+374 77 123 456'
            }
          />
        </Panel>
      </div>
    </>
  );
}

