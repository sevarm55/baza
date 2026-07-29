'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import s from './landing.module.css';

/**
 * Две стороны одной записи, оживающие один раз при загрузке.
 *
 * Это не мокап: та же вёрстка и те же цифры, что в продукте. Впереди —
 * телефон мойщика, за ним — кабинет владельца. Машина заезжает один раз,
 * а меняются оба экрана сразу: у мойщика растёт его заработок, у владельца
 * — выручка и доля наличных. В этом весь продукт, и показать его одним
 * экраном нельзя: половина смысла в том, что вторая сторона видит то же
 * самое, но по-своему.
 *
 * Одна оркестрованная сцена, дальше покой. Разбросанные по странице
 * эффекты выглядят суетой, а не характером.
 */

const PLATE = '12 AB 345';
const PERCENT = 40;
const STAFF = 'Աշոտ';

const RECORDS = [
  { name: 'Կոմպլեքս', pay: hy.payment.cash, cash: true, price: 5000 },
  { name: 'Քիմմաքրում', pay: hy.payment.card, cash: false, price: 12000 },
];

/** Счётчик догоняет цель плавно: резкий скачок читается как ошибка вёрстки. */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const from = shown.current;
    if (target === from) return;

    const start = performance.now();
    const DURATION = 650;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
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

export function HeroDemo() {
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setTyped(PLATE);
      setShown(RECORDS.length);
      return;
    }

    const after = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    after(500, () => {
      setTyping(true);
      PLATE.split('').forEach((_, i) => {
        after(90 * i, () => setTyped(PLATE.slice(0, i + 1)));
      });
    });

    const typedAt = 500 + 90 * PLATE.length;
    after(typedAt + 400, () => setTyping(false));

    RECORDS.forEach((_, i) => {
      after(typedAt + 600 + i * 1100, () => setShown(i + 1));
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const visible = RECORDS.slice(0, shown);
  const revenue = visible.reduce((sum, r) => sum + r.price, 0);
  const cash = visible.filter((r) => r.cash).reduce((sum, r) => sum + r.price, 0);

  const earnedShown = useCountUp(staffShare(revenue, PERCENT));
  const revenueShown = useCountUp(revenue);

  const avg = shown === 0 ? 0 : Math.round(revenue / shown);
  const cashPercent = revenue === 0 ? 0 : Math.round((cash / revenue) * 100);

  return (
    <div className={s.demo}>
      {/* Экран мойщика — впереди: запись начинается здесь. */}
      <div className={s.phoneWrap}>
        <div className={s.phone} aria-hidden="true">
          <div className={s.phoneBar}>
            <span style={{ fontSize: 17 }}>🚿</span>
            <div>
              <b>Ավտոլվացում</b>
              <br />
              <span>{STAFF}</span>
            </div>
          </div>

          <div className={s.shift}>
            <div className={s.shiftLabel}>{hy.work.shiftTitle}</div>
            <div className={s.shiftValue}>{formatMoney(earnedShown)}</div>
            <div className={s.shiftMeta}>
              {shown} մեքենա · {formatMoney(revenue)} · {hy.work.yourShare} {PERCENT}%
            </div>
          </div>

          <div className={s.plateRow}>
            <div className={s.plateLabel}>Պետհամարանիշ</div>
            <div className={s.plate}>
              <span className={s.plateFlag}>AM</span>
              <span>{typed}</span>
              {typing && <i className={s.caret} />}
            </div>
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

      {/* Экран владельца — позади: та же запись, но его вопросами. */}
      <div className={s.ownerWrap}>
        <div className={s.owner} aria-hidden="true">
          <div className={s.ownerBar}>
            <b>Ավտոլվացում</b>
            <span>{hy.owner.periodToday}</span>
          </div>

          <div className={s.ownerLabel}>{hy.owner.revenue}</div>
          <div className={s.ownerValue}>{formatMoney(revenueShown)}</div>
          <div className={s.ownerMeta}>
            {shown} մեքենա · {hy.owner.avgCheck} {formatMoney(avg)}
          </div>

          {/* Доля наличных — вопрос, с которого начинается весь продукт. */}
          <div className={s.split}>
            <i style={{ width: `${cashPercent}%`, background: 'var(--color-good)' }} />
            <i
              style={{
                width: `${100 - cashPercent}%`,
                background: 'var(--color-accent-strong)',
              }}
            />
          </div>
          <div className={s.splitLegend}>
            <span>
              <i style={{ background: 'var(--color-good)' }} />
              {hy.payment.cash} {formatMoney(cash)}
            </span>
            <span>
              <i style={{ background: 'var(--color-accent-strong)' }} />
              {hy.payment.card} {formatMoney(revenue - cash)}
            </span>
          </div>

          <div className={s.ownerLabel}>{hy.owner.onShift}</div>
          <div className={s.staffRow}>
            <span className={s.avatar}>{STAFF.slice(0, 1)}</span>
            <div className={s.staffWho}>
              <div className={s.staffName}>{STAFF}</div>
              <div className={s.staffMeta}>
                {shown} մեքենա · {formatMoney(revenue)}
              </div>
            </div>
            <div className={s.staffSum}>
              {hy.owner.earned} {formatMoney(earnedShown)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
