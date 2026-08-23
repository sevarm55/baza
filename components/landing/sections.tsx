import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CarFront,
  Check,
  ChevronsUpDown,
  CreditCard,
  NotebookPen,
  PhoneOff,
  Plus,
  ReceiptText,
  Tags,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { AuthTrigger } from '@/components/auth-buttons';
import { ActivityItem } from '@/components/patterns/activity-item';
import { Delta, Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel } from '@/components/patterns/panel';
import { PersonAvatar } from '@/components/patterns/person';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendChart } from '@/app/owner/reports/report/trend-chart';
import { Heatmap } from '@/app/owner/reports/report/heatmap';
import { BranchCompare } from '@/app/owner/reports/report/branch-compare';
import type { Dict } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { addLabelTerm, unitCount, unitForms } from '@/lib/i18n/terms';
import { getNiche } from '@/lib/niches';
import { APP_STORE_URL, PRICE, TRIAL_DAYS } from '@/lib/plan';
import { cn } from '@/lib/utils';
import { DEMO, DEMO_ACTIVITY, DEMO_BRANCHES, DEMO_HEAT, DEMO_POINTS } from './demo';
import { BrowserFrame, DemoBadge, Eyebrow, PhoneFrame } from './frames';

/* Один контейнер на все секции: та же ширина, что у кабинета. */
export const SHELL = 'mx-auto w-full max-w-[1200px] px-5 md:px-8';

const CTA = cn(buttonVariants({ size: 'lg' }), 'px-5');
const CTA_GHOST = cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'px-5');

type Props = { t: Dict };

const TZ = 'Asia/Yerevan';

function money(n: number, locale: string) {
  return formatMoney(n, 'AMD', locale);
}

/* ------------------------------- hero ------------------------------- */

export function Hero({ t }: Props) {
  const l = t.landing;
  return (
    <section className={cn(SHELL, 'grid items-center gap-10 pt-12 pb-16 md:pt-20 md:pb-24 lg:grid-cols-12 lg:gap-12')}>
      <div className="flex flex-col gap-5 lg:col-span-5">
        <Eyebrow>{l.hero.eyebrow}</Eyebrow>
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance md:text-[42px]">{l.hero.title}</h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">{l.hero.lead}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <AuthTrigger mode="register" className={CTA}>
            {l.hero.cta}
          </AuthTrigger>
          <a href="#how" className={CTA_GHOST}>
            {l.hero.secondary}
          </a>
        </div>
        <p className="num text-sm text-muted-foreground">{l.hero.note(TRIAL_DAYS)}</p>
      </div>

      <div className="relative lg:col-span-7">
        <HeroComposition t={t} />
      </div>
    </section>
  );
}

/** Кабинет владельца с телефоном мойщика поверх: два экрана одного дня. */
function HeroComposition({ t }: Props) {
  const l = t.landing;
  const m = (n: number) => money(n, t.locale);
  return (
    <div className="relative">
      <BrowserFrame
        badge={<DemoBadge label={l.hero.demo} />}
        title={
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            <span className="font-medium text-foreground">{DEMO.branches[0]}</span>
            <ChevronsUpDown className="size-3" aria-hidden />
            <span aria-hidden>/</span>
            <span>{t.owner.tabToday}</span>
          </span>
        }
      >
        <div className="flex flex-col gap-3 p-3 md:p-4">
          <MetricStrip columns={4}>
            <Metric size="md" label={t.owner.profit} value={m(DEMO.profit)} delta={<Delta value={DEMO.profit - DEMO.prevProfit} formatted={m(DEMO.profit - DEMO.prevProfit)} />} hint={`${Math.round((DEMO.profit / DEMO.revenue) * 100)}% ${t.owner.kept}`} />
            <Metric size="sm" label={t.owner.revenue} value={m(DEMO.revenue)} hint={`${unitCount(DEMO.cars, getNiche('carwash').unitOne, t.locale)} · ${t.owner.avgCheck} ${m(DEMO.avgCheck)}`} />
            <Metric size="sm" label={t.owner.payrollAccrued} value={`−${m(DEMO.payroll)}`} hint={`3 ${t.owner.onShift.toLocaleLowerCase(t.locale)}`} />
            <Metric size="sm" label={t.owner.costs} value={`−${m(DEMO.costs)}`} />
          </MetricStrip>
          <div className="grid gap-3 md:grid-cols-12">
            <Panel className="md:col-span-5" title={t.today.nowWorking} padded={false} actions={<StatusBadge tone="success" dot>{t.owner.onShift} · 3</StatusBadge>}>
              <ul className="divide-y divide-border">
                {DEMO.staff.map((s) => (
                  <li key={s.name} className="flex items-center gap-2.5 px-3 py-2">
                    <PersonAvatar name={s.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="num block text-xs text-muted-foreground">{s.cars} · {s.percent}%</span>
                    </span>
                    <span className="num text-sm font-semibold">{m(s.earned)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel
              className="md:col-span-7"
              title={t.activity.title}
              padded={false}
              actions={
                <span className="inline-flex items-center gap-1.5 text-xs text-success">
                  <span className="now-dot size-1.5 rounded-full bg-success" aria-hidden />
                  {t.activity.live}
                </span>
              }
            >
              <ul className="divide-y divide-border">
                {DEMO_ACTIVITY.slice(0, 4).map((row) => (
                  <ActivityItem key={row.id} row={row} currency="AMD" timezone={TZ} dense className="px-3" />
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </BrowserFrame>

      <PhoneFrame className="absolute -right-4 -bottom-14 hidden scale-[0.78] origin-bottom-right lg:block">
        <WorkerScreen t={t} compact />
      </PhoneFrame>
    </div>
  );
}

/** Экран мойщика: запись машины в три нажатия. Статичный, из тех же контролов. */
function WorkerScreen({ t, compact = false }: Props & { compact?: boolean }) {
  const m = (n: number) => money(n, t.locale);
  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{t.phone.tabShift}</span>
        <StatusBadge tone="success" dot>{t.work.onShift}</StatusBadge>
      </div>
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <div className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">{t.work.earnedToday}</div>
        <div className="num text-xl font-semibold">{m(DEMO.staff[0].earned)}</div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex h-10 items-center rounded-md border border-input bg-card px-3">
          <span className="num text-base font-semibold tracking-wide">{DEMO.plates[0]}</span>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {DEMO.services.map((s, i) => (
            <span key={s} className={cn('flex-1 rounded-md py-1.5 text-center text-xs font-medium', i === 0 ? 'border border-border bg-card' : 'text-muted-foreground')}>
              {s}
            </span>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {[t.payment.cash, t.payment.card, t.payment.transfer].map((s, i) => (
            <span key={s} className={cn('flex-1 rounded-md py-1.5 text-center text-xs font-medium', i === 1 ? 'border border-border bg-card' : 'text-muted-foreground')}>
              {s}
            </span>
          ))}
        </div>
        <div className="flex h-10 items-center justify-between rounded-md border border-input bg-card px-3">
          <span className="text-muted-foreground">{t.csv.price}</span>
          <span className="num font-semibold">{m(6_000)}</span>
        </div>
        <span className={cn(buttonVariants({ size: 'default' }), 'w-full')}>
          <Plus data-icon="inline-start" aria-hidden />
          {addLabelTerm(getNiche('carwash').addLabel, t.locale)}
        </span>
      </div>
      {!compact && (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {DEMO.plates.slice(1, 4).map((p, i) => (
            <li key={p} className="flex items-center gap-2 px-3 py-2">
              <span className="num flex-1 font-medium">{p}</span>
              <span className="text-xs text-muted-foreground">{DEMO.services[i % 3]}</span>
              <span className="num text-sm">{m([3_500, 4_000, 6_000][i])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ problem ------------------------------ */

export function Problem({ t }: Props) {
  const l = t.landing.problem;
  const icons = [NotebookPen, Users, ReceiptText, PhoneOff];
  return (
    <section className={cn(SHELL, 'py-14 md:py-20')} aria-labelledby="problem-title">
      <h2 id="problem-title" className="mb-8 text-[24px] leading-tight font-semibold tracking-[-0.01em] md:text-[28px]">
        {l.title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {l.items.map((item, i) => {
          const Icon = icons[i];
          return (
            <div key={item.title} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <span className="flex size-8 items-center justify-center rounded-md bg-destructive-soft text-destructive-soft-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="text-[15px] leading-snug font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- flow -------------------------------- */

export function Flow({ t }: Props) {
  const l = t.landing.how;
  const m = (n: number) => money(n, t.locale);
  const visuals: ReactNode[] = [
    <span key="car" className="num rounded-md border border-input bg-card px-2.5 py-1 text-sm font-semibold tracking-wide">{DEMO.plates[0]}</span>,
    <span key="service" className="rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium">{DEMO.services[0]}</span>,
    <span key="crew" className="flex items-center gap-1.5"><PersonAvatar name={DEMO.staff[0].name} size="sm" /><span className="text-sm font-medium">{DEMO.staff[0].name}</span></span>,
    <Badge key="pay" variant="success">{t.payment.card} · {m(6_000)}</Badge>,
    <span key="stat" className="num text-sm font-semibold">{t.owner.profit} {m(DEMO.profit)}</span>,
  ];
  const icons = [CarFront, Tags, UserRound, CreditCard, BarChart3];

  return (
    <section id="how" className="scroll-mt-16 border-y border-border bg-card py-14 md:py-20" aria-labelledby="how-title">
      <div className={SHELL}>
        <div className="mb-10 max-w-2xl">
          <h2 id="how-title" className="text-[24px] leading-tight font-semibold tracking-[-0.01em] md:text-[28px]">
            {l.title}
          </h2>
          <p className="mt-2 text-base text-muted-foreground">{l.lead}</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-5 md:gap-0">
          {l.steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <li key={step.title} className="relative flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:rounded-none md:border-r-0 md:first:rounded-l-lg md:last:rounded-r-lg md:last:border-r">
                <span className="flex items-center gap-2 text-2xs font-medium tracking-wider text-muted-foreground uppercase">
                  <Icon className="size-3.5 text-primary" aria-hidden />
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[15px] font-semibold">{step.title}</span>
                <span className="text-sm text-muted-foreground">{step.body}</span>
                <span className="mt-auto flex h-9 items-center">{visuals[i]}</span>
                {i < l.steps.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-card text-muted-foreground md:block" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ----------------------------- product ----------------------------- */

function Feature({
  id,
  label,
  title,
  body,
  children,
  reverse = false,
  wide = false,
}: {
  id: string;
  label: string;
  title: string;
  body: string;
  children: ReactNode;
  reverse?: boolean;
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div id={id} className="scroll-mt-16 flex flex-col gap-6">
        <div className="max-w-2xl">
          <Eyebrow>{label}</Eyebrow>
          <h3 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.01em] md:text-[26px]">{title}</h3>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div id={id} className={cn('scroll-mt-16 grid items-center gap-8 lg:grid-cols-12 lg:gap-12', reverse && 'lg:[&>*:first-child]:order-2')}>
      <div className="lg:col-span-5">
        <Eyebrow>{label}</Eyebrow>
        <h3 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.01em] md:text-[26px]">{title}</h3>
        <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="min-w-0 lg:col-span-7">{children}</div>
    </div>
  );
}

export function Product({ t }: Props) {
  const l = t.landing;
  const s = l.sections;
  const m = (n: number) => money(n, t.locale);
  const demo = <DemoBadge label={l.hero.demo} />;

  return (
    <section id="features" className={cn(SHELL, 'scroll-mt-16 flex flex-col gap-20 py-16 md:gap-28 md:py-24')} aria-labelledby="features-title">
      <h2 id="features-title" className="sr-only">
        {s.title}
      </h2>

      <Feature id="shift" label={s.shift.label} title={s.shift.title} body={s.shift.body}>
        <div className="flex justify-center gap-6 lg:justify-start">
          <PhoneFrame>
            <WorkerScreen t={t} />
          </PhoneFrame>
          <div className="hidden max-w-56 flex-col justify-center gap-3 md:flex">
            {[DEMO.plates[0], DEMO.plates[1], DEMO.plates[2]].map((p, i) => (
              <div key={p} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <Check className="size-3.5 text-success" aria-hidden />
                <span className="num font-medium">{p}</span>
                <span className="ml-auto text-xs text-muted-foreground">{['12:41', '12:05', '11:48'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </Feature>

      <Feature id="today" label={s.today.label} title={s.today.title} body={s.today.body} reverse>
        <BrowserFrame badge={demo} title={`${DEMO.branches[0]} / ${t.owner.tabToday}`}>
          <div className="flex flex-col gap-3 p-3">
            <MetricStrip columns={4}>
              <Metric size="sm" label={t.owner.profit} value={m(DEMO.profit)} />
              <Metric size="sm" label={t.owner.revenue} value={m(DEMO.revenue)} hint={unitCount(DEMO.cars, getNiche('carwash').unitOne, t.locale)} />
              <Metric size="sm" label={t.owner.payrollAccrued} value={`−${m(DEMO.payroll)}`} />
              <Metric size="sm" label={t.owner.costs} value={`−${m(DEMO.costs)}`} />
            </MetricStrip>
            <Panel
              title={t.activity.title}
              padded={false}
              actions={
                <span className="inline-flex items-center gap-1.5 text-xs text-success">
                  <span className="now-dot size-1.5 rounded-full bg-success" aria-hidden />
                  {t.activity.live}
                </span>
              }
            >
              <ul className="divide-y divide-border">
                {DEMO_ACTIVITY.slice(0, 6).map((row) => (
                  <ActivityItem key={row.id} row={row} currency="AMD" timezone={TZ} dense className="px-3" />
                ))}
              </ul>
            </Panel>
          </div>
        </BrowserFrame>
      </Feature>

      <Feature id="payroll" label={s.payroll.label} title={s.payroll.title} body={s.payroll.body}>
        <BrowserFrame badge={demo} title={`${DEMO.branches[0]} / ${t.owner.tabPayroll}`}>
          <div className="p-3">
            <Panel padded={false} title={t.owner.tabPayroll}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.settings.staff}</TableHead>
                    <TableHead className="text-right">{unitForms(getNiche('carwash').unitOne, t.locale).many}</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">{t.reports.charts.earned}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO.staff.map((st) => (
                    <TableRow key={st.name}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <PersonAvatar name={st.name} size="sm" />
                          <span className="font-medium">{st.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="num text-right">{st.cars}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{st.percent}%</TableCell>
                      <TableCell className="num text-right font-semibold">{m(st.earned)}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(buttonVariants({ variant: 'outline', size: 'xs' }))}>
                          <Banknote data-icon="inline-start" aria-hidden />
                          {t.payroll.pay}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        </BrowserFrame>
      </Feature>

      <Feature id="expenses" label={s.expenses.label} title={s.expenses.title} body={s.expenses.body} reverse>
        <BrowserFrame badge={demo} title={`${DEMO.branches[0]} / ${t.expenses.title}`}>
          <div className="grid gap-3 p-3 md:grid-cols-12">
            <Panel className="md:col-span-7" padded={false} title={t.expenses.title}>
              <ul className="divide-y divide-border">
                {DEMO.expenses.map((e) => (
                  <li key={e.category} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 font-medium">{e.category}</span>
                    <span className="text-xs text-muted-foreground">{e.monthly ? t.expenses.perMonth : t.expenses.oneOff}</span>
                    <span className="num font-semibold">{m(e.amount)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card px-4 py-2 text-sm md:col-span-5">
              <div className="flex justify-between py-2"><span className="text-muted-foreground">{t.owner.revenue}</span><span className="num">{m(DEMO.revenue)}</span></div>
              <div className="flex justify-between py-2"><span className="text-muted-foreground">{t.owner.payrollAccrued}</span><span className="num">−{m(DEMO.payroll)}</span></div>
              <div className="flex justify-between py-2"><span className="text-muted-foreground">{t.owner.costs}</span><span className="num">−{m(DEMO.costs)}</span></div>
              <div className="flex justify-between py-2 font-semibold"><span>{t.owner.profit}</span><span className="num">{m(DEMO.profit)}</span></div>
            </div>
          </div>
        </BrowserFrame>
      </Feature>

      <Feature id="reports" label={s.reports.label} title={s.reports.title} body={s.reports.body} wide>
        <BrowserFrame badge={demo} title={`${DEMO.branches[0]} / ${t.reports.title}`}>
          <div className="grid gap-3 p-3 lg:grid-cols-12">
            <TrendChart className="lg:col-span-7" points={DEMO_POINTS} currency="AMD" unitOne={getNiche('carwash').unitOne} byHour={false} compare height="h-60" />
            <Heatmap className="lg:col-span-5" rows={DEMO_HEAT} weekdays={weekdayNames(t.locale)} currency="AMD" unitOne={getNiche('carwash').unitOne} />
          </div>
        </BrowserFrame>
      </Feature>

      <Feature id="branches" label={s.branches.label} title={s.branches.title} body={s.branches.body}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-64 shrink-0 rounded-lg border border-border bg-popover p-1 text-sm">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t.points.title}</div>
              {DEMO.branches.map((b, i) => (
                <div key={b} className={cn('flex items-center gap-2.5 rounded-sm px-2 py-1.5', i === 0 && 'bg-muted')}>
                  <span className="size-1.5 rounded-full bg-success" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b}</span>
                    <span className="block text-xs text-muted-foreground">{t.roles.owner}</span>
                  </span>
                  {i === 0 && <Check className="size-4 text-primary" aria-hidden />}
                </div>
              ))}
              <div className="mt-1 flex items-center gap-2.5 border-t border-border px-2 py-1.5 text-muted-foreground">
                <Building2 className="size-4" aria-hidden />
                {t.points.manage}
              </div>
            </div>
          </div>
          <BranchCompare rows={DEMO_BRANCHES} currency="AMD" unitLabel={unitForms(getNiche('carwash').unitOne, t.locale).many} />
        </div>
      </Feature>
    </section>
  );
}

function weekdayNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/* ------------------------------- app ------------------------------- */

export function AppSection({ t }: Props) {
  const l = t.landing.app;
  return (
    <section className="border-y border-border bg-card py-16 md:py-20" aria-labelledby="app-title">
      <div className={cn(SHELL, 'grid items-center gap-10 lg:grid-cols-12')}>
        <div className="flex flex-col gap-4 lg:col-span-6">
          <h2 id="app-title" className="text-[24px] leading-tight font-semibold tracking-[-0.01em] md:text-[28px]">
            {l.title}
          </h2>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">{l.lead}</p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer" aria-label={l.appStore} className="inline-flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-store-badge.svg" alt="" width={132} height={44} aria-hidden />
            </a>
            <span className="text-sm text-muted-foreground">{l.android}</span>
          </div>
        </div>
        <div className="flex justify-center lg:col-span-6 lg:justify-end">
          <div className="w-[272px] overflow-hidden rounded-[28px] border border-border bg-card p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/app-today.png" alt={l.title} width={414} height={900} className="h-auto w-full rounded-[22px]" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ pricing ------------------------------ */

export function Pricing({ t }: Props) {
  const l = t.landing.price;
  return (
    <section id="price" className={cn(SHELL, 'scroll-mt-16 py-16 md:py-24')} aria-labelledby="price-title">
      <div className="grid gap-8 rounded-lg border border-border bg-card p-6 md:grid-cols-12 md:p-10">
        <div className="md:col-span-5">
          <h2 id="price-title" className="text-[24px] leading-tight font-semibold tracking-[-0.01em] md:text-[28px]">
            {l.title}
          </h2>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-[40px] leading-none font-semibold tracking-[-0.02em]">{formatMoney(PRICE, 'AMD', t.locale)}</span>
            <span className="text-sm text-muted-foreground">
              {l.per} · {l.point}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AuthTrigger mode="register" className={CTA}>
              {t.landing.hero.cta}
            </AuthTrigger>
            <Badge variant="lime">{l.trial(TRIAL_DAYS)}</Badge>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{l.note}</p>
        </div>
        <ul className="grid content-center gap-3 md:col-span-7 md:grid-cols-2">
          {l.includes.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-success-soft text-success-soft-foreground">
                <Check className="size-3" aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------- faq -------------------------------- */

export function Faq({ t }: Props) {
  const l = t.landing.faq;
  return (
    <section id="faq" className={cn(SHELL, 'scroll-mt-16 pb-16 md:pb-24')} aria-labelledby="faq-title">
      <div className="grid gap-8 lg:grid-cols-12">
        <h2 id="faq-title" className="text-[24px] leading-tight font-semibold tracking-[-0.01em] md:text-[28px] lg:col-span-4">
          {l.title}
        </h2>
        <Accordion className="lg:col-span-8">
          {l.items.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i}`}>
              <AccordionTrigger className="text-[15px] font-semibold">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ------------------------------ closing ------------------------------ */

export function Closing({ t }: Props) {
  const l = t.landing.closing;
  return (
    <section className="border-t border-border bg-card py-16 md:py-24">
      <div className={cn(SHELL, 'flex flex-col items-start gap-4')}>
        <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] md:text-[36px]">{l.title}</h2>
        <p className="max-w-md text-base text-muted-foreground">{l.lead}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <AuthTrigger mode="register" className={CTA}>
            {t.landing.hero.cta}
          </AuthTrigger>
          <span className="num text-sm text-muted-foreground">{l.note(TRIAL_DAYS)}</span>
        </div>
      </div>
    </section>
  );
}

export function Footer({ t }: Props) {
  return (
    <footer className="border-t border-border">
      <div className={cn(SHELL, 'flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted-foreground')}>
        <span>
          {t.app.name} · {t.landing.footer}
        </span>
        <nav aria-label={t.landing.nav.footerAria} className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground">
            {t.legal.privacy}
          </Link>
          <Link href="/support" className="hover:text-foreground">
            {t.legal.support}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
