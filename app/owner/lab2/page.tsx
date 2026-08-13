import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  getTenant,
  startOfDay,
} from '@/lib/queries';
import { windowFor } from '@/lib/summary-window';
import { hhmm } from '@/lib/time';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RevenueChart } from '../lab/revenue-chart';
import { getPeriod, PERIODS } from '../periods';

/**
 * Второй опыт: те же компоненты shadcn, другая палитра и другая
 * композиция.
 *
 * Первый вариант не понравился, и справедливо: библиотека даёт холодный
 * нейтральный серый, который на светлой теме выглядит канцелярским
 * бланком, а раскладка «четыре одинаковые карточки в ряд» уравнивает
 * итог с числом машин — глаз не знает, куда смотреть.
 *
 * Здесь поменяно ровно два слоя, и оба — не компоненты:
 *
 *   Цвет. Токены shadcn в проекте указывают на переменные табло, поэтому
 *   достаточно переопределить их в одном классе — библиотека
 *   перекрашивается сама. Палитра тёплая: кремовый фон, чистая белая
 *   карточка, почти чёрный тёплый текст, песочный акцент.
 *
 *   Композиция. Итог занимает половину ширины и набран крупно, а
 *   слагаемые стоят рядом тихими строками — не карточками. График идёт
 *   во всю ширину без коробки вокруг. Лента — таблица без обводок.
 *
 * Компоненты при этом всё те же: Card, Badge, Table, Separator,
 * ChartContainer. Опыт как раз про то, что библиотека отвечает за
 * поведение, а не за вид.
 */
export default async function Lab2Page({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { p } = await searchParams;
  const period = getPeriod(p);
  const w = windowFor(period.key, tenant.timezone);
  const { byHour, from, to, prevFrom, prevTo } = w;

  const [stats, feed, series, split, costs, prevStats, prevCosts] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    getFeed(tenant.id, from, 100, to),
    getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day', to),
    getPaymentSplit(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, to, w.spread),
    getPeriodStats(tenant.id, prevFrom, prevTo),
    getPeriodCosts(tenant.id, prevFrom, prevTo, w.spread),
  ]);

  const present = await whoIsOnShift(tenant.id, startOfDay(tenant.timezone));
  const presentIds = new Set(present.map((x) => x.userId));
  const crew = [
    ...present.map((x) => {
      const worked = stats.byStaff.find((s) => s.staffId === x.userId);
      return {
        id: x.userId,
        name: x.name,
        present: true,
        count: worked?.count ?? 0,
        earned: worked?.earned ?? 0,
      };
    }),
    ...stats.byStaff
      .filter((s) => !s.staffId || !presentIds.has(s.staffId))
      .map((s) => ({
        id: s.staffId ?? s.name ?? 'none',
        name: s.name,
        present: false,
        count: s.count,
        earned: s.earned,
      })),
  ];

  const money = (n: number) => formatMoney(n, tenant.currency);
  const profit = profitOf(stats.revenue, stats.payroll, costs);
  const prevProfit = profitOf(prevStats.revenue, prevStats.payroll, prevCosts);
  const diff = profit - prevProfit;
  const kept = stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0;

  const points = series.map((s) => ({
    label: byHour ? s.key.slice(11, 13) : s.key.slice(8, 10),
    value: s.revenue,
  }));

  const parts = [
    { label: tenant.unitOne, value: String(stats.count) },
    { label: hy.owner.revenue, value: money(stats.revenue) },
    { label: hy.owner.payroll, value: money(stats.payroll) },
    { label: hy.owner.costs, value: money(costs.oneOff + costs.monthlyShare) },
  ];

  return (
    <div className="lab-warm min-h-svh">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs tracking-[0.14em] uppercase">
              {tenant.name}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{hy.owner.tabToday}</h1>
          </div>

          <div className="flex gap-1.5">
            {PERIODS.map((x) => (
              <Link key={x.key} href={x.key === 'today' ? '/owner/lab2' : `/owner/lab2?p=${x.key}`}>
                <Badge
                  variant={period.key === x.key ? 'default' : 'outline'}
                  className="rounded-full px-3 py-1 font-normal"
                >
                  {x.label}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Итог слева и крупно, слагаемые справа тихими строками. Одна
            карточка вместо пяти: сравнивают их не между собой, а читают
            сверху вниз как расчёт. */}
        <Card>
          <CardContent className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <CardDescription>{hy.owner.profit}</CardDescription>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">
                  {money(profit)}
                </span>
                <Badge variant={diff >= 0 ? 'secondary' : 'destructive'} className="rounded-full">
                  {diff >= 0 ? '+' : '−'}
                  {money(Math.abs(diff))}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {kept}% {hy.owner.kept}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {parts.map((x, i) => (
                <div key={x.label}>
                  {i > 0 && <Separator className="mb-3" />}
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-muted-foreground text-sm">{x.label}</span>
                    <span className="text-base font-medium tabular-nums">{x.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* График без коробки: заголовок, линия, ничего вокруг. */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{hy.owner.revenue}</h2>
            <span className="text-muted-foreground text-sm">{period.label}</span>
          </div>
          <Separator className="mt-3 mb-4" />
          {points.length > 0 ? (
            <RevenueChart points={points} />
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{hy.common.empty}</p>
          )}
        </section>

        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{hy.owner.onShift}</h2>
              <span className="text-muted-foreground text-sm">{crew.length}</span>
            </div>
            <Separator className="mt-3 mb-4" />
            <div className="flex flex-col gap-3">
              {crew.length === 0 && (
                <p className="text-muted-foreground text-sm">{hy.common.empty}</p>
              )}
              {crew.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.name ?? '—'}</span>
                    {s.present && (
                      <Badge variant="outline" className="rounded-full font-normal">
                        {hy.owner.onShift}
                      </Badge>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-medium tabular-nums">
                      {money(s.earned)}
                    </span>
                    <span className="text-muted-foreground block text-xs tabular-nums">
                      {s.count} {tenant.unitOne}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{hy.owner.colPayment}</h2>
              <span className="text-muted-foreground text-sm">{money(stats.revenue)}</span>
            </div>
            <Separator className="mt-3 mb-4" />
            <div className="flex flex-col gap-3">
              {split
                .filter((x) => x.revenue > 0)
                .map((x) => (
                  <div key={x.payment} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{paymentLabel(x.payment)}</span>
                    <span className="text-sm font-medium tabular-nums">{money(x.revenue)}</span>
                  </div>
                ))}
              {split.every((x) => x.revenue === 0) && (
                <p className="text-muted-foreground text-sm">{hy.common.empty}</p>
              )}
            </div>
          </section>
        </div>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">{hy.owner.feed}</h2>
            <span className="text-muted-foreground text-sm">{feed.length}</span>
          </div>
          <Separator className="mt-3 mb-1" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{hy.owner.tabClients}</TableHead>
                <TableHead>{tenant.staffRole}</TableHead>
                <TableHead>{hy.owner.colService}</TableHead>
                <TableHead className="text-right">{hy.owner.colPrice}</TableHead>
                <TableHead className="text-right">{hy.owner.colTime}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.slice(0, 10).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium tabular-nums">{o.clientKey ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{o.staffName ?? '—'}</TableCell>
                  <TableCell>{o.serviceName}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.price)}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {hhmm(o.createdAt, tenant.timezone)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
