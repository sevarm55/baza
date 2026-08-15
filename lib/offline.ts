'use client';

import type { Payment } from './orders';

/**
 * Очередь записей, сделанных без связи.
 *
 * Мойка часто в подвале или за городом. «Не сохранилось, потому что не было
 * интернета» убьёт доверие быстрее любого бага, поэтому запись всегда
 * ложится в localStorage, а отправка — отдельная забота.
 *
 * У каждой записи свой ref: досылка может уйти дважды, и сервер по нему
 * поймёт, что это та же самая машина, а не вторая.
 */

export type QueuedOrder = {
  ref: string;
  clientKey: string;
  serviceId: string;
  serviceName: string;
  price: number;
  payment: Payment;
  passId?: string;
  /* Класс машины — словом, а не номером. Запись может пролежать в
     очереди до вечера, и за это время владелец успевает переставить
     классы местами: номер указал бы на соседний и на его цену. */
  tier?: string;
  at: number;
};

const KEY = 'bazis.queue.v1';

type Listener = () => void;
const listeners = new Set<Listener>();

export function readQueue(): QueuedOrder[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOrder[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/* Очередь — внешнее хранилище, и React читает её как внешнее:
   `useSyncExternalStore` вместо «прочитать в эффекте и положить в
   состояние». Разница не в стиле — при чтении в эффекте первая отрисовка
   всегда показывает пустую очередь, и накопленные без связи записи
   мигают через пустоту при каждом заходе на страницу.
   Требование у этого API одно: один и тот же снимок между изменениями.
   `readQueue` каждый раз разбирает JSON заново и отдаёт новый массив —
   React счёл бы это бесконечным изменением. Поэтому снимок держим
   здесь и сбрасываем ровно тогда, когда очередь действительно меняется. */
const EMPTY: QueuedOrder[] = [];
let snapshot: QueuedOrder[] | null = null;

export function queueSnapshot(): QueuedOrder[] {
  if (snapshot === null) snapshot = readQueue();
  return snapshot;
}

/** На сервере очереди нет: она живёт в localStorage телефона. */
export function serverSnapshot(): QueuedOrder[] {
  return EMPTY;
}

function write(queue: QueuedOrder[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // приватный режим или переполнение — очередь просто не сохранится,
    // но UI уже показал успех, поэтому молчим и не пугаем мойщика
  }
  snapshot = queue;
  listeners.forEach((fn) => fn());
}

export function enqueue(item: QueuedOrder): void {
  write([...readQueue(), item]);
}

export function dequeue(ref: string): void {
  write(readQueue().filter((x) => x.ref !== ref));
}

/* Подписчику снимок не передаём: `useSyncExternalStore` сам спросит его
   через `queueSnapshot`, а лишний аргумент заставил бы вызывающего
   держать два источника одной и той же очереди. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function newRef(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Отправить всё, что накопилось. Возвращает, сколько удалось передать. */
export async function flushQueue(
  send: (item: QueuedOrder) => Promise<void>,
): Promise<number> {
  let sent = 0;
  for (const item of readQueue()) {
    try {
      await send(item);
      dequeue(item.ref);
      sent++;
    } catch {
      // связь снова пропала — остальное подождёт следующей попытки
      break;
    }
  }
  return sent;
}
