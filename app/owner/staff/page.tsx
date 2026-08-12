import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPeriodStats, getTenant, listStaff, startOfDay, startOfMonth } from '@/lib/queries';
import { whoIsOnShift } from '@/lib/shifts';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { StaffTable, type StaffPerson } from '@/components/staff-table';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { IconCar, IconPeople, IconShift, IconWallet } from '@/components/flow-icons';
import { PageHead } from '@/components/page-head';
import { AddStaffForm } from './add-staff-form';

/**
 * Люди.
 *
 * Была страница-справочник: список имён с телефоном и процентом. Она
 * отвечала, кто заведён, и молчала о том, ради чего этих людей держат, —
 * за этим владелец шёл на сводку и в зарплаты, а вернувшись, не помнил,
 * у кого какой процент.
 *
 * Собрана по тем же правилам, что сводка, зарплаты и расходы: сверху
 * полоса показаний, ниже приборы одинакового веса, правка — панелью
 * справа. Числа месячные: смена отвечает на «кто сейчас», а «чего стоит
 * этот человек» за один день не видно.
 */
export default async function StaffPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  /* «Кто на смене» — всегда сейчас, а не за месяц: это вопрос про
     площадку, а не про деньги. Поэтому два разных отсчёта рядом. */
  const [staff, month, present] = await Promise.all([
    listStaff(tenant.id),
    getPeriodStats(tenant.id, startOfMonth(tenant.timezone)),
    whoIsOnShift(tenant.id, startOfDay(tenant.timezone)),
  ]);

  const presentIds = new Set(present.map((p) => p.userId));
  const worked = new Map(month.byStaff.map((s) => [s.staffId ?? '', s]));
  const money = (n: number) => formatMoney(n, tenant.currency);

  const cars = month.byStaff.reduce((s, r) => s + r.count, 0);
  const payroll = month.byStaff.reduce((s, r) => s + r.earned, 0);

  const people: StaffPerson[] = staff.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    percent: s.percent,
    roleLabel: s.role === 'owner' ? hy.roles.owner : tenant.staffRole,
    // себя отключить нельзя — владелец потеряет доступ к кабинету
    canRemove: s.id !== session.uid,
    present: presentIds.has(s.id),
    count: worked.get(s.id)?.count ?? 0,
    earned: money(worked.get(s.id)?.earned ?? 0),
  }));

  return (
    <>
      <PageHead title={hy.settings.staff} meta={hy.settings.percentNote} />

      {/* Полоса той же формы, что на остальных экранах: сколько людей,
          сколько их сейчас на мойке и во что они обошлись за месяц.
          Знаков вычитания нет — зарплата не остаток от машин, а доля в
          них. */}
      <FlowStrip
        links={[
          { label: hy.settings.staff, value: String(staff.length), icon: IconPeople, tone: 'teal' },
          { label: hy.owner.onShift, value: String(present.length), icon: IconShift, tone: 'violet' },
          {
            label: tenant.unitOne,
            value: String(cars),
            note: hy.owner.periodMonth.toLowerCase(),
            icon: IconCar,
            tone: 'teal',
          },
          {
            label: hy.owner.tabPayroll,
            value: money(payroll),
            note: hy.owner.periodMonth.toLowerCase(),
            strong: true,
            icon: IconWallet,
            tone: 'lime',
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <Panel title={hy.settings.staff} count={staff.length} className="lg:col-span-8">
          <StaffTable rows={people} unit={tenant.unitOne} />
        </Panel>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Panel title={hy.settings.addStaff}>
            <AddStaffForm staffRole={tenant.staffRole} />
          </Panel>
          <p className="note">{hy.settings.staffNote}</p>
        </div>
      </div>
    </>
  );
}
