'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addOrder, lookupClient } from '@/app/actions';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { CancelOrderButton } from '@/components/cancel-order-button';
import { Panel, Row } from '@/components/board';
import { IconCard, IconCash, IconCheck, IconTicket, IconTransfer } from '@/components/icons';
import {
  enqueue,
  flushQueue,
  newRef,
  readQueue,
  subscribe,
  type QueuedOrder,
} from '@/lib/offline';
import type { Payment } from '@/lib/orders';

type Service = { id: string; name: string; price: number };
type Recent = {
  id: string;
  serviceName: string;
  price: number;
  payment: string;
  at: string;
};
type ActivePass = {
  id: string;
  serviceId: string | null;
  serviceName: string;
  remaining: number;
};
type Known = {
  visits: number;
  total: number;
  lastSeenAt: string;
  passes: ActivePass[];
};

type Step = 'home' | 'client' | 'service' | 'payment' | 'done';

/** Подложка прибора — та же, что рисует `Panel`. */
const PANEL = { background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' } as const;

const PAYMENTS: { key: Payment; label: string; Icon: typeof IconCash }[] = [
  { key: 'cash', label: hy.payment.cash, Icon: IconCash },
  { key: 'card', label: hy.payment.card, Icon: IconCard },
  { key: 'transfer', label: hy.payment.transfer, Icon: IconTransfer },
];

export function OrderFlow({
  canWrite,
  services,
  currency,
  clientIdLabel,
  clientIdType,
  addLabel,
  percent,
  recent,
}: {
  canWrite: boolean;
  services: Service[];
  currency: string;
  clientIdLabel: string;
  clientIdType: string;
  addLabel: string;
  percent: number;
  recent: Recent[];
}) {
  const [step, setStep] = useState<Step>('home');
  const [clientKey, setClientKey] = useState('');
  const [service, setService] = useState<Service | null>(null);
  const [known, setKnown] = useState<Known | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState<QueuedOrder[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setQueue(readQueue());
    return subscribe(setQueue);
  }, []);

  /* Досылаем накопленное при загрузке и как только связь вернулась.
     Сервер отсеет повторы по ref, поэтому лишняя попытка безвредна. */
  useEffect(() => {
    const run = () => {
      void flushQueue(async (item) => {
        await addOrder({
          clientKey: item.clientKey,
          serviceId: item.serviceId,
          payment: item.payment,
          passId: item.passId,
          clientRef: item.ref,
        });
      }).then((sent) => {
        if (sent > 0) router.refresh();
      });
    };

    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [router]);

  /* Подсказка о клиенте ищется во время набора. Задержка нужна, чтобы
     не бить в сервер на каждую букву, но 250 мс человек не замечает. */
  useEffect(() => {
    if (step !== 'client') return;
    const key = clientKey.trim();
    if (key.length < 3) {
      setKnown(null);
      return;
    }
    const timer = setTimeout(() => {
      lookupClient(key)
        .then(setKnown)
        .catch(() => setKnown(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [clientKey, step]);

  useEffect(() => {
    if (step === 'client') inputRef.current?.focus();
  }, [step]);

  function reset() {
    setStep('home');
    setClientKey('');
    setService(null);
    setKnown(null);
    setError(null);
  }

  function confirm(payment: Payment, passId?: string) {
    if (!service) return;
    setError(null);

    const item: QueuedOrder = {
      ref: newRef(),
      clientKey,
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      payment,
      passId,
      at: Date.now(),
    };

    // без связи даже не пытаемся: запись ложится в очередь, мойщик
    // видит успех и моет дальше
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueue(item);
      setStep('done');
      setTimeout(reset, 1300);
      return;
    }

    startTransition(async () => {
      try {
        await addOrder({
          clientKey: item.clientKey,
          serviceId: item.serviceId,
          payment: item.payment,
          passId: item.passId,
          clientRef: item.ref,
        });
        setStep('done');
        setTimeout(reset, 1300);
      } catch {
        // связь могла оборваться прямо во время отправки
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          enqueue(item);
          setStep('done');
          setTimeout(reset, 1300);
          return;
        }
        setError(hy.errors.generic);
        setStep('payment');
      }
    });
  }

  /* ------------------------------ главная ------------------------------ */
  if (step === 'home') {
    return (
      <div className="grid content-start gap-[var(--seam)]">
        {/* Кнопка есть только тогда, когда ею можно пользоваться.
            Погашенная кнопка вне смены читалась поломкой; теперь вне
            смены на её месте стоит начало смены — см. ShiftToggle. */}
        {canWrite && (
          <button className="btn btn-big" onClick={() => setStep('client')}>
            {addLabel}
          </button>
        )}

        {/* Мойщик должен видеть, что его работа не потерялась, даже если
            связи нет прямо сейчас. */}
        {queue.length > 0 && <div className="hint-warn">{hy.work.waitingToSend(queue.length)}</div>}

        {/* Журнал — прибор с подложкой, как списки в кабинете. Раньше он
            лежал прямо на полотне: строки висели в пустоте, а время и
            крестик уезжали к правому краю экрана, ни к чему не
            привязанные. */}
        <Panel title={hy.work.recent} count={recent.length + queue.length}>
          <div className="board-journal">
            {queue.map((q) => (
              <Row key={q.ref}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{q.serviceName}</span>
                  <span className="block text-[12.5px]" style={{ color: 'var(--warn-on-board)' }}>
                    {hy.work.pending}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="num block text-[14px] font-semibold">
                    {formatMoney(q.price, currency)}
                  </span>
                  <span
                    className="num block text-[12px]"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    {hhmm(new Date(q.at).toISOString())}
                  </span>
                </span>
              </Row>
            ))}

            {recent.length === 0 && queue.length === 0 ? (
              <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.work.noShiftYet}
              </p>
            ) : (
              recent.map((o) => (
                <Row key={o.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{o.serviceName}</span>
                    <span
                      className="block truncate text-[12.5px]"
                      style={{ color: 'var(--board-muted)' }}
                    >
                      {paymentLabel(o.payment)} · {hhmm(o.at)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[14px] font-semibold">
                    {formatMoney(o.price, currency)}
                  </span>
                  {/* Ошибся номером или услугой — исправляет сам, не бегая
                      к владельцу. Стоит последним и тихо: отменять
                      приходится одну запись из сорока. */}
                  <CancelOrderButton orderId={o.id} />
                </Row>
              ))
            )}
          </div>
        </Panel>
      </div>
    );
  }

  /* ------------------------------ готово ------------------------------ */
  if (step === 'done') {
    return (
      <div className="panel-pad rounded-[var(--radius-card)] py-10 text-center" style={PANEL}>
        {/* Галка в кружке, а не эмодзи: тот же контур 1.5, что у всех
            знаков продукта, и тот же зелёный, которым в кабинете
            помечено «сошлось». */}
        <div
          className="mx-auto flex size-14 items-center justify-center rounded-[var(--radius-card)] text-good"
          style={{ background: 'color-mix(in srgb, var(--good) 14%, transparent)' }}
        >
          <IconCheck className="size-7" />
        </div>
        <h3 className="mb-1 mt-3.5 text-[19px] font-semibold tracking-[-0.02em]">{hy.work.saved}</h3>
        {service && (
          <p className="text-sm text-muted">
            {service.name} · {formatMoney(service.price, currency)} →{' '}
            <span className="text-good">
              {formatMoney(staffShare(service.price, percent), currency)}
            </span>
          </p>
        )}
      </div>
    );
  }

  /* ------------------------------ мастер ------------------------------ */
  const stepIndex = step === 'client' ? 1 : step === 'service' ? 2 : 3;
  const activePass = service
    ? known?.passes?.find((p) => p.serviceId === service.id)
    : undefined;

  /* Мастер записи — на той же подложке, что журнал на его месте.
     Иначе при переходе с главной прибор исчезает, и три шага висят на
     голом полотне: экран выглядит так, будто разметка сломалась. */
  return (
    <div className="panel-pad rounded-[var(--radius-card)]" style={PANEL}>
      {/* Полоска шагов — прямая, а не из трёх таблеток: капсула в три
          пикселя высотой всё равно не читается как капсула, зато рядом
          с прямоугольными полями выглядит деталью из другого набора. */}
      <div className="mb-4 flex gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 rounded-[2px] transition-colors ${
              i <= stepIndex ? 'bg-accent-strong' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {step === 'client' && (
        <>
          <div className="card">
            <div className="mb-2.5 text-xs text-muted">{clientIdLabel}</div>
            <input
              ref={inputRef}
              className="field field-key"
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              inputMode={clientIdType === 'phone' ? 'tel' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && clientKey.trim()) setStep('service');
              }}
            />
            {known && (
              <div className="hint-good mt-2.5">
                {hy.work.knownClient(
                  known.visits,
                  agoLabel(known.lastSeenAt),
                  formatMoney(known.total, currency),
                )}
              </div>
            )}
          </div>

          <button
            className="btn mt-2.5"
            disabled={!clientKey.trim()}
            onClick={() => setStep('service')}
          >
            {hy.common.next}
          </button>
          <button className="btn btn-ghost mt-2" onClick={reset}>
            {hy.common.cancel}
          </button>
        </>
      )}

      {step === 'service' && (
        <>
          <div className="mb-2.5 text-xs text-muted">{hy.work.stepService}</div>
          <div className="grid gap-2">
            {services.map((s) => (
              <button
                key={s.id}
                className="opt"
                onClick={() => {
                  setService(s);
                  setStep('payment');
                }}
              >
                <span className="font-semibold">{s.name}</span>
                <span className="text-muted">{formatMoney(s.price, currency)}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost mt-2.5" onClick={() => setStep('client')}>
            {hy.common.back}
          </button>
        </>
      )}

      {step === 'payment' && (
        <>
          <div className="mb-2.5 text-xs text-muted">{hy.work.stepPayment}</div>
          <div className="grid gap-2">
            {/* Абонемент идёт первым и выделен: если у клиента он есть,
                брать с него деньги повторно — прямая ошибка. */}
            {activePass && (
              <button
                className="opt !border-good-line !bg-good-bg"
                disabled={pending}
                onClick={() => confirm('pass', activePass.id)}
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <IconTicket className="size-[18px] shrink-0 text-good" />
                  {hy.payment.pass}
                </span>
                <span className="num text-good">
                  {hy.passes.remaining} {activePass.remaining}
                </span>
              </button>
            )}
            {PAYMENTS.map((p) => (
              <button
                key={p.key}
                className="opt"
                disabled={pending}
                onClick={() => confirm(p.key)}
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <p.Icon className="size-[18px] shrink-0 text-muted" />
                  {p.label}
                </span>
                {service && (
                  <span className="num text-muted">{formatMoney(service.price, currency)}</span>
                )}
              </button>
            ))}
          </div>
          {error && <p className="alert mt-2.5">{error}</p>}
          <button
            className="btn btn-ghost mt-2.5"
            disabled={pending}
            onClick={() => setStep('service')}
          >
            {hy.common.back}
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------ мелочи ------------------------------ */

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(days);
}
