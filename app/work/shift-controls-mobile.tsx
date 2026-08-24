'use client';

import { useState, useTransition } from 'react';

import { toggleShiftAction } from '@/app/actions';
import {
  MobileButton,
  MobileField,
  MobileInput,
  MobileSheet,
} from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { currencySymbol, formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * «Я на смене» — переключатель, закреплённый сверху экрана.
 *
 * Встать на смену — первое действие дня, и оно не должно уезжать за
 * край при прокрутке. Владельцу переключатель показывает, кто на мойке,
 * ещё до того как появится первая запись: человека, который вышел час
 * назад и пока ничего не намыл, по записям не видно вовсе.
 *
 * Встаём молча, уходим с вопросом. На входе спрашивать нечего; уход —
 * единственный момент, когда деньги переходят из рук в руки, и другого
 * места спросить про наличные не будет.
 */
export function ShiftToggleMobile({
  onShift,
  count,
  revenue,
  earned,
  cash,
  currency,
  unitOne,
}: {
  onShift: boolean;
  count: number;
  revenue: number;
  earned: number;
  /** наличных за смену; считает тот же `cashInShift`, что и сервер */
  cash: number;
  currency: string;
  unitOne: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  /* Сколько человек говорит, что сдаёт. Подставляем набежавшее: в
     девяти случаях из десяти сдают именно столько. Стереть можно —
     тогда владелец увидит «не отмечено», и это честнее нуля. */
  const [declared, setDeclared] = useState(String(cash));
  const [pending, startTransition] = useTransition();

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const differs = declared !== '' && Number(declared) !== cash;

  const toggle = (open: boolean, declaredCash?: string) => {
    const data = new FormData();
    data.set('open', String(open));
    /* Пустое поле — это «не отметил», а не ноль, и на сервер оно не
       едет вовсе: владелец должен различать «сдал 0» и «не сказал». */
    if (declaredCash !== undefined && declaredCash !== '') data.set('cash', declaredCash);
    return toggleShiftAction(data);
  };

  return (
    <>
      <div
        className="sticky z-20 -mx-4 bg-m-board/92 px-4 pt-1 pb-2 backdrop-blur-xl md:hidden"
        style={{ top: 'calc(var(--m-safe-top) + var(--m-top-h))' }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={onShift}
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={() => {
            if (onShift) {
              setAsking(true);
              return;
            }
            startTransition(async () => void (await toggle(true)));
          }}
          className={cn(
            /* Не капсула: капсульных скруглений в продукте нет нигде,
               и переключатель смены не исключение. Двадцать две точки
               дают ту же мягкость, не превращая строку в пилюлю. */
            'm-press flex min-h-[46px] w-full items-center gap-2.5 rounded-m-card bg-m-inset py-2 pr-3 pl-4',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            pending && 'opacity-70',
          )}
        >
          {/* Точка никогда не единственный носитель смысла: рядом с ней
              всегда слово. */}
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              onShift ? 'bg-m-good' : 'bg-m-muted/50',
            )}
          />
          <span className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-m-ink">
            {onShift ? t.work.onShift : t.work.shiftNotStarted}
          </span>

          {/* Тумблер отрисован кнопкой, а не `input`: касание принимает
              вся строка, а не двадцать точек справа. */}
          <span
            aria-hidden
            className={cn(
              'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
              onShift ? 'bg-m-good' : 'bg-m-divider',
            )}
          >
            <span
              className={cn(
                'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white transition-transform duration-200',
                onShift && 'translate-x-5',
              )}
              style={{ boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)' }}
            />
          </span>
        </button>
      </div>

      {/* Лист сдачи: три числа, после которых решение принимается за
          секунду, и поле наличных. Поле не обязательное — закрыться
          человек должен уметь всегда. */}
      <MobileSheet
        open={asking}
        onOpenChange={(next) => !pending && setAsking(next)}
        title={t.work.endTitle}
        description={t.work.endNote(unitOne)}
        closeLabel={t.common.close}
        footer={
          /* Два равноправных выхода одного размера: разницу несёт
             заливка, а не габарит. */
          <div className="grid grid-cols-2 gap-2">
            <MobileButton tone="quiet" onClick={() => setAsking(false)} disabled={pending}>
              {t.work.endStay}
            </MobileButton>
            <MobileButton
              loading={pending}
              busyTitle={t.work.endingShift}
              onClick={() => startTransition(async () => void (await toggle(false, declared)))}
            >
              {t.work.endConfirm}
            </MobileButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="overflow-hidden rounded-m-card border border-m-hair bg-m-surface">
            <Line label={unitOne} value={String(count)} />
            <Line label={t.work.worksTotal} value={money(revenue)} />
            {/* Свои деньги последними и крупнее: из трёх строк это та,
                ради которой человек читает лист. */}
            <Line label={t.work.earnedToday} value={money(earned)} strong />
          </div>

          <MobileField
            label={t.work.handOver}
            hint={t.work.cashInShift(money(cash))}
            htmlFor="m-shift-cash"
          >
            <div className="relative">
              <MobileInput
                id="m-shift-cash"
                className="num pr-10 text-right"
                value={declared}
                onChange={(e) => setDeclared(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="off"
                disabled={pending}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[14px] text-m-muted">
                {currencySymbol(currency)}
              </span>
            </div>
          </MobileField>

          {/* Расхождение называем до нажатия: увидеть недостачу, пока
              ещё можно пересчитать деньги в руках. */}
          {differs && (
            <p className="px-1 text-[13px] font-medium text-m-warn">
              {t.work.handOverDiff(money(Math.abs(Number(declared) - cash)))}
            </p>
          )}
        </div>
      </MobileSheet>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 [&+*]:border-t [&+*]:border-m-hair">
      <span className="truncate text-[14px] text-m-muted">{label}</span>
      <span
        className={cn(
          'num shrink-0 text-m-ink',
          strong ? 'text-[17px] font-bold' : 'text-[15px] font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}
