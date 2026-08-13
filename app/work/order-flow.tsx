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
import { hhmm } from '@/lib/time';
import { normalizeClientKey } from '@/lib/client-key';

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

/**
 * Что на экране.
 *
 * Мастера из трёх шагов больше нет. Он стоил тех же трёх касаний, но
 * между ними были три смены страницы: мойщик не видел, что уже выбрал,
 * не мог поправить номер, не вернувшись назад, и не знал суммы, пока не
 * дошёл до оплаты. Теперь номер, услуга и оплата стоят на одном экране —
 * в том порядке, в каком идёт работа, — и запись по-прежнему занимает
 * три касания. Так же устроена запись в приложении.
 */
type Step = 'home' | 'compose' | 'done';

/** Подложка прибора — та же, что рисует `Panel`. */
const PANEL = { background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' } as const;

/* Тон у каждого способа свой — тот же, что в приложении: наличные
   лаймовые, карта фиолетовая, перевод серый. Цвет здесь не украшение, а
   способ попасть пальцем не глядя: мойщик знает, где «наличные», по
   пятну, а не по слову. */
const PAYMENTS: { key: Payment; label: string; Icon: typeof IconCash; tone: string }[] = [
  { key: 'cash', label: hy.payment.cash, Icon: IconCash, tone: 'lime' },
  { key: 'card', label: hy.payment.card, Icon: IconCard, tone: 'violet' },
  { key: 'transfer', label: hy.payment.transfer, Icon: IconTransfer, tone: 'slate' },
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
  timezone,
}: {
  canWrite: boolean;
  services: Service[];
  currency: string;
  clientIdLabel: string;
  clientIdType: string;
  addLabel: string;
  percent: number;
  recent: Recent[];
  /* Часовой пояс мойки приходит пропом, а не берётся из браузера. Иначе
     время записи меняется прямо на глазах: сервер собирает HTML в своей
     зоне, гидратация пересчитывает его в зоне телефона, и «00:17»
     мигает через «20:17». */
  timezone: string;
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
  const resolvedClientKey =
    clientIdType === 'plate'
      ? normalizeClientKey(clientKey)
      : clientKey.trim().toUpperCase();

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
    if (step !== 'compose') return;
    const key = resolvedClientKey;
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
  }, [resolvedClientKey, step]);

  useEffect(() => {
    if (step === 'compose') inputRef.current?.focus();
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
      clientKey: resolvedClientKey,
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
          <button className="btn btn-big" onClick={() => setStep('compose')}>
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
                    {hhmm(q.at, timezone)}
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
                      {paymentLabel(o.payment)} · {hhmm(o.at, timezone)}
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

  /* ----------------------------- запись ------------------------------ */
  const activePass = service
    ? known?.passes?.find((p) => p.serviceId === service.id)
    : undefined;
  const ready = resolvedClientKey.length > 0 && service !== null;

  /* Запись — на той же подложке, что журнал на её месте. Иначе при
     переходе с главной прибор исчезает, и форма висит на голом
     полотне: экран выглядит так, будто разметка сломалась. */
  return (
    <div className="panel-pad rounded-[var(--radius-card)]" style={PANEL}>
      {/* Номер первым: сначала подъехала машина, потом решают, что с
          ней делают. */}
      <label className="grid gap-1.5">
        <span className="label">{clientIdLabel}</span>
        <input
          ref={inputRef}
          className="field field-key auth-field"
          value={clientKey}
          onChange={(e) => setClientKey(e.target.value)}
          onBlur={() => setClientKey(resolvedClientKey)}
          inputMode={clientIdType === 'phone' ? 'tel' : 'text'}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </label>

      {/* Узнавание постоянного прямо при наборе — то, ради чего экран и
          существует: мойщик видит, что машина уже была, до того как
          назовёт цену. */}
      {known && (
        <div className="hint-good mt-2">
          {hy.work.knownClient(
            known.visits,
            agoLabel(known.lastSeenAt),
            formatMoney(known.total, currency),
          )}
        </div>
      )}

      <div className="label mt-4 mb-2">{hy.work.stepService}</div>
      {/* Услуги фишками, а не столбцом кнопок: их пять-шесть, названия
          разной длины, и в столбце они занимали пол-экрана — до оплаты
          приходилось листать. Повторное нажатие снимает выбор. */}
      <div className="flex flex-wrap gap-2">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            className="pick"
            data-on={service?.id === s.id ? '' : undefined}
            aria-pressed={service?.id === s.id}
            onClick={() => setService((cur) => (cur?.id === s.id ? null : s))}
          >
            <span className="pick-name">{s.name}</span>
            <span className="num pick-price">{formatMoney(s.price, currency)}</span>
          </button>
        ))}
      </div>

      {/* Итог и оплата — низом, у большого пальца руки, которой держат
          телефон. Касание по способу оплаты и есть запись: отдельной
          кнопки «сохранить» нет, потому что деньги берут один раз. */}
      <div className="mt-4 border-t pt-3.5" style={{ borderColor: 'var(--hairline)' }}>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <span className="text-[13px]" style={{ color: 'var(--board-muted)' }}>
            {hy.owner.clientsTotalSpent}
          </span>
          <span className="num text-[24px] leading-none font-bold tracking-[-0.03em]">
            {formatMoney(service?.price ?? 0, currency)}
          </span>
        </div>

        {/* Абонемент идёт первым и во всю ширину: если он у клиента
            есть, брать деньги повторно — прямая ошибка. */}
        {activePass && (
          <button
            type="button"
            className="opt mb-2 !border-good-line !bg-good-bg"
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

        <div className="grid grid-cols-3 gap-2">
          {PAYMENTS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="pay"
              data-tone={p.tone}
              disabled={!ready || pending}
              onClick={() => confirm(p.key)}
            >
              <p.Icon className="size-[18px]" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="alert mt-2.5">{error}</p>}

      <button className="btn btn-ghost mt-2.5" disabled={pending} onClick={reset}>
        {hy.common.cancel}
      </button>
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

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(days);
}
