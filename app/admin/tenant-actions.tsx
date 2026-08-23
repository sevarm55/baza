'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { LoadingButton } from '@/components/loading';
import { PRICE } from '@/lib/plan';
import { cn } from '@/lib/utils';
import { blockTenant, extendSubscription, saveNote, unblockTenant } from './actions';

/**
 * Управление бизнесом из админки.
 *
 * Продление спрашивает сумму, а не берёт её из прайса. Договариваются
 * по-разному («три месяца за сорок», «первый месяц в подарок»), и
 * записывать надо то, что было, а не то, что полагалось. Прайс лишь
 * подставляется в поле, чтобы в обычном случае ничего не набирать.
 *
 * Отключение спрашивает подтверждение и называет бизнес по имени:
 * нажатие не туда оставляет живую мойку без учёта посреди смены.
 */
export function TenantActions({
  tenantId,
  name,
  blocked,
  note,
}: {
  tenantId: string;
  name: string;
  blocked: boolean;
  note: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [months, setMonths] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [draftNote, setDraftNote] = useState(note ?? '');
  const [asking, setAsking] = useState(false);

  /* Какое действие идёт прямо сейчас. Общий `pending` гасил все
     кнопки строки разом и ни на одной не показывал, что нажали именно
     её: админ жал «Отключить», видел серую полосу кнопок и не понимал,
     ушёл запрос или он промахнулся. */
  const [busy, setBusy] = useState<string | null>(null);
  const busyOn = (key: string) => busy === key && pending;

  const run = (key: string, fn: () => Promise<void>) => {
    if (pending) return;
    setBusy(key);
    startTransition(async () => void (await fn()));
  };

  function open(m: number) {
    if (pending) return;
    setMonths(m);
    setAmount(String(PRICE * m));
    setComment('');
  }

  const amountValue = Number(amount);
  const amountOk = Number.isInteger(amountValue) && amountValue >= 0;

  function confirmPayment() {
    if (months === null || !amountOk) return;

    run('pay', async () => {
      await extendSubscription(tenantId, months, amountValue, comment);
      setMonths(null);
    });
  }

  const amountId = `pay-${tenantId}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 3, 12].map((m) => (
          <Button
            key={m}
            type="button"
            variant="outline"
            size="xs"
            aria-pressed={months === m}
            aria-disabled={pending || undefined}
            className={cn(
              months === m && 'border-primary/30 bg-primary-soft text-primary-soft-foreground',
            )}
            onClick={() => open(m)}
          >
            +{m} мес
          </Button>
        ))}

        <span className="flex-1" aria-hidden />

        {blocked ? (
          <LoadingButton
            type="button"
            variant="outline"
            size="xs"
            busy={busyOn('unblock')}
            label="Включить"
            busyLabel="Включаем…"
            onClick={() => run('unblock', () => unblockTenant(tenantId))}
          />
        ) : (
          <Button
            type="button"
            variant="destructive-soft"
            size="xs"
            aria-disabled={pending || undefined}
            onClick={() => !pending && setAsking(true)}
          >
            Отключить
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={asking}
        onOpenChange={(next) => !pending && setAsking(next)}
        title={`Отключить «${name}»?`}
        description="Доступ закроется сразу, данные сохранятся."
        destructive
        busy={busyOn('block')}
        confirmLabel="Отключить"
        busyLabel="Отключаем…"
        cancelLabel="Отмена"
        onConfirm={() =>
          run('block', async () => {
            await blockTenant(tenantId);
            setAsking(false);
          })
        }
      />

      {months !== null && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 sm:flex-row sm:items-end">
          <Field className="sm:w-44">
            <FieldLabel htmlFor={amountId}>Получено</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>֏</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={amountId}
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountOk || undefined}
                autoFocus
              />
            </InputGroup>
          </Field>

          <Input
            placeholder="комментарий, необязательно"
            aria-label="Комментарий к платежу"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="sm:flex-1"
          />

          <div className="flex items-center gap-2">
            <LoadingButton
              type="button"
              size="sm"
              busy={busyOn('pay')}
              disabled={!amountOk}
              label={`Продлить на ${months} мес`}
              busyLabel={`Продлеваем на ${months} мес…`}
              onClick={confirmPayment}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={pending || undefined}
              onClick={() => !pending && setMonths(null)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      {/* Заметка всегда на виду, а не за кнопкой: её ценность в том, что
          она попадается на глаза ровно тогда, когда смотришь на клиента. */}
      <InputGroup className="h-8" aria-busy={busyOn('note') || undefined}>
        <InputGroupInput
          placeholder="заметка о клиенте"
          aria-label="Заметка о клиенте"
          className="h-8"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          onBlur={() => {
            if (draftNote.trim() !== (note ?? '').trim()) {
              run('note', () => saveNote(tenantId, draftNote));
            }
          }}
        />
        {busyOn('note') && (
          <InputGroupAddon align="inline-end">
            <Spinner className="size-3.5" aria-label="Сохраняем заметку" />
          </InputGroupAddon>
        )}
      </InputGroup>
    </div>
  );
}
