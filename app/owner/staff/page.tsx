import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPeriodStats, getTenant, listStaff, startOfDay, startOfMonth } from '@/lib/queries';
import { getPayrollBoard } from '@/lib/payroll-board';
import { whoIsOnShift } from '@/lib/shifts';
import { formatMoney } from '@/lib/money';
import { hhmm } from '@/lib/time';
import { Figures, Plate } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { AddStaff } from './add-staff';
import { StaffRoster } from './roster';
import { TeamWash } from './team-wash';
import type { StaffPerson } from './model';
import { getDict } from '@/lib/i18n/server';
import { unitWord } from '@/lib/i18n/terms';
import { localizeTenantOrNull } from '@/lib/i18n/terms';

/**
 * Люди.
 *
 * Страница отвечает на один вопрос: кто создаёт результат. И отвечает в
 * том порядке, в каком его задают:
 *
 *   1. во что обошлась команда за месяц → плита наверху;
 *   2. сколько их и кто сейчас на мойке → три числа рядом с ней;
 *   3. кто именно и что сделал          → список;
 *   4. как им управлять                 → карточка человека.
 *
 * Числа месячные, а смена — сейчас, и это два разных отсчёта нарочно:
 * «кто стоит на площадке» — вопрос про сегодня, а «чего стоит этот
 * человек» за один день не видно.
 *
 * Долг здесь называется, но не раскладывается: сколько кому отдать за
 * какой рабочий день — вопрос зарплат, и вторая такая страница внутри
 * этой была бы копией, которая рано или поздно разойдётся с оригиналом.
 * Долг считает тот же лист (`getPayrollBoard`), которым живут зарплаты.
 */
export default async function StaffPage() {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  /* «Кто на смене» — всегда сейчас, а не за месяц: это вопрос про
     площадку, а не про деньги. Поэтому два разных отсчёта рядом. */
  const [staff, month, present, board] = await Promise.all([
    listStaff(tenant.id),
    getPeriodStats(tenant.id, startOfMonth(tenant.timezone)),
    whoIsOnShift(tenant.id, startOfDay(tenant.timezone)),
    getPayrollBoard(tenant.id, tenant.timezone),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const shiftOf = new Map(present.map((p) => [p.userId, p.openedAt]));
  const worked = new Map(month.byStaff.map((s) => [s.staffId ?? '', s]));

  /* Долг по человеку складывается из тех же строк, которые видно на
     листе зарплат. Отрицательный остаток — переплата за отменённую
     машину — в долг не превращается: она не требует действия. */
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
    /* Порядок задан состоянием, а не алфавитом: сначала те, кто стоит на
       мойке прямо сейчас, потом отработавшие в этом месяце, потом
       остальные. Вопрос «кто сейчас на площадке» задают чаще, чем «кто
       на букву А». */
    .sort(
      (a, b) =>
        Number(b.present) - Number(a.present) ||
        b.earned - a.earned ||
        a.name.localeCompare(b.name, 'hy'),
    );

  /* Машин у БИЗНЕСА, а не сумма участий. Складывать `count` по людям
     нельзя с появлением совместной работы: машина, которую мыли втроём,
     попала бы в это число трижды, и страница людей начала бы спорить со
     сводкой о том, сколько машин было в месяце. */
  const cars = month.count;
  const payroll = month.byStaff.reduce((sum, r) => sum + r.earned, 0);

  return (
    <>
      <PageHead title={t.settings.staff} meta={t.settings.staffLead}>
        {/* Долг ушёл отсюда в полосу слагаемых.

            Он висел здесь янтарной строкой вплотную к заголовку раздела,
            то есть выглядел предупреждением — а это обычное показание:
            сколько людям начислено и ещё не отдано. Хуже того, то же
            число стояло второй раз в строке человека, которому оно
            причитается, и там оно как раз на месте: там видно, КОМУ.
            Наверху оставался крик без адресата. */}
        {/* Совместная работа стоит рядом с наймом, а не в настройках
            бизнеса: это условие оплаты труда, и место ему среди людей.
            Строкой в заголовке, а не прибором на странице, — свойство
            трогают раз в год, как и классы машин. */}
        <TeamWash
          percent={tenant.teamPercent}
          currency={tenant.currency}
          staffRole={tenant.staffRole}
        />
        <AddStaff staffRole={tenant.staffRole} />
      </PageHead>

      {/* Начислено за месяц — единственное число этой страницы, ради
          которого её открывают деньгами. Остальные три справочные и
          стоят полосой втрое тише. */}
      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={t.owner.payrollAccrued}
      >
        <Plate
          label={t.owner.payrollAccrued}
          value={money(payroll)}
          note={t.owner.periodMonth.toLocaleLowerCase(t.locale)}
        />

        {/* Счёта людей здесь больше нет: он стоит у заголовка списка
            строкой ниже, и написанный дважды на одном экране он занимал
            звено, которого не хватило долгу. */}
        <Figures
          items={[
            { label: t.owner.onShift, value: String(present.length) },
            { label: unitWord(cars, tenant.unitOne, t.locale), value: String(cars) },
            {
              label: t.owner.toPay,
              value: money(board.totals.outstanding),
              /* За долгом стоит свой раздел: сводка называет сумму, а
                 кому и за какой день из неё причитается — вопрос
                 зарплат, и превращать этот экран в их копию незачем. */
              href: board.totals.outstanding > 0 ? '/owner/payroll' : undefined,
            },
          ]}
        />
      </section>

      <div className="mt-[var(--seam)]">
        <StaffRoster
          rows={people}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
          staffRole={tenant.staffRole}
        />
      </div>
    </>
  );
}
