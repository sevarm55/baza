'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addOrder, lookupClient } from '@/app/actions';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { CancelOrderButton } from '@/components/cancel-order-button';
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

const PAYMENTS: { key: Payment; label: string; icon: string }[] = [
  { key: 'cash', label: hy.payment.cash, icon: '💵' },
  { key: 'card', label: hy.payment.card, icon: '💳' },
  { key: 'transfer', label: hy.payment.transfer, icon: '📱' },
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
      <>
        <button
          className="btn btn-big"
          disabled={!canWrite}
          onClick={() => setStep('client')}
        >
          {addLabel}
        </button>

        {/* Мойщик должен видеть, что его работа не потерялась,
            даже если связи нет прямо сейчас. */}
        {queue.length > 0 && (
          <div className="hint-warn mt-3">
            {hy.work.waitingToSend(queue.length)}
          </div>
        )}

        <h2 className="h-section">{hy.work.recent}</h2>
        <div className="list">
          {queue.map((q) => (
            <div key={q.ref} className="li opacity-70">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{q.serviceName}</div>
                <div className="text-[12.5px] text-warn">{hy.work.pending}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[14.5px] font-semibold">
                  {formatMoney(q.price, currency)}
                </div>
                <div className="text-xs text-muted">{hhmm(new Date(q.at).toISOString())}</div>
              </div>
            </div>
          ))}
          {recent.length === 0 && queue.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {hy.work.noShiftYet}
            </div>
          ) : (
            recent.map((o) => (
              <div key={o.id} className="li">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{o.serviceName}</div>
                  <div className="text-[12.5px] text-muted">{paymentLabel(o.payment)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14.5px] font-semibold">
                    {formatMoney(o.price, currency)}
                  </div>
                  <div className="text-xs text-muted">{hhmm(o.at)}</div>
                </div>
                {/* ошибся номером или услугой — исправляет сам, не бегая к владельцу */}
                <CancelOrderButton orderId={o.id} />
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  /* ------------------------------ готово ------------------------------ */
  if (step === 'done') {
    return (
      <div className="py-10 text-center">
        <div className="text-[52px]">✅</div>
        <h3 className="mb-1 mt-3.5 text-xl font-semibold">{hy.work.saved}</h3>
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

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            /* яркий мандарин, а не тёмный: полоска в три пикселя —
               единственное, что показывает, сколько шагов осталось */
            className={`h-[5px] flex-1 rounded-full transition-colors ${
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
                <span className="font-semibold">🎟 {hy.payment.pass}</span>
                <span className="text-good">
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
                <span className="font-semibold">
                  {p.icon} {p.label}
                </span>
                {service && (
                  <span className="text-muted">{formatMoney(service.price, currency)}</span>
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
  if (p === 'pass') return `🎟 ${hy.payment.pass}`;
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
