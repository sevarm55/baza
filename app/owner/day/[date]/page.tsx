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
import { Figures, Panel, Plate } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { TodayOperations } from '../../today/operations';
import type { Op } from '../../today/model';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
import { intlLocale } from '@/lib/i18n/format';
import { localizeTenantOrNull, unitCount } from '@/lib/i18n/terms';

/**
 * Один день целиком.
 *
 * Отвечает на вопрос, ради которого история и заводилась: кто стоял на
 * смене, кто что помыл, сколько вышло. Смены отдельно от записей —
 * человек мог отстоять день и не намыть ничего, и по одним записям этого
 * не увидеть.
 *
 * ЗДЕСЬ ЖЕ ВПЕРВЫЕ В ВЕБЕ ВИДНА НЕДОСТАЧА. Сдачу наличных продукт пишет
 * с самого начала (`shifts.cash_expected` и `cash_declared`), но в
 * браузере не было ни одного экрана, где её показывают: разницу между
 * «намыл наличными» и «сдал» владелец мог увидеть только на телефоне
 * или в уведомлении. Между тем это главный контроль всего продукта —
 * ради него смена и закрывается вопросом.
 *
 * Считает то же и тем же, что сводка и календарь. День, расходящийся с
 * месяцем, не читают вовсе.
 */
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const { date } = await params;
  /* Кривую дату не доводим до базы: «9999-99-99» под шаблон подходит, а
     границ из неё не собрать, и запрос ушёл бы с `null` (см. isDate). */
  if (!isDate(date)) notFound();

  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const zone = tenant.timezone;
  const { from, to } = dayBounds(date, zone);

  const [stats, feed, crew, costs, roster] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    getFeed(tenant.id, from, 200, to),
    shiftsOnDay(tenant.id, from, to),
    // тот же знаменатель, что у сводки и календаря: длина месяца, в
    // котором стоит этот день
    getPeriodCosts(tenant.id, from, to, daysInMonthOf(zone, from)),
    // люди точки — для правки состава совместной записи из меню ленты
    listStaff(tenant.id),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const profit = profitOf(stats.revenue, stats.payroll, costs);

  /* Записи приезжают уже посчитанными: доля исполнителя — `staffShare`
     из снимка процента в самой записи. Второй раз это не считается
     нигде. Тот же разбор, что на сводке. */
  const ops: Op[] = feed.map((o) => {
    const share = o.staffPercent > 0 ? staffShare(o.price, o.staffPercent) : 0;
    return {
      id: o.id,
      time: hhmm(o.createdAt, zone),
      clientKey: o.clientKey,
      /* Все, кто мыл, с долей каждого — та же форма, что на сводке. */
      crew: o.crew.map((p) => ({
        staffId: p.staffId,
        name: p.name,
        color: personColor(p.name),
        earned: p.earned,
      })),
      authorName: o.staffName,
      serviceName: o.serviceName,
      payment: o.payment,
      paymentLabel: paymentLabel(o.payment, t),
      price: o.price,
      /* Прайс приезжает рядом со взятым и только когда они разошлись:
         скидка обязана быть видна там, где владелец читает работу. */
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
    <>
      <PageHead
        title={title}
        meta={
          <Link className="btn-inline" href={`/owner/calendar?m=${date.slice(0, 7)}`}>
            {t.calendar.title}
          </Link>
        }
      >
        <div className="flex items-center gap-1.5">
          <DayStep href={`/owner/day/${prev}`} back />
          {/* Вперёд не дальше сегодняшнего: завтрашнего дня ещё не было,
              и открывать его пустым значило бы показать ноль там, где
              нечему быть. */}
          <DayStep href={`/owner/day/${next}`} enabled={next <= today} />
        </div>
      </PageHead>

      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={t.owner.profit}
      >
        <Plate label={t.owner.profit} value={money(profit)} note={title} />
        <Figures
          items={[
            { label: t.owner.revenue, value: money(stats.revenue) },
            { label: t.owner.payrollAccrued, value: money(stats.payroll) },
            { label: t.expenses.title, value: money(costs.total) },
          ]}
        />
      </section>

      <p className="quick">
        {unitCount(stats.count, tenant.unitOne, t.locale)}
        {stats.avgCheck > 0 && (
          <>
            <i />
            {t.owner.avgCheck} <b className="num">{money(stats.avgCheck)}</b>
          </>
        )}
        <i />
        {t.payment.cash} <b className="num">{money(stats.cash)}</b>
      </p>

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <Panel title={t.day.shifts} count={crew.length} className="lg:col-span-4">
          {crew.length === 0 ? (
            <EmptyState title={t.day.noShifts} note={t.day.noShiftsNote} />
          ) : (
            <div className="rows">
              {crew.map((s) => (
                <div key={`${s.userId}-${s.openedAt.getTime()}`} className="setting-row">
                  <span className="min-w-0">
                    <span className="setting-row-label" style={{ color: personColor(s.name) }}>
                      {s.name}
                    </span>
                    <span className="setting-row-note num">
                      {s.closedAt
                        ? t.work.range(hhmm(s.openedAt, zone), hhmm(s.closedAt, zone))
                        : t.work.since(hhmm(s.openedAt, zone))}
                    </span>
                  </span>

                  {/* Сдача наличных.

                      Три разных состояния, и путать их нельзя. Не
                      отмечал — так и говорим: это не ноль. Сошлось —
                      называем сумму и молчим. Разошлось — называем
                      разницу, потому что ради неё смена и закрывается
                      вопросом. */}
                  <span className="shrink-0 text-end">
                    <Cash
                      open={s.closedAt === null}
                      expected={s.cashExpected}
                      declared={s.cashDeclared}
                      money={money}
                      t={t}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="lg:col-span-8">
          <TodayOperations
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
      </div>
    </>
  );
}

/**
 * Сколько наличных намыто и сколько сдано.
 *
 * Разница показывается только когда она есть: «−0 ֏» сообщает ровно то
 * же, что её отсутствие, и занимает место. Недостача янтарным, излишек
 * тоже — оба означают, что счёт не сошёлся, и разбираться надо с обоими.
 */
function Cash({
  open,
  expected,
  declared,
  money,
  t,
}: {
  /** смена ещё идёт: сдавать нечего, потому что не закончили */
  open: boolean;
  expected: number | null;
  declared: number | null;
  money: (n: number) => string;
  t: Dict;
}) {
  /* Открытая смена не «без наличных»: они копятся прямо сейчас, а
     `cash_expected` появится только при закрытии. Сказать здесь
     «наличных не было» значило бы соврать про идущую смену — и соврать
     ровно в том месте, ради которого страница и сделана. */
  if (open) {
    return (
      <span className="text-[12.5px]" style={{ color: 'var(--good-on-board)' }}>
        {t.day.stillOpen}
      </span>
    );
  }

  if (expected === null || expected === 0) {
    return (
      <span className="text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
        {t.day.noCash}
      </span>
    );
  }

  if (declared === null) {
    return (
      <>
        <span className="num block text-[14px] font-semibold">{money(expected)}</span>
        <span className="block text-[12px]" style={{ color: 'var(--board-muted)' }}>
          {t.day.notDeclared}
        </span>
      </>
    );
  }

  const diff = declared - expected;
  return (
    <>
      <span className="num block text-[14px] font-semibold">{money(declared)}</span>
      <span
        className="num block text-[12px]"
        style={{ color: diff === 0 ? 'var(--board-muted)' : 'var(--warn-on-board)' }}
      >
        {diff === 0
          ? t.day.cashMatches
          : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}
      </span>
    </>
  );
}

function DayStep({ href, enabled = true, back = false }: { href: string; enabled?: boolean; back?: boolean }) {
  const Icon = back ? ChevronLeft : ChevronRight;
  if (!enabled) {
    return (
      <span className="btn-inline" style={{ opacity: 0.35 }} aria-hidden>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link className="btn-inline" href={href}>
      <Icon className="size-4" aria-hidden />
    </Link>
  );
}

/** Соседний день. Через полдень UTC — от края суток далеко в любой зоне. */
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
