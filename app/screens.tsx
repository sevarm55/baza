'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import s from './landing.module.css';

/**
 * Экраны продукта, встроенные в рассказ о дне.
 *
 * Это не мокапы: та же вёрстка и те же цифры, что внутри. Каждый экран
 * оживает, когда до него дошли, а не при загрузке страницы: раньше демо
 * стояло первым и досматривать было нечего, теперь оно лежит в середине
 * ленты, и анимация на старте отыграла бы в пустоту.
 */

const PLATE = '12 AB 345';
const PERCENT = 40;
const STAFF = 'Աշոտ';

const RECORDS = [
  { name: 'Կոմպլեքս', pay: hy.payment.cash, cash: true, price: 5000 },
  { name: 'Քիմմաքրում', pay: hy.payment.card, cash: false, price: 12000 },
];

const TOTAL = RECORDS.reduce((sum, r) => sum + r.price, 0);
const CASH = RECORDS.filter((r) => r.cash).reduce((sum, r) => sum + r.price, 0);

/** Показывает, что до блока долистали. Срабатывает один раз. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      // ждём, пока блок войдёт в экран заметно, а не краем
      { rootMargin: '-15% 0px -15% 0px' },
    );

    io.observe(node);
    return () => io.disconnect();
  }, []);

  return [ref, seen] as const;
}

/** Счётчик догоняет цель плавно: резкий скачок читается как ошибка вёрстки. */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const from = shown.current;
    if (target === from) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (target - from) * eased);
      shown.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return value;
}

/* ─────────────────────── экран мойщика ─────────────────────── */

export function WorkerScreen() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!seen) return;

    const after = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    const stop = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    // Кому анимация мешает — сразу конечное состояние, но тем же путём,
    // через отложенный вызов: сцена одна, веток исполнения тоже одна.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      after(0, () => {
        setTyped(PLATE);
        setShown(RECORDS.length);
      });
      return stop;
    }

    after(260, () => {
      setTyping(true);
      PLATE.split('').forEach((_, i) => {
        after(80 * i, () => setTyped(PLATE.slice(0, i + 1)));
      });
    });

    const typedAt = 260 + 80 * PLATE.length;
    after(typedAt + 360, () => setTyping(false));

    RECORDS.forEach((_, i) => {
      after(typedAt + 520 + i * 900, () => setShown(i + 1));
    });

    return stop;
  }, [seen]);

  const visible = RECORDS.slice(0, shown);
  const revenue = visible.reduce((sum, r) => sum + r.price, 0);
  const earned = useCountUp(staffShare(revenue, PERCENT));

  return (
    <div ref={ref} className={s.screen} aria-hidden="true">
      <div className={s.screenBar}>
        <span>🚿</span>
        <b>Ավտոլվացում</b>
        <span className={s.screenWho}>{STAFF}</span>
      </div>

      <div className={s.screenBody}>
        <div className={s.shift}>
          <div className={s.shiftLabel}>{hy.work.shiftTitle}</div>
          <div className={s.shiftValue}>{formatMoney(earned)}</div>
          <div className={s.shiftMeta}>
            {shown} մեքենա · {formatMoney(revenue)} · {hy.work.yourShare} {PERCENT}%
          </div>
        </div>

        <div className={s.plateLabel}>Պետհամարանիշ</div>
        <div className={s.plate}>
          <span className={s.plateFlag}>AM</span>
          <span>{typed}</span>
          {typing && <i className={s.caret} />}
        </div>

        <div className={s.records}>
          {visible.map((r) => (
            <div key={r.name} className={s.record}>
              <div>
                <div className={s.recordName}>{r.name}</div>
                <div className={s.recordPay}>{r.pay}</div>
              </div>
              <div className={s.recordSum}>{formatMoney(r.price)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── экран владельца ─────────────────────── */

export function OwnerScreen() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const revenue = useCountUp(seen ? TOTAL : 0);

  const avg = Math.round(TOTAL / RECORDS.length);
  const cashPercent = Math.round((CASH / TOTAL) * 100);

  return (
    <div ref={ref} className={s.screen} aria-hidden="true">
      <div className={s.screenBar}>
        <b>Ավտոլվացում</b>
        <span className={s.screenWho}>{hy.owner.periodToday}</span>
      </div>

      <div className={s.screenBody}>
        <div className={s.ownerLabel}>{hy.owner.revenue}</div>
        <div className={s.ownerValue}>{formatMoney(revenue)}</div>
        <div className={s.ownerMeta}>
          {RECORDS.length} մեքենա · {hy.owner.avgCheck} {formatMoney(avg)}
        </div>

        {/* Доля наличных — вопрос, с которого начинается весь продукт. */}
        <div className={s.split}>
          <i
            style={{
              width: seen ? `${cashPercent}%` : '0%',
              background: 'var(--color-good)',
            }}
          />
          <i
            style={{
              width: seen ? `${100 - cashPercent}%` : '0%',
              background: 'var(--color-accent-strong)',
            }}
          />
        </div>
        <div className={s.splitLegend}>
          <span>
            <i style={{ background: 'var(--color-good)' }} />
            {hy.payment.cash} {formatMoney(CASH)}
          </span>
          <span>
            <i style={{ background: 'var(--color-accent-strong)' }} />
            {hy.payment.card} {formatMoney(TOTAL - CASH)}
          </span>
        </div>

        <div className={s.ownerLabel}>{hy.owner.onShift}</div>
        <div className={s.staffRow}>
          <span className={s.avatar}>{STAFF.slice(0, 1)}</span>
          <div className={s.staffWho}>
            <div className={s.staffName}>{STAFF}</div>
            <div className={s.staffMeta}>
              {RECORDS.length} մեքենա · {formatMoney(TOTAL)}
            </div>
          </div>
          <div className={s.staffSum}>
            {hy.owner.earned} {formatMoney(staffShare(TOTAL, PERCENT))}
          </div>
        </div>
      </div>
    </div>
  );
}
