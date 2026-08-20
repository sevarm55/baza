import { redirect } from 'next/navigation';
import { Clock3 } from 'lucide-react';
import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getTenant, listStaff } from '@/lib/queries';
import { getPayrollBoard, type BoardPayment } from '@/lib/payroll-board';
import { PAYROLL_AFTER_DAYS } from '@/lib/alerts';
import { daysSince, hhmm, ymd } from '@/lib/time';
import { personColor } from '@/lib/person-color';
import { PageHead } from '@/components/page-head';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { PayrollSummary } from './summary';
import { PayrollWorkspace } from './workspace';
import type { DayGroup, HistoryDay, StaffEntry } from './model';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';

/**
 * Зарплаты.
 *
 * Страница построена вокруг рабочего дня, а не вокруг человека и не
 * вокруг кнопки. Причина простая: рассчитываются днями. «За вчера отдал,
 * за сегодня нет» — это фраза из жизни, а «Валоду отдал шесть тысяч из
 * тринадцати» — нет; вторая требует держать в голове, за что именно
 * шесть, и ровно на этом возникает спор.
 *
 * Порядок чтения задан вопросами, с которыми сюда заходят:
 *
 *   1. сколько всего раздать сейчас   → плита наверху;
 *   2. кому                           → строки внутри дня;
 *   3. за какой день                  → сам блок дня;
 *   4. почему столько                 → разложение по машинам в строке;
 *   5. что уже отдано                 → вкладка «Պատմություն».
 *
 * Первые три помещаются над сгибом. Пятое живёт отдельной вкладкой, а не
 * в конце того же списка: долг и уже отданное — разные вопросы, и один
 * бесконечный список, где они перемешаны, не отвечает ни на один.
 *
 * Считает не эта страница, а `getPayrollBoard` — тот же код, которым
 * отвечает API приложения. Слова остаются здесь: числа обязаны
 * совпадать, а как их назвать, каждая сторона решает сама.
 */
export default async function PayrollPage() {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const board = await getPayrollBoard(tenant.id, tenant.timezone, t.locale);

  /* Ни одного расчёта за всю жизнь мойки.
   *
   * Пустой лист зарплат в первый день объяснял ровно ничего: плита с
   * нулём, три нуля под ней и пустое место там, где ждали людей. Причин
   * у пустоты две, и они требуют разных ответов — платить некому или
   * платить пока не за что. Первая ведёт к работникам, вторая просто
   * ждёт первой машины, и звать в ней некуда: записывает мойщик.
   *
   * Проверка стоит после доски, а не вместо неё: доска и есть источник
   * правды о том, было ли начисление, и второго способа это узнать
   * заводить незачем. */
  const nothingYet =
    board.days.length === 0 && board.payments.length === 0 && board.totals.accrued === 0;

  if (nothingYet) {
    const staff = await listStaff(tenant.id);
    const hired = staff.some((s) => s.role !== 'owner');

    return (
      <>
        <PageHead title={t.owner.tabPayroll} meta={t.payroll.lead} />
        <Panel>
          <EmptyState
            title={hired ? t.payroll.emptyNoWork : t.payroll.emptyNoStaff}
            note={hired ? t.payroll.emptyNoWorkNote : t.payroll.emptyNoStaffNote}
            action={
              hired ? undefined : (
                <Link className="btn btn-auto" href="/owner/staff">
                  {t.payroll.emptyNoStaffCta}
                </Link>
              )
            }
          />
        </Panel>
      </>
    );
  }

  const zone = tenant.timezone;
  const todayKey = ymd(new Date(), zone);
  const longDay = dayNamer(zone, t.locale);
  /* Короткая дата — только в строке состояния: «Վճարվել է 14 օգոստոսի,
     16:25» в колонку шириной в два слова не помещается, а полная фраза
     остаётся подсказкой и озвучкой. */
  const shortDay = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'short',
    timeZone: zone,
  });

  const dayGroups: DayGroup[] = board.days.map((day) => ({
    day: day.day,
    title: day.day === todayKey ? `${t.common.today} · ${longDay(day.day)}` : longDay(day.day),
    today: day.day === todayKey,
    units: day.units,
    outstanding: day.outstanding,
    paid: day.paid,
    people: day.people.map(
      (p): StaffEntry => ({
        key: `${p.staffId}|${day.day}`,
        staffId: p.staffId,
        name: p.name ?? '—',
        color: personColor(p.name),
        count: p.count,
        earned: p.earned,
        rate: rateLabel(p.pctFrom, p.pctTo),
        paid: p.paid,
        paidAt: p.paidAt ? `${shortDay.format(p.paidAt)}, ${hhmm(p.paidAt, zone)}` : null,
        paidNote: p.paidAt
          ? t.payroll.paidOn(longDay(ymd(p.paidAt, zone)), hhmm(p.paidAt, zone))
          : null,
        lines: p.lines,
      }),
    ),
  }));

  /* История группируется по дню ВЫПЛАТЫ: сюда приходят с вопросом «когда
     я реально отдал деньги», а не «что было начислено». */
  const historyDays: HistoryDay[] = [];
  for (const payment of board.payments) {
    const dayKey = ymd(payment.paidAt, zone);
    let group = historyDays.find((g) => g.key === dayKey);
    if (!group) {
      group = {
        key: dayKey,
        title: dayKey === todayKey ? `${t.common.today} · ${longDay(dayKey)}` : longDay(dayKey),
        payments: [],
      };
      historyDays.push(group);
    }

    group.payments.push({
      key: payment.key,
      time: hhmm(payment.paidAt, zone),
      forWork: workLabel(payment, longDay, zone, t),
      units: payment.units,
      total: payment.total,
      rows: payment.rows.map((r) => ({
        id: r.id,
        name: r.name ?? '—',
        color: personColor(r.name),
        amount: r.amount,
      })),
    });
  }

  /* Повод «пора платить» — тем же порогом, что у колокольчика: два
     разных правила на одно состояние означали бы, что продукт спорит
     сам с собой. */
  const idleDays = board.lastPaidAt ? daysSince(board.lastPaidAt) : null;
  const nagging =
    board.totals.outstanding > 0 && idleDays !== null && idleDays >= PAYROLL_AFTER_DAYS;

  return (
    <>
      <PageHead title={t.owner.tabPayroll} meta={t.payroll.lead}>
        {/* Повод — строкой у заголовка, а не плашкой во всю ширину.
            Он подсказка, а не показание: занять им первый экран значит
            отодвинуть вниз число, ради которого сюда пришли. */}
        {nagging && (
          <span
            className="flex items-center gap-1.5 text-[12.5px] font-medium"
            style={{ color: 'var(--warn-on-board)' }}
          >
            <Clock3 className="size-3.5 shrink-0" aria-hidden />
            {t.alerts.payrollNote(idleDays)}
          </span>
        )}
      </PageHead>

      <PayrollSummary
        currency={tenant.currency}
        outstanding={board.totals.outstanding}
        owedTo={board.totals.owedTo}
        accrued={board.totals.accrued}
        settled={board.totals.settled}
        units={board.totals.units}
        unitOne={tenant.unitOne}
        staffRole={tenant.staffRole}
      />

      <PayrollWorkspace
        currency={tenant.currency}
        unitOne={tenant.unitOne}
        staffRole={tenant.staffRole}
        outstanding={board.totals.outstanding}
        days={dayGroups}
        history={historyDays}
        todayTitle={`${t.common.today} · ${longDay(todayKey)}`}
      />
    </>
  );
}

/**
 * «13 օգոստոսի» из `2026-08-13`.
 *
 * Число словом, а не «13.08»: страница различает рабочий день и день
 * выплаты, и точки в обеих датах эту разницу стирают. Год появляется,
 * только когда день не из текущего года — иначе он занимает место, ничего
 * не сообщая.
 *
 * Полдень по UTC внутри — единственный способ превратить дату без
 * времени в момент так, чтобы он остался тем же днём в любом поясе.
 */
function dayNamer(timezone: string, locale: string): (day: string) => string {
  const thisYear = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: timezone }).format(
    new Date(),
  );
  const short = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  });
  const full = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });

  return (day: string) => {
    const at = new Date(`${day}T12:00:00Z`);
    return (day.slice(0, 4) === thisYear ? short : full).format(at);
  };
}

/** Ставка, по которой посчитано: одно число, а после смены ставки — вилка. */
function rateLabel(from: number | null, to: number | null): string | null {
  if (from === null || to === null) return null;
  return from === to ? `${from}%` : `${from}–${to}%`;
}

/**
 * За какой рабочий день отданы деньги.
 *
 * У новых выплат день записан прямо в строке. У старых его нет вовсе —
 * они закрывали отрезок целиком, и разложить их обратно по дням честно
 * нельзя; тогда называем отрезок так, как он и выглядел: «до такого-то»
 * либо «с такого-то по такое-то». Верхняя граница отрезка — полночь
 * СЛЕДУЮЩИХ суток, поэтому последний рабочий день ищется на миг раньше.
 */
function workLabel(
  payment: BoardPayment,
  longDay: (day: string) => string,
  timezone: string,
  t: Dict,
): string {
  if (payment.day) return t.payroll.forWork(longDay(payment.day));

  const last = ymd(new Date(payment.periodTo.getTime() - 1), timezone);
  if (payment.periodFrom.getTime() <= 0) return t.payroll.forWorkUpTo(longDay(last));

  const first = ymd(payment.periodFrom, timezone);
  return t.payroll.forWork(first === last ? longDay(first) : `${longDay(first)} — ${longDay(last)}`);
}
