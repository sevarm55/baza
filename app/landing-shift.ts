'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DEMO,
  DEMO_RATE,
  type DemoEvent,
  type DemoOrder,
  type DemoPoint,
} from './landing-demo';

/**
 * Смена витрины — одна на две композиции.
 *
 * Витрина показывает один и тот же рабочий день двумя разными способами:
 * на компьютере это неподвижная панель, которая перестраивается под
 * читаемый текст (`landing-workspace.tsx`), на телефоне — лента, по
 * которой продукт листают сверху вниз (`landing-mobile.tsx`). Геометрия
 * у них разная намеренно, а арифметика обязана быть одна.
 *
 * Поэтому счёт живёт здесь, а не в каждой композиции по копии. Копия
 * рано или поздно расходится: поправили ставку на телефоне, забыли на
 * компьютере — и продукт, который продаёт точность в деньгах, показывает
 * два разных ответа на один вопрос.
 *
 * Состояние у композиций своё: на экране всегда видна ровно одна, и
 * общее состояние здесь ничего не решало бы, зато заставило бы обе
 * следить, чья сейчас очередь двигать день.
 *
 * Ни одно число не записано готовым. Всё складывается из смены: люди
 * приносят выручку, из неё по ставке начисляется доля, расходы
 * вычитаются. Так его и сложит глазами тот, кто решит проверить.
 */

export type DemoCost = { category: number; amount: number };

export function useShift() {
  /** Машина, которую записывают на глазах: 35 AA 777. */
  const [registered, setRegistered] = useState(false);
  /** Машины, которые вписал сам посетитель. */
  const [extra, setExtra] = useState<DemoOrder[]>([]);
  /** Вода за август — расход, который вписывают на глазах. */
  const [waterLogged, setWaterLogged] = useState(false);
  /** Расходы, которые вписал сам посетитель. */
  const [extraCosts, setExtraCosts] = useState<DemoCost[]>([]);

  /** Записи, которых в базовой смене ещё не было, — по порядку времени. */
  const added = useMemo<DemoOrder[]>(
    () => [...(registered ? [DEMO.fresh] : []), ...extra],
    [extra, registered],
  );

  const crew = useMemo(
    () =>
      DEMO.crew.map((person, i) => {
        const mine = added.filter((o) => o.staff === i);
        const revenue = person.revenue + mine.reduce((n, o) => n + o.price, 0);
        return {
          ...person,
          revenue,
          count: person.count + mine.length,
          /* Заработок не хранится, а считается: рядом на экране стоят и
             выручка, и ставка, и сумма — они обязаны сходиться. */
          earned: Math.round((revenue * DEMO_RATE) / 100),
        };
      }),
    [added],
  );

  /** Расходы, приехавшие на самой витрине: вода и то, что вписали руками. */
  const freshSpend = useMemo<DemoCost[]>(
    () => [...(waterLogged ? [DEMO.freshCost] : []), ...extraCosts],
    [waterLogged, extraCosts],
  );

  const spend = useMemo<DemoCost[]>(() => [...DEMO.spend, ...freshSpend], [freshSpend]);

  const today = useMemo(() => {
    const count = crew.reduce((n, c) => n + c.count, 0);
    const revenue = crew.reduce((n, c) => n + c.revenue, 0);
    const payroll = crew.reduce((n, c) => n + c.earned, 0);
    const costs = spend.reduce((n, c) => n + c.amount, 0);
    return { count, revenue, payroll, costs, net: revenue - payroll - costs };
  }, [crew, spend]);

  /* Сколько оставалось ДО того, как расход вписали на глазах.
     Это не второе число смены, а то же самое минус приехавшее: телефон
     показывает переход между двумя настоящими состояниями, а не
     красивую пару цифр (см. landing-demo.ts). */
  const netBefore = useMemo(
    () => today.net + freshSpend.reduce((n, c) => n + c.amount, 0),
    [today.net, freshSpend],
  );

  /** Список последних машин: свежая сверху. */
  const orders = useMemo<DemoOrder[]>(() => [...added].reverse().concat(DEMO.orders), [added]);

  /** Лента смены. Записанное на глазах приходит в неё же. */
  const feed = useMemo<DemoEvent[]>(
    () => [
      ...[...added].reverse().map((o) => ({
        time: o.time,
        staff: o.staff,
        kind: 'added' as const,
        plate: o.plate,
      })),
      ...DEMO.feed,
    ],
    [added],
  );

  /** Часы дня. Записанное попадает в свой час, иначе график соврёт. */
  const hours = useMemo<DemoPoint[]>(() => {
    const list = DEMO.hours.map((p) => ({ ...p }));
    for (const o of added) {
      const hour = o.plate === DEMO.fresh.plate && o.time === DEMO.fresh.time ? '14' : null;
      const cell = list.find((p) => p.label === hour) ?? list[list.length - 1];
      cell.revenue += o.price;
      cell.count += 1;
    }
    return list;
  }, [added]);

  const addUnit = useCallback((order: DemoOrder) => setExtra((was) => [...was, order]), []);
  const addCost = useCallback((cost: DemoCost) => setExtraCosts((was) => [...was, cost]), []);

  return {
    registered,
    setRegistered,
    waterLogged,
    setWaterLogged,
    extra,
    addUnit,
    addCost,
    crew,
    spend,
    freshSpend,
    today,
    netBefore,
    orders,
    feed,
    hours,
  };
}

/** «14:32» → «14:35» → «14:38». Смена, а не часы того, кто смотрит. */
export function shiftTime(index: number): string {
  const base = 14 * 60 + 32 + (index + 1) * 3;
  const h = Math.floor(base / 60) % 24;
  const m = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
