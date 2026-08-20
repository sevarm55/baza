'use client';

import { useState, useTransition } from 'react';
import { blockTenant, extendSubscription, saveNote, unblockTenant } from './actions';
import { PRICE } from '@/lib/plan';
import s from './admin.module.css';
import { TetrinMiniLoader } from '@/components/loading';

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

  /* Какое действие идёт прямо сейчас. Общий `pending` гасил все
     кнопки строки разом и ни на одной не показывал, что нажали именно
     её: админ жал «Отключить», видел серую полосу кнопок и не понимал,
     ушёл запрос или он промахнулся. */
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<void>) => {
    if (pending) return;
    setBusy(key);
    startTransition(async () => void (await fn()));
  };

  function open(m: number) {
    setMonths(m);
    setAmount(String(PRICE * m));
    setComment('');
  }

  function confirmPayment() {
    if (months === null) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 0) return;

    run('pay', async () => {
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
            aria-disabled={pending || undefined}
            onClick={() => !pending && open(m)}
          >
            +{m} мес
          </button>
        ))}

        <span className={s.spacer} />

        {blocked ? (
          <button
            className={`${s.btn} ${s.btnGood}`}
            aria-busy={busy === 'unblock' && pending}
            aria-disabled={pending || undefined}
            onClick={() => run('unblock', () => unblockTenant(tenantId))}
          >
            {busy === 'unblock' && pending && <TetrinMiniLoader />}
            <span>{busy === 'unblock' && pending ? 'Включаем…' : 'Включить'}</span>
          </button>
        ) : (
          <button
            className={`${s.btn} ${s.btnDanger}`}
            aria-busy={busy === 'block' && pending}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!confirm(`Отключить «${name}»? Доступ закроется сразу, данные сохранятся.`)) {
                return;
              }
              run('block', () => blockTenant(tenantId));
            }}
          >
            {busy === 'block' && pending && <TetrinMiniLoader />}
            <span>{busy === 'block' && pending ? 'Отключаем…' : 'Отключить'}</span>
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

          <button
            className={`${s.btn} ${s.btnGood}`}
            aria-busy={busy === 'pay' && pending}
            aria-disabled={pending || undefined}
            onClick={confirmPayment}
          >
            {busy === 'pay' && pending && <TetrinMiniLoader />}
            <span>
              {busy === 'pay' && pending ? `Продлеваем на ${months} мес…` : `Продлить на ${months} мес`}
            </span>
          </button>
          <button
            className={s.btn}
            aria-disabled={pending || undefined}
            onClick={() => !pending && setMonths(null)}
          >
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
              run('note', () => saveNote(tenantId, draftNote));
            }
          }}
        />
      </div>
    </>
  );
}
