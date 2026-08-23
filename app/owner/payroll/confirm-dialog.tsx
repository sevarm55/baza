'use client';

import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { PersonAvatar } from '@/components/patterns/person';
import { formatMoney } from '@/lib/money';
import type { StaffEntry } from './model';
import { useT } from '@/lib/i18n/client';

/** Что подтверждаем: люди, сгруппированные по рабочему дню. */
export type ConfirmGroup = { day: string; title: string; people: StaffEntry[] };

/**
 * Подтверждение расчёта.
 *
 * Не `window.confirm`: браузерное окно не умеет показать, за какой день
 * и кому именно платят, а именно это и надо прочитать перед тем, как
 * отдать деньги. Расчёт закрывает день, и следующий пойдёт от него.
 *
 * Внутри ровно то, что произойдёт: день, имена, суммы и итог. Ни одной
 * строки сверх этого: окно читают за две секунды с деньгами в руке.
 * День назван всегда, даже когда он один: перепутать, за какой день
 * отдают деньги, нельзя ни при каких обстоятельствах.
 */
export function ConfirmPayout({
  groups,
  currency,
  pending,
  onCancel,
  onConfirm,
}: {
  /** пусто — окна нет */
  groups: ConfirmGroup[] | null;
  currency: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const list = groups ?? [];
  const people = list.flatMap((g) => g.people);
  const total = people.reduce((sum, p) => sum + p.earned, 0);

  /* Один человек за один день: заголовок называет его, а не «расчёт», и
     сумма стоит одним числом крупно. Перечислять список из одной строки
     значит заставлять читать таблицу там, где ответ умещается в цифру. */
  const single = people.length === 1 ? people[0] : null;

  return (
    <ConfirmDialog
      open={groups !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={single ? single.name : t.payroll.confirmTitle}
      description={t.payroll.confirmNote}
      confirmLabel={t.payroll.confirm}
      busyLabel={t.payroll.paying}
      busy={pending}
      onConfirm={onConfirm}
    >
      {single ? (
        <div className="flex flex-col gap-1">
          <div className="num text-[26px] leading-none font-semibold tracking-[-0.02em]">
            {money(single.earned)}
          </div>
          <div className="text-xs text-muted-foreground">{list[0]?.title}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((group) => (
            <div key={group.day}>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{group.title}</div>
              <ul className="divide-y divide-border">
                {group.people.map((p) => (
                  <li key={p.key} className="flex items-center gap-2.5 py-2">
                    <PersonAvatar name={p.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="num shrink-0 text-sm font-semibold">{money(p.earned)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {people.length > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <span className="text-sm font-medium">{t.common.total}</span>
              <span className="num text-[18px] leading-none font-semibold">{money(total)}</span>
            </div>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
