'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import s from './landing.module.css';

/**
 * Экран мойщика, оживающий один раз при загрузке.
 *
 * Это не мокап: та же вёрстка, те же цифры, что в продукте. Смысл
 * первого экрана — показать механизм, на котором всё держится:
 * счётчик заработка растёт на глазах, поэтому мойщик вбивает сам.
 *
 * Одна оркестрованная сцена, дальше покой. Разбросанные по странице
 * эффекты выглядят суетой, а не характером.
 */

const PLATE = '12 AB 345';
const PERCENT = 40;

const RECORDS = [
  { name: 'Կոմպլեքս', pay: hy.payment.cash, price: 5000 },
  { name: 'Քիմմաքրում', pay: hy.payment.card, price: 12000 },
];

const TOTAL = RECORDS.reduce((sum, r) => sum + r.price, 0);

export function HeroDemo() {
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(0);
  const [earned, setEarned] = useState(0);
  const [typing, setTyping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setTyped(PLATE);
      setShown(RECORDS.length);
      setEarned(staffShare(TOTAL, PERCENT));
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

  // счётчик догоняет цель плавно — резкий скачок читается как ошибка вёрстки
  useEffect(() => {
    const target = staffShare(
      RECORDS.slice(0, shown).reduce((sum, r) => sum + r.price, 0),
      PERCENT,
    );
    let raf = 0;
    const from = earned;
    const start = performance.now();
    const DURATION = 650;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - (1 - t) ** 3;
      setEarned(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    if (target !== from) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // намеренно только от shown: earned здесь — стартовая точка, не зависимость
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const visible = RECORDS.slice(0, shown);
  const revenue = visible.reduce((sum, r) => sum + r.price, 0);

  return (
    <div className={s.phoneWrap}>
      <div className={s.phone} aria-hidden="true">
        <div className={s.phoneBar}>
          <span style={{ fontSize: 17 }}>🚿</span>
          <div>
            <b>Ավտոլվացում</b>
            <br />
            <span>Աշոտ</span>
          </div>
        </div>

        <div className={s.shift}>
          <div className={s.shiftLabel}>{hy.work.shiftTitle}</div>
          <div className={s.shiftValue}>{formatMoney(earned)}</div>
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
  );
}
