'use client';

import { Sheet } from '@/components/sheet';
import { formatMoney } from '@/lib/money';
import type { StaffEntry } from './model';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

/** Что подтверждаем: люди, сгруппированные по рабочему дню. */
export type ConfirmGroup = { day: string; title: string; people: StaffEntry[] };

/**
 * Подтверждение расчёта.
 *
 * Не `window.confirm`: браузерное окно не умеет показать, за какой день
 * и кому именно платят, — а именно это и надо прочитать перед тем, как
 * отдать деньги. Расчёт закрывает день, и следующий пойдёт от него.
 *
 * Внутри — ровно то, что произойдёт: имена, суммы, итог и день, за
 * который платят. Ни одной строки сверх этого: окно не место для
 * объяснений, его читают за две секунды с деньгами в руке.
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

  /* Один человек за один день — заголовок называет его, а не «расчёт»:
     окно должно повторять то, что человек только что выбрал. */
  const single = people.length === 1 ? people[0] : null;

  return (
    <Sheet
      open={groups !== null}
      onClose={pending ? () => {} : onCancel}
      title={single ? single.name : t.payroll.confirmTitle}
      subtitle={list.length === 1 ? list[0].title : undefined}
      footer={
        <>
          <button type="button" className="btn-inline" onClick={onCancel} disabled={pending}>
            {t.common.cancel}
          </button>
          <LoadingButton
            type="button"
            className="btn btn-auto"
            busy={pending}
            label={t.payroll.confirm}
            busyLabel={t.payroll.paying}
            onClick={onConfirm}
          />
        </>
      }
    >
      <div className="grid gap-3">
        {/* Один человек — одно число крупно: перечислять список из одной
            строки значит заставлять читать таблицу там, где ответ
            умещается в цифру. */}
        {single && (
          <div className="num text-[30px] leading-none font-bold tracking-[-0.035em]">
            {money(single.earned)}
          </div>
        )}

        {!single &&
          list.map((group) => (
            <div key={group.day}>
              {/* День называется, когда их несколько: перепутать, за
                  какой день отдают деньги, нельзя ни при каких
                  обстоятельствах. Когда день один, его называет шапка. */}
              {list.length > 1 && (
                <div className="mb-1 text-[12.5px] font-semibold" style={{ color: 'var(--muted)' }}>
                  {group.title}
                </div>
              )}
              <div className="board-journal">
                {group.people.map((p) => (
                  <div key={p.key} className="flex items-center gap-2.5 py-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.name}</span>
                    <span className="num shrink-0 text-[14.5px] font-semibold">
                      {money(p.earned)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {people.length > 1 && (
          <div
            className="flex items-center justify-between border-t pt-2.5"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="text-[13px] font-semibold">{t.common.total}</span>
            <span className="num text-[17px] font-bold tracking-[-0.02em]">{money(total)}</span>
          </div>
        )}

        <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {t.payroll.confirmNote}
        </p>
      </div>
    </Sheet>
  );
}
