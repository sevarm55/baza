'use client';

import { useState, useTransition } from 'react';

import { toggleShiftAction } from '@/app/actions';
import { formatMoney, currencySymbol } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { FormMessage } from '@/components/patterns/form';

/**
 * Начало и конец смены.
 *
 * Два действия с общим сервером и совершенно разной ценой ошибки.
 * Встать на смену — единственное, что человек может сделать на пустом
 * экране, поэтому это большая кнопка во всю ширину; промах по ней ничего
 * не стоит, вторая смена не откроется. Уйти со смены — наоборот: после
 * этого записывать нельзя, а жмут её один раз за день. Поэтому она
 * внизу и тихая, а перед тем как закрыть, показывает итог дня.
 */

function toggle(open: boolean, cash?: string) {
  const data = new FormData();
  data.set('open', String(open));
  /* Пустое поле — это «не отметил», а не ноль, и на сервер оно не едет
     вовсе: владелец должен различать «сдал 0» и «не сказал сколько». */
  if (cash !== undefined && cash !== '') data.set('cash', cash);
  return toggleShiftAction(data);
}

export function StartShift() {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {/* Кнопка занята на время запроса: связь на мойке пропадает, и
          кнопка, которая молчит секунду, выглядит ненажатой. */}
      <LoadingButton
        type="button"
        size="lg"
        className="h-12 w-full text-[15px]"
        busy={pending}
        label={t.work.startShift}
        busyLabel={t.work.startingShift}
        onClick={() => startTransition(async () => void (await toggle(true)))}
      />
      {/* Вне смены записывать нельзя: объяснение стоит под кнопкой,
          которая это правило снимает. */}
      <FieldDescription className="text-center text-xs">{t.work.needShift}</FieldDescription>
    </div>
  );
}

export function EndShift({
  count,
  revenue,
  earned,
  cash,
  currency,
  unitOne,
}: {
  count: number;
  revenue: number;
  earned: number;
  /** наличных за смену; считает сервер тем же `cashInShift` */
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

  const differs = declared !== '' && Number(declared) !== cash;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full"
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        {t.work.endShift}
      </Button>

      {/* Окно продукта, а не браузерный вопрос: читают здесь день,
          который закрывают, — три числа, после которых решение
          принимается за секунду. Пока запрос летит, окно не закрыть. */}
      <Dialog open={asking} onOpenChange={(next) => !pending && setAsking(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.work.endTitle}</DialogTitle>
            <DialogDescription>{t.work.endNote(unitOne)}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <DetailList>
              <DetailRow label={unitOne} value={String(count)} mono />
              <DetailRow label={t.work.worksTotal} value={formatMoney(revenue, currency, t.locale)} mono />
              {/* Свои деньги — последними и крупнее: из трёх строк это
                  та, ради которой человек читает окно. */}
              <DetailRow
                label={t.work.earnedToday}
                value={
                  <span className="text-base font-semibold">
                    {formatMoney(earned, currency, t.locale)}
                  </span>
                }
                mono
              />
            </DetailList>

            {/* Сдача наличных: единственный момент, когда деньги
                переходят из рук в руки. Поле не обязательное —
                закрыться человек должен уметь всегда. */}
            <Field>
              <FieldLabel htmlFor="shift-cash">{t.work.handOver}</FieldLabel>
              <InputGroup className="h-11">
                <InputGroupInput
                  id="shift-cash"
                  className="num text-end text-base"
                  value={declared}
                  onChange={(e) => setDeclared(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={pending}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription className="text-xs">
                {t.work.cashInShift(formatMoney(cash, currency, t.locale))}
              </FieldDescription>
            </Field>

            {/* Расхождение называем до нажатия: увидеть недостачу, пока
                ещё можно пересчитать деньги в руках. */}
            {differs && (
              <FormMessage tone="info" className="text-warning">
                {t.work.handOverDiff(
                  formatMoney(Math.abs(Number(declared) - cash), currency, t.locale),
                )}
              </FormMessage>
            )}
          </div>

          {/* Два равноправных выхода — две кнопки одного размера; разницу
              несёт заливка, а не габарит. */}
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {t.work.endStay}
            </Button>
            <LoadingButton
              type="button"
              busy={pending}
              label={t.work.endConfirm}
              busyLabel={t.work.endingShift}
              onClick={() => startTransition(async () => void (await toggle(false, declared)))}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
