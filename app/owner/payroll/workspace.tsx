'use client';

import { useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { settlePayroll } from '@/app/actions';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { Button } from '@/components/ui/button';
import { useAsyncAction } from '@/components/loading';
import { formatMoney } from '@/lib/money';
import { DayCard } from './day-card';
import { PayrollHistory } from './history';
import { ConfirmPayout, type ConfirmGroup } from './confirm-dialog';
import type { DayGroup, HistoryDay, PayItem, StaffEntry } from './model';
import { useT } from '@/lib/i18n/client';

type Tab = 'due' | 'history';

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
  const [tab, setTab] = useState<Tab>('due');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);

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

  /* Суммы считает сервер заново; отсюда уезжают только «кто» и «за
     какой день». Запрос может не дойти вовсе — связь на мойке не
     идеальная, — и молчать здесь опаснее всего: деньги уже отданы из
     рук в руки, и человек уверен, что запись легла. */
  const settle = useAsyncAction(async (items: PayItem[]) => {
    try {
      const result = await settlePayroll(items);
      if (result.ok) toast.success(t.payroll.done(money(result.paid)));
      else toast.error(t.payroll.failed);
    } catch {
      toast.error(t.payroll.failed);
    } finally {
      setAsking(null);
      /* Отметки снимаются в любом случае: часть расчётов могла лечь до
         сбоя, и оставленная галка предложила бы заплатить второй раз. */
      setPicked(new Set());
    }
  });

  const confirm = () => {
    if (!asking) return;
    const items: PayItem[] = [];
    for (const key of asking) {
      const found = byKey.get(key);
      if (found?.entry.staffId) items.push({ staffId: found.entry.staffId, day: found.group.day });
    }
    settle.run(items);
  };

  /* Дни с долгом — и сегодняшний, даже если он уже закрыт: сегодня ещё
     растёт, и владельцу нужно видеть, что там происходит. Закрытые дни
     лежат под чертой: они ничего не требуют.

     Когда долга нет вовсе, под чертой оказываются все дни, включая
     сегодняшний: наверху в этом случае стоит ответ «всё выплачено», и
     единственная панель рядом с ним читалась бы исключением из него. */
  const open = outstanding > 0 ? days.filter((d) => d.outstanding > 0 || d.today) : [];
  const closed = days.filter((d) => !open.includes(d));
  const busy = settle.running;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label={t.owner.tabPayroll}
        current={tab}
        onSelect={(key) => setTab(key as Tab)}
        items={[
          {
            key: 'due',
            /* Галка у вкладки — не повтор суммы, а состояние: «долга нет
               вовсе», и по ней видно, что вкладку можно не открывать. */
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t.payroll.tabDue}
                {outstanding === 0 && <Check className="size-3.5 text-success" aria-hidden />}
              </span>
            ),
          },
          { key: 'history', label: t.payroll.tabHistory },
        ]}
      />

      {tab === 'due' ? (
        <div className="flex flex-col gap-4">
          {outstanding === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title={t.payroll.dayAllPaid}
              description={t.payroll.nothingUnpaid}
              action={
                history.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setTab('history')}>
                    {t.payroll.openHistory}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Сегодня стоит первым всегда — даже когда мыть ещё не
                  начинали: пустой сегодняшний день это ответ, а не
                  отсутствие ответа. Но ответ на одну строку, и панель в
                  полный рост ему не нужна. */}
              {!days.some((d) => d.today) && (
                <p className="px-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{todayTitle}</span>
                  {' · '}
                  {t.payroll.dayEmpty}
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
                  busy={busy}
                />
              ))}
            </>
          )}

          {/* Закрытые дни — под чертой и свёрнутыми. Прятать их совсем
              нельзя: владельцу нужен полный итог рабочего дня, а не
              только его долг. Но и держать их наравне с должными
              незачем — они ничего не требуют. */}
          {closed.length > 0 && (
            <div className="flex flex-col gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((was) => !was)}
              >
                {showClosed ? (
                  <ChevronUp data-icon="inline-start" aria-hidden />
                ) : (
                  <ChevronDown data-icon="inline-start" aria-hidden />
                )}
                {showClosed ? t.payroll.hidePaidDays : t.payroll.showPaidDays(closed.length)}
              </Button>

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
                    busy={busy}
                    collapsed
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        <PayrollHistory days={history} currency={currency} unitOne={unitOne} staffRole={staffRole} />
      )}

      {/* Причал: полоса расчёта внутри дня уезжает под сгиб вместе с
          ним, а выбранное должно оставаться под рукой. Липнет к нижнему
          краю внутри рабочей области, а не поверх всего экрана: так он
          стоит по центру содержимого, а не по центру окна с колонкой. */}
      {chosen.length > 0 && (
        <div className="safe-bottom pointer-events-none sticky bottom-4 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-4 rounded-lg border border-border bg-card py-2.5 pr-2.5 pl-4">
            <span className="num text-sm text-muted-foreground">
              {t.payroll.selected(chosen.length)}
            </span>
            <Button disabled={busy} onClick={() => setAsking(chosen)}>
              {t.payroll.paySum(money(chosenSum))}
            </Button>
          </div>
        </div>
      )}

      <ConfirmPayout
        groups={groups}
        currency={currency}
        pending={busy}
        onCancel={() => setAsking(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
