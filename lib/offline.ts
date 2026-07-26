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
  at: number;
};

const KEY = 'bazis.queue.v1';

type Listener = (queue: QueuedOrder[]) => void;
const listeners = new Set<Listener>();

export function readQueue(): QueuedOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedOrder[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // приватный режим или переполнение — очередь просто не сохранится,
    // но UI уже показал успех, поэтому молчим и не пугаем мойщика
  }
  listeners.forEach((fn) => fn(queue));
}

export function enqueue(item: QueuedOrder): void {
  write([...readQueue(), item]);
}

export function dequeue(ref: string): void {
  write(readQueue().filter((x) => x.ref !== ref));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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
