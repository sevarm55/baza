import { notFound, redirect } from 'next/navigation';
import { passesEnabled } from '@/lib/features';
import { dayMonth, daysSince } from '@/lib/time';
import { requireOwner } from '@/lib/auth';
import { getTenant, listServices, startOfDay } from '@/lib/queries';
import { getPassSales, listPasses } from '@/lib/passes';
import { formatMoney, toMajor } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { EmptyState } from '@/components/patterns/states';
import { TableShell, cellNum, headNum } from '@/components/patterns/table';
import { DesktopOnly, MobileOnly, MRow, MRows } from '@/components/mobile';
import { SellPass } from './sell-pass';

/**
 * Абонементы.
 *
 * Деньги приходят в момент продажи; каждое использование выручки не
 * создаёт, чтобы одни и те же драмы не считались дважды. Страница
 * отвечает: сколько продано, что принесли сегодня, сколько из
 * купленного уже отмыто и сколько ещё должны отмыть.
 */
export default async function PassesPage() {
  const t = await getDict();
  // спрятанную фичу нельзя открыть и прямой ссылкой
  if (!passesEnabled()) notFound();

  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит; своё название владельца
     проходит насквозь (см. terms.ts). В базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const [services, list, salesToday] = await Promise.all([
    listServices(tenant.id),
    listPasses(tenant.id),
    getPassSales(tenant.id, startOfDay(tenant.timezone)),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const usedTotal = list.reduce((s, p) => s + p.usedUses, 0);
  const soldTotal = list.reduce((s, p) => s + p.totalUses, 0);
  const remaining = soldTotal - usedTotal;

  const rows = list.map((p) => {
    const left = p.totalUses - p.usedUses;
    /* Часы читает lib/time, а не страница: обращение к `Date.now()` в
       теле серверного компонента нарушает чистоту отрисовки. */
    const expired = !!p.expiresAt && daysSince(p.expiresAt) >= 0;
    return {
      id: p.id,
      clientKey: p.clientKey,
      service: serviceNameTerm(p.serviceName, t.locale),
      price: money(p.price),
      left,
      total: p.totalUses,
      expires: p.expiresAt ? dayMonth(p.expiresAt, tenant.timezone) : null,
      sold: dayMonth(p.soldAt, tenant.timezone),
      soldBy: p.soldByName,
      /* Кончился или просрочен: строка остаётся в истории, но тише. */
      dead: left <= 0 || expired,
    };
  });

  const head = 'h-9 px-4 text-xs text-muted-foreground';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title={t.passes.title}
        description={t.passes.note}
        actions={
          <SellPass
            services={services.map((s) => ({
              id: s.id,
              name: serviceNameTerm(s.name, t.locale),
              price: toMajor(s.price, tenant.currency),
            }))}
            currency={tenant.currency}
            clientIdLabel={tenant.clientIdLabel}
            clientIdPlaceholder={tenant.clientIdType === 'plate' ? '12 AB 345' : '+374 77 123 456'}
          />
        }
      />

      <MetricStrip columns={4}>
        <Metric size="lg" label={t.passes.sold} value={String(list.length)} />
        <Metric label={t.owner.revenueToday} value={money(salesToday.revenue)} hint={t.passes.revenue} />
        <Metric label={t.passes.used} value={`${usedTotal} ${t.passes.of} ${soldTotal}`} />
        <Metric
          label={t.passes.remaining}
          value={String(remaining)}
          tone={remaining > 0 ? 'warning' : 'default'}
        />
      </MetricStrip>

      <TableShell>
        {rows.length === 0 ? (
          <EmptyState compact title={t.passes.empty} />
        ) : (
          <>
          {/* На телефоне абонементы строками: номер машины крупно,
              услуга и срок под ним, остаток справа — «3 из 10» и есть
              ответ, ради которого в список смотрят. */}
          <MobileOnly className="px-4 pb-4">
            <MRows>
              {rows.map((p) => (
                <MRow
                  key={p.id}
                  title={<span className="num">{p.clientKey ?? '—'}</span>}
                  note={`${p.service} · ${p.price}`}
                  extra={p.expires ? `${t.passes.until} ${p.expires}` : t.passes.unlimited}
                  value={`${p.left} ${t.passes.of} ${p.total}`}
                  hint={p.soldBy ? `${p.sold} · ${p.soldBy}` : p.sold}
                  className={p.dead ? 'opacity-60' : undefined}
                />
              ))}
            </MRows>
          </MobileOnly>

          <DesktopOnly>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={head}>{tenant.clientIdLabel}</TableHead>
                <TableHead className={head}>{t.owner.colService}</TableHead>
                <TableHead className={cn(head, headNum)}>{t.passes.uses}</TableHead>
                <TableHead className={cn(head, 'hidden sm:table-cell')}>{t.passes.validDays}</TableHead>
                <TableHead className={cn(head, headNum, 'hidden md:table-cell')}>{t.passes.sold}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className={cn(p.dead && 'text-muted-foreground')}>
                  <TableCell className="num px-4 py-2.5 font-semibold">{p.clientKey ?? '—'}</TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium">{p.service}</span>
                      <span className="num text-xs text-muted-foreground">{p.price}</span>
                    </span>
                  </TableCell>
                  <TableCell className={cn('px-4 py-2.5', cellNum)}>
                    <span className="inline-flex items-center justify-end gap-2.5">
                      {/* Полоска показывает остаток: с ней «3 из 10»
                          читается без пересчёта. */}
                      <Progress
                        value={p.left}
                        max={p.total}
                        aria-label={`${p.left} ${t.passes.of} ${p.total}`}
                        className="hidden w-16 flex-nowrap sm:flex"
                      />
                      <span className={cn(!p.dead && 'font-semibold')}>
                        {p.left} {t.passes.of} {p.total}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="num hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                    {p.expires ? `${t.passes.until} ${p.expires}` : t.passes.unlimited}
                  </TableCell>
                  <TableCell className={cn('hidden px-4 py-2.5 text-muted-foreground md:table-cell', cellNum)}>
                    <span className="flex flex-col items-end gap-0.5">
                      <span>{p.sold}</span>
                      {p.soldBy && <span className="text-xs">{p.soldBy}</span>}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </DesktopOnly>
          </>
        )}
      </TableShell>
    </div>
  );
}
