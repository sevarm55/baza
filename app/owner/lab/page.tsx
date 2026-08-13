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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RevenueChart } from './revenue-chart';
import { PeriodTabsLab } from './period-tabs';
import { FeedRowActions } from './row-actions';
import { getPeriod, PERIODS } from '../periods';

/**
 * Опыт: главная целиком из готовых shadcn-компонентов.
 *
 * Ни одного своего класса, ни одной переменной табло — только `Card`,
 * `Badge`, `Table`, `Separator` и график на `ChartContainer`. Даже
 * переключатель периода здесь ссылками с `Badge`, а не нашей дорожкой с
 * переезжающей плашкой.
 *
 * Живёт отдельным адресом, а не подменяет рабочую главную: сравнивать
 * два языка надо рядом, а не по памяти. Данные те же самые и считаются
 * теми же функциями — иначе сравнивали бы не оформление, а цифры.
 *
 * Что тут видно сразу: библиотека даёт ровную типографику и одинаковые
 * отступы бесплатно, но всё оказывается одного веса. У табло показание
 * «вам остаётся» кричит размером и тёмной плитой, а здесь оно такая же
 * карточка, как «машин» — глаз не знает, куда смотреть первым, и читает
 * страницу слева направо, как таблицу.
 */
export default async function LabPage({
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

  /* Ряд для графика: те же точки, что у рабочего экрана, но без
     достройки пустых часов — стандартный график их и не покажет. */
  const points = series.map((s) => ({
    label: byHour ? s.key.slice(11, 13) : s.key.slice(8, 10),
    value: s.revenue,
  }));

  /* Доля от выручки полосой: `Progress` библиотеки на настоящем числе.
     У «машин» доли нет — там полосе взяться неоткуда, и её там нет. */
  const share = (n: number) => (stats.revenue > 0 ? Math.round((n / stats.revenue) * 100) : 0);
  const cards = [
    { label: tenant.unitOne, value: String(stats.count), share: null as number | null },
    { label: hy.owner.revenue, value: money(stats.revenue), share: 100 },
    { label: hy.owner.payroll, value: money(stats.payroll), share: share(stats.payroll) },
    {
      label: hy.owner.costs,
      value: money(costs.oneOff + costs.monthlyShare),
      share: share(costs.oneOff + costs.monthlyShare),
    },
  ];

  return (
    <div className="lab-ui flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{hy.owner.tabToday}</h1>
          <p className="text-muted-foreground text-sm">{period.label}</p>
        </div>

        {/* Период — `Tabs` библиотеки: дорожка с подсветкой, роли для
            читалки и переход стрелками достаются даром. */}
        <PeriodTabsLab periods={PERIODS} current={period.key} />
      </div>

      {/* Кнопки библиотеки во всех видах — на настоящих действиях
          страницы, а не на образцах. Видно, что «главное» и «опасное»
          отличаются только заливкой: иерархию задаёт не компонент, а
          тот, кто расставляет их по экрану. */}
      <div className="flex flex-wrap gap-2">
        {/* `render` вместо `asChild`: кнопка здесь из Base UI, и ссылку
            она принимает именно так. `nativeButton={false}` обязателен —
            иначе библиотека честно ругается, что под видом кнопки ей
            подсунули ссылку и native-семантика кнопки потеряна. */}
        <Button nativeButton={false} render={<Link href="/work" />}>
          + {tenant.unitOne}
        </Button>
        <Button nativeButton={false} variant="secondary" render={<Link href="/owner/expenses" />}>
          {hy.expenses.add}
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/owner/payroll" />}>
          {hy.owner.tabPayroll}
        </Button>
        <Button nativeButton={false} variant="ghost" render={<Link href="/owner/reports" />}>
          {hy.reports.title}
        </Button>
        <Button nativeButton={false} variant="link" render={<Link href="/owner/export?days=30" />}>
          {hy.settings.exportCsv}
        </Button>
      </div>

      {/* Четыре карточки в ряд плюс пятая с итогом — как в примерах
          дашбордов shadcn. Все одного веса, включая итог. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="bg-muted/40 transition-colors hover:bg-muted/70">
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{c.value}</CardTitle>
            </CardHeader>
            {c.share !== null && (
              <CardContent className="flex items-center gap-3">
                <Progress value={c.share} className="flex-1" />
                <span className="text-muted-foreground text-xs tabular-nums">{c.share}%</span>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* `Alert` библиотеки на настоящем месте: чем считается разница
          под итогом. У нас это подпись под числом, здесь — отдельная
          полоса во всю ширину. */}
      <Alert>
        <AlertTitle>{period.label}</AlertTitle>
        <AlertDescription>
          {prevStats.count > 0 ? hy.owner.vsPrevPeriod : hy.owner.noBase}
        </AlertDescription>
      </Alert>

      <Card className="bg-muted/40">
        <CardHeader>
          <CardDescription>{hy.owner.profit}</CardDescription>
          <CardTitle className="text-4xl tabular-nums">{money(profit)}</CardTitle>
          <CardAction>
            <Badge variant={diff >= 0 ? 'default' : 'destructive'}>
              {diff >= 0 ? '+' : '−'}
              {money(Math.abs(diff))}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {kept}% {hy.owner.kept}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-muted/40 lg:col-span-2">
          <CardHeader>
            <CardTitle>{hy.owner.revenue}</CardTitle>
            <CardDescription>{period.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {points.length > 0 ? (
              <RevenueChart points={points} />
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">{hy.common.empty}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle>{hy.owner.onShift}</CardTitle>
            <CardDescription>{crew.length}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {crew.length === 0 && (
              <p className="text-muted-foreground text-sm">{hy.common.empty}</p>
            )}
            {crew.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                  <div className="flex min-w-0 items-center gap-2">
                    {/* Аватар библиотеки: буква имени вместо точки цвета,
                        которой человек отмечен у нас в ленте и на смене. */}
                    <Avatar className="size-7">
                      <AvatarFallback>{(s.name ?? '—').slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{s.name ?? '—'}</span>
                    {s.present && <Badge variant="secondary">{hy.owner.onShift}</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums">{money(s.earned)}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {s.count} {tenant.unitOne}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">{hy.owner.colPayment}</p>
              {split
                .filter((x) => x.revenue > 0)
                .map((x) => (
                  <div key={x.payment} className="flex items-center justify-between text-sm">
                    <span>{paymentLabel(x.payment)}</span>
                    <span className="tabular-nums">{money(x.revenue)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/40">
        <CardHeader>
          <CardTitle>{hy.owner.feed}</CardTitle>
          <CardDescription>{feed.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{hy.owner.tabClients}</TableHead>
                <TableHead>{tenant.staffRole}</TableHead>
                <TableHead>{hy.owner.colService}</TableHead>
                <TableHead>{hy.owner.colPayment}</TableHead>
                <TableHead className="text-right">{hy.owner.colPrice}</TableHead>
                <TableHead className="text-right">{hy.owner.colTime}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.slice(0, 12).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium tabular-nums">{o.clientKey ?? '—'}</TableCell>
                  <TableCell>{o.staffName ?? '—'}</TableCell>
                  <TableCell>{o.serviceName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{paymentLabel(o.payment)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.price)}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {hhmm(o.createdAt, tenant.timezone)}
                  </TableCell>
                  <TableCell className="text-right">
                    <FeedRowActions plate={o.clientKey ?? '—'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
