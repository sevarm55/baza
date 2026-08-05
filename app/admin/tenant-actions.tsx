'use client';

import { useState, useTransition } from 'react';
import { blockTenant, extendSubscription, saveNote, unblockTenant } from './actions';
import { PRICE } from '@/lib/plan';
import s from './admin.module.css';

/**
 * Управление бизнесом из админки.
 *
 * Продление спрашивает сумму, а не берёт её из прайса. Договариваются
 * по-разному — «три месяца за сорок», «первый месяц в подарок», — и
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

  const run = (fn: () => Promise<void>) => startTransition(async () => void (await fn()));

  function open(m: number) {
    setMonths(m);
    setAmount(String(PRICE * m));
    setComment('');
  }

  function confirmPayment() {
    if (months === null) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 0) return;

    run(async () => {
      await extendSubscription(tenantId, months, value, comment);
      setMonths(null);
    });
  }

  return (
    <>
      <div className={s.actions}>
        {[1, 3, 12].map((m) => (
          <button
            key={m}
            className={`${s.btn} ${months === m ? s.btnOn : ''}`}
            disabled={pending}
            onClick={() => open(m)}
          >
            +{m} мес
          </button>
        ))}

        <span className={s.spacer} />

        {blocked ? (
          <button
            className={`${s.btn} ${s.btnGood}`}
            disabled={pending}
            onClick={() => run(() => unblockTenant(tenantId))}
          >
            Включить
          </button>
        ) : (
          <button
            className={`${s.btn} ${s.btnDanger}`}
            disabled={pending}
            onClick={() => {
              if (!confirm(`Отключить «${name}»? Доступ закроется сразу, данные сохранятся.`)) {
                return;
              }
              run(() => blockTenant(tenantId));
            }}
          >
            Отключить
          </button>
        )}
      </div>

      {months !== null && (
        <div className={s.pay}>
          <label className={s.payField}>
            <span>Получено</span>
            <input
              className={s.payInput}
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>

          <input
            className={s.payInput}
            placeholder="комментарий, необязательно"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <button className={`${s.btn} ${s.btnGood}`} disabled={pending} onClick={confirmPayment}>
            Продлить на {months} мес
          </button>
          <button className={s.btn} disabled={pending} onClick={() => setMonths(null)}>
            Отмена
          </button>
        </div>
      )}

      {/* Заметка всегда на виду, а не за кнопкой: её ценность в том, что
          она попадается на глаза ровно тогда, когда смотришь на клиента. */}
      <div className={s.noteRow}>
        <input
          className={s.noteInput}
          placeholder="заметка о клиенте"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          onBlur={() => {
            if (draftNote.trim() !== (note ?? '').trim()) {
              run(() => saveNote(tenantId, draftNote));
            }
          }}
        />
      </div>
    </>
  );
}
