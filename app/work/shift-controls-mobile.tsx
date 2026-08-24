'use client';

import { useState, useTransition } from 'react';
import { LogIn, LogOut } from 'lucide-react';

import { toggleShiftAction } from '@/app/actions';
import { MButton, MField, MInput, MSheet } from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { currencySymbol, formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Начать смену и закрыть смену — одна кнопка, меняющая смысл.
 *
 * Не тумблер: тумблер показывает состояние, а состояние уже названо
 * живой фишкой под заработком, и второй его носитель на том же экране
 * означал бы, что человек читает одно и то же дважды. Здесь стоит
 * действие, и оно каждый раз ровно одно.
 *
 * Вне смены кнопка грейповая и стоит первой: встать на смену — первое
 * действие дня и единственное, ради которого экран открывают до первой
 * машины. На смене она становится тихой и уходит вниз: закрываются раз
 * в день, и в середине дня эта кнопка — самая опасная на экране.
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
      <MButton
        block
        tone={onShift ? 'quiet' : 'grape'}
        icon={onShift ? LogOut : LogIn}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn('md:hidden', onShift && 'text-m-muted')}
        onClick={() => {
          if (onShift) {
            setAsking(true);
            return;
          }
          startTransition(async () => void (await toggle(true)));
        }}
      >
        {onShift ? t.work.endConfirm : t.work.startShift}
      </MButton>

      {/* Лист сдачи: три числа, после которых решение принимается за
          секунду, и поле наличных. Поле не обязательное — закрыться
          человек должен уметь всегда. */}
      <MSheet
        open={asking}
        onOpenChange={(next) => !pending && setAsking(next)}
        title={t.work.endTitle}
        description={t.work.endNote(unitOne)}
        closeLabel={t.common.close}
        footer={
          /* Два равноправных выхода одного размера: разницу несёт
             заливка, а не габарит. */
          <div className="grid grid-cols-2 gap-2">
            <MButton tone="quiet" onClick={() => setAsking(false)} disabled={pending}>
              {t.work.endStay}
            </MButton>
            <MButton
              disabled={pending}
              onClick={() => startTransition(async () => void (await toggle(false, declared)))}
            >
              {pending ? t.work.endingShift : t.work.endConfirm}
            </MButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="overflow-hidden rounded-m-tile bg-m-tile">
            <Line label={unitOne} value={String(count)} />
            <Line label={t.work.worksTotal} value={money(revenue)} />
            {/* Свои деньги последними и крупнее: из трёх строк это та,
                ради которой человек читает лист. */}
            <Line label={t.work.earnedToday} value={money(earned)} strong />
          </div>

          <MField
            label={t.work.handOver}
            hint={t.work.cashInShift(money(cash))}
            htmlFor="m-shift-cash"
          >
            <div className="relative">
              <MInput
                id="m-shift-cash"
                className="num pr-11 text-right"
                value={declared}
                onChange={(e) => setDeclared(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="off"
                disabled={pending}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] text-m-muted">
                {currencySymbol(currency)}
              </span>
            </div>
          </MField>

          {/* Расхождение называем до нажатия: увидеть недостачу, пока
              ещё можно пересчитать деньги в руках. */}
          {differs && (
            <p className="px-1 text-[13.5px] font-semibold text-m-warn">
              {t.work.handOverDiff(money(Math.abs(Number(declared) - cash)))}
            </p>
          )}
        </div>
      </MSheet>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5 [&+*]:border-t [&+*]:border-m-hair">
      <span className="truncate text-[14.5px] text-m-muted">{label}</span>
      <span
        className={cn(
          'num shrink-0 text-m-ink',
          strong ? 'text-[19px] font-bold' : 'text-[16px] font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}
