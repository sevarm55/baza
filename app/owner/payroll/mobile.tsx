'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import {
  MobileButton,
  MobileCard,
  MobileEmpty,
  MobileQuietButton,
  MobileSection,
} from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { staffCount, unitCount, unitWord } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import type { DayGroup, HistoryDay, StaffEntry } from './model';

/**
 * Зарплаты на телефоне — то же табло, что в приложении.
 *
 * Экран начинается не с показания прибора, а с людей: сводка отвечает
 * «сколько получилось», и её место по оси экрана; зарплаты отвечают
 * «кому раздать», и начинаться они должны с тех, кому должны.
 *
 * Поэтому наверху стопка кружков — каждый своим цветом, тем же, каким
 * его имя набрано в ленте, в команде и в строке ниже. Кружки
 * перекрывают друг друга, как принято показывать группу, и при пятерых
 * последним встаёт счётчик остатка. Блок прижат влево: асимметрия и
 * есть то, чем этот экран отличается от сводки с первого взгляда.
 */
export function PayrollHeroMobile({
  outstanding,
  owedTo,
  accrued,
  settled,
  units,
  currency,
  unitOne,
  staffRole,
  people,
}: {
  outstanding: number;
  owedTo: number;
  accrued: number;
  settled: number;
  units: number;
  currency: string;
  unitOne: string;
  staffRole: string;
  /** кому должны, от большего долга к меньшему */
  people: { name: string; owed: number }[];
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const parts: string[] = [];
  if (outstanding > 0) parts.push(staffCount(owedTo, staffRole, t.locale));
  parts.push(`${units} ${unitWord(units, unitOne, t.locale)}`.trim());
  if (settled > 0) {
    parts.push(`${t.owner.payrollAccrued} ${money(accrued)}`);
    parts.push(`${t.payroll.paid} ${money(settled)}`);
  }

  const shown = people.slice(0, 4);
  const rest = people.length - shown.length;

  return (
    <div className="flex flex-col px-1 pt-2 pb-1">
      {shown.length > 0 && (
        <div className="mb-3 flex" aria-hidden>
          {shown.map((person, i) => (
            <span
              key={person.name}
              className="flex size-9 items-center justify-center rounded-full text-[15px] font-bold text-white ring-[2.5px] ring-m-board"
              style={{
                background: personColor(person.name),
                marginLeft: i === 0 ? 0 : -11,
              }}
            >
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {rest > 0 && (
            <span
              className="num flex size-9 items-center justify-center rounded-full bg-m-inset text-[13px] font-bold text-m-muted ring-[2.5px] ring-m-board"
              style={{ marginLeft: -11 }}
            >
              +{rest}
            </span>
          )}
        </div>
      )}

      <span className="text-[10px] font-black tracking-[0.135em] text-m-muted uppercase">
        {t.owner.toPay}
      </span>
      {/* Долг набран чернилами, а не грейпом: это показание, а не
          действие, и красить его фирменным цветом значит обещать
          нажатие, которого нет. */}
      <span className="num mt-0.5 text-[clamp(30px,11vw,44px)] leading-[1.05] font-bold tracking-[-0.02em] text-m-ink">
        {money(outstanding)}
      </span>
      <span className="num mt-1 truncate text-[12.5px] text-m-muted">
        {outstanding > 0 ? parts.join(' · ') : t.payroll.dayAllPaid}
      </span>
    </div>
  );
}

/**
 * Рабочий день карточкой.
 *
 * В шапке стоит то, ради чего карточку читают: сколько по этому дню
 * осталось отдать. Не «начислено за день» и не «выплачено» — именно
 * долг: два других числа справочные, и ставить их на то же место значит
 * заставлять выбирать, какое из трёх сейчас важно.
 *
 * Таблицы здесь нет и быть не может: пять колонок на 360 точках либо
 * едут вбок, либо сжимаются до нечитаемого. Человек — строка с кружком,
 * именем, фактами и суммой; нажатие по ней раскрывает разложение по
 * машинам, нажатие по кружку отмечает к выплате.
 */
export function DayCardMobile({
  group,
  currency,
  unitOne,
  staffRole,
  picked,
  onPick,
  onPickAll,
  onPay,
  busy,
  collapsed = false,
}: {
  group: DayGroup;
  currency: string;
  unitOne: string;
  staffRole: string;
  picked: Set<string>;
  onPick: (key: string, on: boolean) => void;
  onPickAll: (keys: string[]) => void;
  onPay: (keys: string[]) => void;
  busy: boolean;
  collapsed?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(!collapsed);
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const payable = group.people.filter((p) => p.staffId && p.earned > 0);
  const mine = payable.filter((p) => picked.has(p.key));

  /* Закрытый день свёрнут в строку. Он ничего не требует, и занимать им
     карточку в полный рост значит хоронить под ним те дни, за которые
     действительно должны. */
  if (collapsed && !open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="m-press flex w-full items-center gap-2.5 rounded-m-card border border-m-hair bg-m-surface px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-m-ink">
          {group.date}
        </span>
        <Check aria-hidden className="size-4 shrink-0 text-m-good" />
        <span className="num shrink-0 text-[14px] font-semibold text-m-muted">
          {money(group.paid)}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-m-muted" />
      </button>
    );
  }

  return (
    <MobileCard radius="card" padded={false} className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[16px] leading-tight font-bold text-m-ink">
              {group.date}
            </span>
            {group.today && (
              <span className="shrink-0 rounded-m-pill bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t.common.today}
              </span>
            )}
          </div>
          <div className="num mt-0.5 truncate text-[11.5px] text-m-muted">
            {staffCount(group.people.length, staffRole, t.locale)} ·{' '}
            {unitCount(group.units, unitOne, t.locale)}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[10px] font-medium tracking-wider text-m-muted uppercase">
            {group.outstanding > 0 ? t.owner.toPay : t.payroll.paid}
          </div>
          <div
            className={cn(
              'num text-[17px] leading-tight font-bold',
              group.outstanding > 0 ? 'text-m-ink' : 'text-m-muted',
            )}
          >
            {money(group.outstanding > 0 ? group.outstanding : group.paid)}
          </div>
        </div>
      </div>

      <div className="flex flex-col border-t border-m-hair">
        {group.people.map((entry) => (
          <PersonRow
            key={entry.key}
            entry={entry}
            currency={currency}
            unitOne={unitOne}
            picked={picked.has(entry.key)}
            onPick={entry.staffId && entry.earned > 0 ? onPick : null}
            busy={busy}
          />
        ))}
      </div>

      {/* Действия дня — внизу карточки, во всю ширину: попасть по ним
          нужно мокрым большим пальцем, а не прицеливаться в мелкую
          кнопку в углу шапки. */}
      {payable.length > 0 && (
        <div className="flex items-center gap-2 border-t border-m-hair px-3 py-3">
          {payable.length > 1 && mine.length < payable.length && (
            <MobileQuietButton
              disabled={busy}
              onClick={() => onPickAll(payable.map((p) => p.key))}
              className="shrink-0"
            >
              {t.payroll.selectAll}
            </MobileQuietButton>
          )}
          <MobileButton
            size="md"
            tone={mine.length > 0 ? 'lime' : 'quiet'}
            disabled={busy || mine.length === 0}
            onClick={() => onPay(mine.map((p) => p.key))}
            className="min-w-0 flex-1"
          >
            {mine.length > 0
              ? t.payroll.paySum(money(mine.reduce((s, p) => s + p.earned, 0)))
              : t.payroll.pay}
          </MobileButton>
        </div>
      )}
    </MobileCard>
  );
}

/**
 * Человек внутри рабочего дня.
 *
 * Слева направо ровно теми словами, которыми владелец думает: «Валод,
 * три машины, двадцать процентов, шесть с половиной тысяч, ещё не
 * отдавал». Нажимаемого в строке два: кружок отмечает к выплате, сама
 * строка раскрывает разложение суммы по машинам.
 */
function PersonRow({
  entry,
  currency,
  unitOne,
  picked,
  onPick,
  busy,
}: {
  entry: StaffEntry;
  currency: string;
  unitOne: string;
  picked: boolean;
  onPick: ((key: string, on: boolean) => void) | null;
  busy: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const owed = entry.earned > 0;
  const closed = !owed && entry.paid > 0;
  const facts = [unitCount(entry.count, unitOne, t.locale), entry.rate].filter(Boolean).join(' · ');

  return (
    <div className={cn('[&+*]:border-t [&+*]:border-m-hair', picked && 'bg-primary/6')}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Отметка — на самом кружке человека: цель в тридцать восемь
            точек, по которой попадают, не прицеливаясь, и одновременно
            лицо, по которому его узнают. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label={entry.name}
          disabled={!onPick || busy}
          onClick={() => onPick?.(entry.key, !picked)}
          className={cn(
            'm-press relative flex size-[38px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            !onPick && 'opacity-45',
          )}
          style={{ background: closed ? 'var(--m-inset)' : personColor(entry.name) }}
        >
          {picked ? (
            <Check aria-hidden className="size-[18px]" strokeWidth={3} />
          ) : (
            <span className={closed ? 'text-m-muted' : undefined}>
              {entry.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {picked && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-[2.5px] ring-primary ring-offset-2 ring-offset-m-surface"
            />
          )}
        </button>

        <button
          type="button"
          disabled={!entry.lines}
          aria-expanded={entry.lines ? open : undefined}
          onClick={() => entry.lines && setOpen((was) => !was)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                'truncate text-[15px] leading-tight font-semibold',
                closed ? 'text-m-muted' : 'text-m-ink',
              )}
            >
              {entry.name}
            </span>
            <span className="num truncate text-[11.5px] leading-tight text-m-muted">
              {closed && entry.paidAt ? `${t.payroll.paid} ${entry.paidAt}` : facts}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'num text-[15px] leading-tight font-bold',
                owed ? 'text-m-ink' : 'text-m-muted',
              )}
            >
              {money(owed ? entry.earned : entry.paid)}
            </span>
            {/* Стрелка обещает разложение по машинам — то место, где
                кончается спор о зарплате. Там, где разложения нет,
                стрелки тоже нет: обещать нечего. */}
            {entry.lines && (
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-4 shrink-0 text-m-muted transition-transform duration-150',
                  open && 'rotate-180',
                )}
              />
            )}
          </span>
        </button>
      </div>

      {/* Почему столько: разложение по машинам. Раскрывается по строке —
          спор о зарплате кончается ровно здесь, на списке номеров. */}
      {open && entry.lines && (
        <ul className="flex flex-col gap-1.5 bg-m-inset-soft px-3 py-2.5">
          {entry.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="num min-w-0 flex-1 truncate text-m-ink">{line.title}</span>
              {/* Совместную мойку без числа людей не объяснить: под
                  машиной за 12 000 стоит 45 % и 1 800 ֏, и первое со
                  вторым не сходится, пока не сказано, что фонд делили
                  на троих. */}
              <span className="num shrink-0 text-m-muted">
                {line.crew > 1 ? `${line.percent}% ÷ ${line.crew}` : `${line.percent}%`}
              </span>
              <span className="num w-16 shrink-0 text-right font-semibold text-m-ink">
                {money(line.earned)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * История выплат.
 *
 * Группируется по дню ВЫПЛАТЫ, а не по рабочему дню: сюда приходят с
 * вопросом «когда я реально отдал деньги».
 */
export function HistoryMobile({
  history,
  currency,
  emptyTitle,
  emptyNote,
}: {
  history: HistoryDay[];
  currency: string;
  emptyTitle: string;
  emptyNote?: string;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  if (history.length === 0) return <MobileEmpty title={emptyTitle} note={emptyNote} />;

  return (
    <div className="flex flex-col gap-3">
      {history.map((day) => (
        <MobileSection key={day.key} title={day.title}>
          <MobileCard radius="card" padded={false} className="overflow-hidden">
            {day.payments.map((payment) => (
              <div key={payment.key} className="flex flex-col gap-1.5 px-4 py-3 [&+*]:border-t [&+*]:border-m-hair">
                <div className="flex items-baseline gap-2">
                  <span className="num shrink-0 text-[12px] text-m-muted">{payment.time}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-m-muted">
                    {payment.forWork}
                  </span>
                  <span className="num shrink-0 text-[15px] font-bold text-m-ink">
                    {money(payment.total)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {payment.rows.map((row) => (
                    <span key={row.id} className="flex items-center gap-1.5 text-[12.5px]">
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: personColor(row.name) }}
                      />
                      <span className="text-m-ink">{row.name}</span>
                      <span className="num text-m-muted">{money(row.amount)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </MobileCard>
        </MobileSection>
      ))}
    </div>
  );
}
