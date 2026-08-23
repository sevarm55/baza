import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPeriodStats, getTenant, listStaff, startOfDay, startOfMonth } from '@/lib/queries';
import { getPayrollBoard } from '@/lib/payroll-board';
import { whoIsOnShift } from '@/lib/shifts';
import { formatMoney } from '@/lib/money';
import { hhmm } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, unitCount } from '@/lib/i18n/terms';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { AddStaff } from './add-staff';
import { StaffRoster } from './roster';
import { TeamWash } from './team-wash';
import type { StaffPerson } from './model';

/**
 * Люди.
 *
 * Страница отвечает на один вопрос: кто создаёт результат. Порядок тот
 * же, в каком его задают: во что обошлась команда за месяц, кто сейчас
 * на площадке и сколько не отдано, дальше сами люди и их месяц, а
 * управление человеком живёт в его карточке.
 *
 * Числа месячные, а смена — сейчас: «кто стоит на площадке» — вопрос
 * про сегодня, а «чего стоит этот человек» за один день не видно.
 *
 * Долг здесь называется, но не раскладывается: кому и за какой день —
 * вопрос зарплат, и считает его тот же лист (`getPayrollBoard`).
 */
export default async function StaffPage() {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит; своё название владельца
     проходит насквозь (см. terms.ts). В базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const [staff, month, present, board] = await Promise.all([
    listStaff(tenant.id),
    getPeriodStats(tenant.id, startOfMonth(tenant.timezone)),
    whoIsOnShift(tenant.id, startOfDay(tenant.timezone)),
    getPayrollBoard(tenant.id, tenant.timezone, t.locale),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const shiftOf = new Map(present.map((p) => [p.userId, p.openedAt]));
  const worked = new Map(month.byStaff.map((s) => [s.staffId ?? '', s]));

  /* Долг по человеку складывается из тех же строк, что видно на листе
     зарплат. Переплата за отменённую машину в долг не превращается. */
  const due = new Map<string, number>();
  for (const day of board.days) {
    for (const person of day.people) {
      if (!person.staffId || person.earned <= 0) continue;
      due.set(person.staffId, (due.get(person.staffId) ?? 0) + person.earned);
    }
  }

  const people: StaffPerson[] = staff
    .map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      percent: s.percent,
      roleLabel: s.role === 'owner' ? t.roles.owner : tenant.staffRole,
      owner: s.role === 'owner',
      // себя отключить нельзя — владелец потеряет доступ к кабинету
      canRemove: s.id !== session.uid,
      present: shiftOf.has(s.id),
      since: shiftOf.has(s.id) ? hhmm(shiftOf.get(s.id)!, tenant.timezone) : null,
      count: worked.get(s.id)?.count ?? 0,
      earned: worked.get(s.id)?.earned ?? 0,
      due: due.get(s.id) ?? 0,
    }))
    /* Сначала те, кто на площадке сейчас, потом отработавшие в этом
       месяце, потом остальные: «кто сейчас моет» спрашивают чаще, чем
       «кто на букву А». */
    .sort(
      (a, b) =>
        Number(b.present) - Number(a.present) ||
        b.earned - a.earned ||
        a.name.localeCompare(b.name, 'hy'),
    );

  /* Машин у бизнеса, а не сумма участий: машину, которую мыли втроём,
     сумма по людям посчитала бы трижды. */
  const cars = month.count;
  const payroll = month.byStaff.reduce((sum, r) => sum + r.earned, 0);
  const outstanding = board.totals.outstanding;
  const monthWord = t.owner.periodMonth.toLocaleLowerCase(t.locale);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title={t.settings.staff}
        description={t.settings.staffLead}
        actions={
          <>
            <TeamWash
              percent={tenant.teamPercent}
              currency={tenant.currency}
              staffRole={tenant.staffRole}
            />
            <AddStaff staffRole={tenant.staffRole} />
          </>
        }
      />

      <MetricStrip columns={3}>
        <Metric
          size="lg"
          label={t.owner.payrollAccrued}
          value={money(payroll)}
          hint={`${unitCount(cars, tenant.unitOne, t.locale)} · ${monthWord}`}
        />
        <Metric label={t.owner.onShift} value={String(present.length)} />
        <Metric
          label={t.owner.toPay}
          value={money(outstanding)}
          tone={outstanding > 0 ? 'warning' : 'default'}
          hint={
            outstanding > 0 ? (
              <Link href="/owner/payroll" className="text-primary hover:underline">
                {t.reports.toPayroll}
              </Link>
            ) : undefined
          }
        />
      </MetricStrip>

      <StaffRoster
        rows={people}
        currency={tenant.currency}
        unitOne={tenant.unitOne}
        staffRole={tenant.staffRole}
      />
    </div>
  );
}
