import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getFeed, getPeriodStats, getTenant, listStaff } from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { shiftsOnDay } from '@/lib/shifts';
import { dayBounds, isDate, localDate } from '@/lib/history';
import { daysInMonthOf, hhmm } from '@/lib/time';
import { formatMoney, staffShare } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
import { intlLocale } from '@/lib/i18n/format';
import { localizeTenantOrNull, serviceNameTerm, unitCount } from '@/lib/i18n/terms';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { EmptyState } from '@/components/patterns/states';
import { PersonAvatar } from '@/components/patterns/person';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Journal } from '../../today/journal';
import type { Op } from '../../today/model';

/**
 * День целиком: кто стоял на смене, что было сделано, что вышло, и
 * единственное в кабинете место, где видна сдача наличных по смене.
 */
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const { date } = await params;
  if (!isDate(date)) notFound();

  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const zone = tenant.timezone;
  const { from, to } = dayBounds(date, zone);

  const [stats, feed, crew, costs, roster] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    getFeed(tenant.id, from, 200, to),
    shiftsOnDay(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, to, daysInMonthOf(zone, from)),
    listStaff(tenant.id),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const profit = profitOf(stats.revenue, stats.payroll, costs);

  /* Записи уже посчитаны: доля из снимка процента в самой записи. */
  const ops: Op[] = feed.map((o) => {
    const share = o.staffPercent > 0 ? staffShare(o.price, o.staffPercent) : 0;
    return {
      id: o.id,
      time: hhmm(o.createdAt, zone),
      clientKey: o.clientKey,
      crew: o.crew.map((p) => ({
        staffId: p.staffId,
        name: p.name,
        color: personColor(p.name),
        earned: p.earned,
      })),
      authorName: o.staffName,
      serviceName: serviceNameTerm(o.serviceName, t.locale),
      payment: o.payment,
      paymentLabel: paymentLabel(o.payment, t),
      price: o.price,
      listPrice: o.listPrice !== null && o.listPrice > o.price ? o.listPrice : null,
      percent: o.staffPercent,
      share,
      yours: o.price - share,
    };
  });

  const title = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    timeZone: zone,
  }).format(from);

  const today = localDate(zone);
  const prev = shiftDay(date, -1);
  const next = shiftDay(date, +1);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        /* Заголовок здесь — данные, а не имя раздела: в шапке телефона
           стоит «Календарь» и «Клиенты», и без него было бы непонятно,
           какой день и какая машина открыты. */
        mobileTitle
        title={title}
        back={{ href: `/owner/calendar?m=${date.slice(0, 7)}`, label: t.calendar.title }}
        actions={
          <div className="flex items-center gap-1">
            <DayStep href={`/owner/day/${prev}`} back label={t.common.back} />
            {/* Вперёд не дальше сегодняшнего: завтрашнего дня ещё не было. */}
            <DayStep href={`/owner/day/${next}`} enabled={next <= today} label={t.common.next} />
          </div>
        }
      />

      <MetricStrip columns={4}>
        <Metric
          size="lg"
          label={profit >= 0 ? t.owner.profit : t.owner.inTheRed}
          value={money(Math.abs(profit))}
          tone={profit < 0 ? 'destructive' : 'default'}
        />
        <Metric
          label={t.owner.revenue}
          value={money(stats.revenue)}
          hint={
            <>
              {unitCount(stats.count, tenant.unitOne, t.locale)}
              {stats.avgCheck > 0 && ` · ${t.owner.avgCheck} ${money(stats.avgCheck)}`}
            </>
          }
        />
        <Metric
          label={t.owner.payrollAccrued}
          value={stats.payroll > 0 ? `−${money(stats.payroll)}` : money(0)}
          hint={`${t.payment.cash} ${money(stats.cash)}`}
        />
        <Metric
          label={t.expenses.title}
          value={costs.total > 0 ? `−${money(costs.total)}` : money(0)}
        />
      </MetricStrip>

      <PanelGrid at="xl">
        <Panel title={t.day.shifts} count={crew.length} className="xl:col-span-4" padded={false}>
          {crew.length === 0 ? (
            <EmptyState compact title={t.day.noShifts} description={t.day.noShiftsNote} />
          ) : (
            <ul className="divide-y divide-border">
              {crew.map((s) => (
                <li
                  key={`${s.userId}-${s.openedAt.getTime()}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <PersonAvatar name={s.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {s.closedAt
                        ? t.work.range(hhmm(s.openedAt, zone), hhmm(s.closedAt, zone))
                        : t.work.since(hhmm(s.openedAt, zone))}
                    </span>
                  </span>
                  {/* Сдача наличных: три разных состояния, и путать их
                      нельзя. Не отмечал это не ноль; сошлось: сумма и
                      тишина; разошлось: разница, ради неё смена и
                      закрывается вопросом. */}
                  <span className="shrink-0 text-end">
                    <Cash
                      open={s.closedAt === null}
                      expected={s.cashExpected}
                      declared={s.cashDeclared}
                      money={money}
                      t={t}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="min-w-0 xl:col-span-8">
          <Journal
            ops={ops}
            staff={roster.map((s) => ({ id: s.id, name: s.name }))}
            teamPercent={tenant.teamPercent}
            currency={tenant.currency}
            unitOne={tenant.unitOne}
            staffRole={tenant.staffRole}
            clientIdLabel={tenant.clientIdLabel}
            title={t.day.work}
            note={t.today.workAll(title)}
            empty={{ title: t.today.noRecords }}
            methods={[]}
          />
        </div>
      </PanelGrid>
    </div>
  );
}

function Cash({
  open,
  expected,
  declared,
  money,
  t,
}: {
  open: boolean;
  expected: number | null;
  declared: number | null;
  money: (n: number) => string;
  t: Dict;
}) {
  if (open) {
    return (
      <StatusBadge tone="success" dot>
        {t.day.stillOpen}
      </StatusBadge>
    );
  }

  if (expected === null || expected === 0) {
    return <span className="text-xs text-muted-foreground">{t.day.noCash}</span>;
  }

  if (declared === null) {
    return (
      <>
        <span className="num block text-sm font-semibold">{money(expected)}</span>
        <span className="block text-xs text-muted-foreground">{t.day.notDeclared}</span>
      </>
    );
  }

  const diff = declared - expected;
  return (
    <>
      <span className="num block text-sm font-semibold">{money(declared)}</span>
      <span className={`num block text-xs ${diff === 0 ? 'text-muted-foreground' : 'text-warning'}`}>
        {diff === 0 ? t.day.cashMatches : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}
      </span>
    </>
  );
}

function DayStep({
  href,
  enabled = true,
  back = false,
  label,
}: {
  href: string;
  enabled?: boolean;
  back?: boolean;
  label: string;
}) {
  const Icon = back ? ChevronLeft : ChevronRight;
  if (!enabled) {
    return (
      <Button variant="outline" size="icon-sm" aria-disabled aria-label={label} className="opacity-40">
        <Icon />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon-sm" render={<Link href={href} aria-label={label} />}>
      <Icon />
    </Button>
  );
}

function shiftDay(date: string, by: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + by, 12));
  return at.toISOString().slice(0, 10);
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
