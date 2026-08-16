'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { settlePayroll } from '@/app/actions';
import { Panel } from '@/components/board';
import { Segmented } from '@/components/segmented';
import { formatMoney } from '@/lib/money';
import { DayCard } from './day-card';
import { PayrollHistory } from './history';
import { ConfirmPayout, type ConfirmGroup } from './confirm-dialog';
import type { DayGroup, HistoryDay, StaffEntry } from './model';
import { useT } from '@/lib/i18n/client';

/** Сколько сообщение о выплате держится на экране. */
const TOAST_MS = 4000;

/**
 * Рабочая часть страницы: долг и история под одним переключателем.
 *
 * Разделены они не для красоты. Долг требует действия, история — нет, и
 * один бесконечный список, где они перемешаны, не отвечает ни на один из
 * двух вопросов: чтобы найти «кому я должен», приходится читать мимо
 * того, что уже отдано.
 *
 * Выбор живёт здесь, а не внутри дня: владелец может отметить людей в
 * двух днях сразу и рассчитаться одним нажатием. По умолчанию не выбрано
 * ничего — деньги отдают осознанно, а не по инерции от галочек, которые
 * кто-то проставил заранее.
 */
export function PayrollWorkspace({
  currency,
  unitOne,
  staffRole,
  outstanding,
  days,
  history,
  todayTitle,
}: {
  currency: string;
  unitOne: string;
  staffRole: string;
  outstanding: number;
  days: DayGroup[];
  history: HistoryDay[];
  /** «Այսօր · 14 օգոստոսի» — на случай, если сегодня ещё ничего не намыли */
  todayTitle: string;
}) {
  const t = useT();
  const [tab, setTab] = useState<'due' | 'history'>('due');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [note]);

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Ключи живут в данных, а не в состоянии: после расчёта страница
     перечитывается с сервера, и отмеченная строка может исчезнуть.
     Поэтому выбранное всегда сверяется с тем, что есть на экране. */
  const byKey = new Map<string, { group: DayGroup; entry: StaffEntry }>();
  for (const group of days) {
    for (const entry of group.people) byKey.set(entry.key, { group, entry });
  }

  const chosen = [...picked].filter((key) => byKey.has(key));
  const chosenSum = chosen.reduce((sum, key) => sum + (byKey.get(key)?.entry.earned ?? 0), 0);

  const toggle = (key: string, on: boolean) =>
    setPicked((was) => {
      const next = new Set(was);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const pickAll = (keys: string[]) =>
    setPicked((was) => {
      const next = new Set(was);
      for (const key of keys) next.add(key);
      return next;
    });

  /* Окно подтверждения показывает ровно то, что произойдёт: людей,
     сгруппированных по рабочему дню, за который платят. */
  const groups: ConfirmGroup[] | null =
    asking === null
      ? null
      : days
          .map((group) => ({
            day: group.day,
            title: group.title,
            people: group.people.filter((p) => asking.includes(p.key)),
          }))
          .filter((g) => g.people.length > 0);

  const confirm = () => {
    if (!asking) return;
    const items = asking
      .map((key) => byKey.get(key))
      .filter((found) => found?.entry.staffId)
      .map((found) => ({ staffId: found!.entry.staffId!, day: found!.group.day }));

    startTransition(async () => {
      /* Запрос может не дойти вовсе — связь на мойке не идеальная.
         Молчать здесь опаснее всего: деньги уже отданы из рук в руки, и
         человек уверен, что запись легла. */
      let done: string;
      try {
        const result = await settlePayroll(items);
        done = result.ok ? t.payroll.done(money(result.paid)) : t.payroll.failed;
      } catch {
        done = t.payroll.failed;
      }

      setAsking(null);
      /* Отметки снимаются в любом случае: часть расчётов могла лечь до
         сбоя, и оставленная галка предложила бы заплатить второй раз. */
      setPicked(new Set());
      setNote(done);
    });
  };

  /* Дни с долгом — и сегодняшний, даже если он уже закрыт: сегодня ещё
     растёт, и владельцу нужно видеть, что там происходит. Закрытые дни
     лежат под чертой: они ничего не требуют.

     Когда долга нет вовсе, под чертой оказываются все дни, включая
     сегодняшний: наверху в этом случае стоит ответ «всё выплачено», и
     единственная карточка рядом с ним читалась бы исключением из
     него. */
  const open = outstanding > 0 ? days.filter((d) => d.outstanding > 0 || d.today) : [];
  const closed = days.filter((d) => !open.includes(d));
  const [showClosed, setShowClosed] = useState(false);

  return (
    <div className="mt-[var(--seam)]">
      {/* Переключатель тем же жёлобом с переезжающей плашкой, что период
          на сводке: один приём на все переключатели продукта. */}
      <div className="mb-[var(--seam)]">
        <Segmented
          id="payroll-tabs"
          current={tab}
          onSelect={(key) => setTab(key as 'due' | 'history')}
          items={[
            {
              key: 'due',
              /* Суммы на вкладке больше нет. Она стояла здесь третьим
                 экземпляром одного числа: плита наверху, первое звено
                 полосы рядом с ней — и вот эта подпись. Вкладка не
                 показание, она выбор между «кому должен» и «что уже
                 отдал», и число в ней ничего не добавляло.

                 Галка осталась: это не повтор суммы, а состояние —
                 «долга нет вовсе», и по ней видно, что вкладку можно не
                 открывать. */
              label: (
                <span className="flex items-center gap-1.5">
                  {t.payroll.tabDue}
                  {outstanding === 0 && <Check className="size-3.5" aria-hidden />}
                </span>
              ),
            },
            { key: 'history', label: t.payroll.tabHistory },
          ]}
        />
      </div>

      {tab === 'due' ? (
        <div className="grid gap-[var(--seam)]">
          {outstanding === 0 ? (
            <Panel>
              <div className="grid justify-items-center gap-1 py-10 text-center">
                <Check className="size-6" style={{ color: 'var(--good-on-board)' }} aria-hidden />
                <p className="text-[15px] font-semibold">{t.payroll.dayAllPaid}</p>
                <p className="text-[13px]" style={{ color: 'var(--board-muted)' }}>
                  {t.payroll.nothingUnpaid}
                </p>
                {history.length > 0 && (
                  <button
                    type="button"
                    className="btn-inline mt-3"
                    onClick={() => setTab('history')}
                  >
                    {t.payroll.openHistory}
                  </button>
                )}
              </div>
            </Panel>
          ) : (
            <>
              {/* Сегодня стоит первым всегда — даже когда мыть ещё не
                  начинали: пустой сегодняшний день это ответ, а не
                  отсутствие ответа.

                  Но ответ на одну строку, и прибор в полный рост ему не
                  нужен. Целая панель с заголовком и текстом по центру
                  занимала сто тридцать точек над днями, в которых
                  деньги есть, и отодвигала работу вниз ради сообщения
                  «пока ничего». Теперь это строка: слева день, справа
                  что в нём. */}
              {!days.some((d) => d.today) && (
                <p className="quick justify-between px-1.5">
                  <b>{todayTitle}</b>
                  <span>{t.payroll.dayEmpty}</span>
                </p>
              )}

              {open.map((group) => (
                <DayCard
                  key={group.day}
                  group={group}
                  currency={currency}
                  unitOne={unitOne}
                  staffRole={staffRole}
                  picked={picked}
                  onPick={toggle}
                  onPickAll={pickAll}
                  onPay={setAsking}
                  busy={pending}
                />
              ))}
            </>
          )}

          {/* Закрытые дни — под чертой и свёрнутыми. Прятать их совсем
              нельзя: владельцу нужен полный итог рабочего дня, а не
              только его долг. Но и держать их наравне с должными
              незачем — они ничего не требуют. */}
          {closed.length > 0 && (
            <div className="grid gap-[var(--seam)]">
              <button
                type="button"
                className="justify-self-start text-[12.5px] font-medium underline-offset-2 hover:underline"
                style={{ color: 'var(--board-muted)' }}
                onClick={() => setShowClosed((was) => !was)}
              >
                {showClosed ? t.payroll.hidePaidDays : t.payroll.showPaidDays(closed.length)}
              </button>

              {showClosed &&
                closed.map((group) => (
                  <DayCard
                    key={group.day}
                    group={group}
                    currency={currency}
                    unitOne={unitOne}
                    staffRole={staffRole}
                    picked={picked}
                    onPick={toggle}
                    onPickAll={pickAll}
                    onPay={setAsking}
                    busy={pending}
                    collapsed
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        <PayrollHistory days={history} currency={currency} unitOne={unitOne} />
      )}

      {/* Причал на телефоне: полоса расчёта внутри дня уезжает под сгиб
          вместе с ним, а выбранное должно оставаться под рукой. */}
      {chosen.length > 0 && (
        <div className="pay-dock">
          <span className="num text-[13px]" style={{ color: 'var(--board-muted)' }}>
            {t.payroll.selected(chosen.length)}
          </span>
          <button
            type="button"
            className="btn btn-auto"
            disabled={pending}
            onClick={() => setAsking(chosen)}
          >
            {t.payroll.paySum(money(chosenSum))}
          </button>
        </div>
      )}

      <ConfirmPayout
        groups={groups}
        currency={currency}
        pending={pending}
        onCancel={() => setAsking(null)}
        onConfirm={confirm}
      />

      {/* После расчёта строки исчезают сами, и без единого слова
          непонятно, случилось это от нажатия или что-то сломалось. */}
      {note && (
        <div className="pay-toast" role="status" aria-live="polite">
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}
