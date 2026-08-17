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
  /** Одна услуга — форма записей, уже лежащих в очереди у людей. */
  serviceId: string;
  /**
   * Несколько услуг за один заезд: комплекс и химчистка салона.
   *
   * Необязательное: записи, накопленные до этой версии, лежат в
   * localStorage со старым полем, и терять их из-за формата нельзя.
   */
  serviceIds?: string[];
  serviceName: string;
  /** Сколько взяли — уже со скидкой, если она была. */
  price: number;
  /**
   * Цена по прайсу.
   *
   * Нужна, чтобы скидка не потерялась в очереди: запись может пролежать
   * до вечера, и отправить её потом по прайсу значило бы молча отменить
   * решение мойщика. Необязательная по той же причине, что `serviceIds`.
   */
  listPrice?: number;
  payment: Payment;
  passId?: string;
  /* Класс машины — словом, а не номером. Запись может пролежать в
     очереди до вечера, и за это время владелец успевает переставить
     классы местами: номер указал бы на соседний и на его цену. */
  tier?: string;
  at: number;
  /**
   * Код отказа сервера, если он был.
   *
   * Запись при этом ОСТАЁТСЯ. До появления этого поля любой отказ
   * останавливал всю очередь: `flushQueue` прерывался на первой ошибке и
   * пробовал ту же запись снова при каждом заходе на страницу. Одна
   * машина с удалённой услугой запирала за собой все остальные,
   * навсегда и молча.
   */
  failure?: string;
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

/** Записи, которые ещё ждут отправки. */
export function waiting(queue: QueuedOrder[]): QueuedOrder[] {
  return queue.filter((x) => !x.failure);
}

/**
 * Записи, которые сервер не принял.
 *
 * Показываются отдельно: это не «ещё не ушло», а «не уйдёт само». Решить,
 * повторить или выбросить, может только человек — сама очередь работу
 * мойщика не выкидывает.
 */
export function rejected(queue: QueuedOrder[]): QueuedOrder[] {
  return queue.filter((x) => x.failure);
}

/** Пометить отказ или снять пометку. */
function mark(ref: string, failure: string | undefined): void {
  write(readQueue().map((x) => (x.ref === ref ? { ...x, failure } : x)));
}

/** Повторить отвергнутую — например, после того как владелец вернул
 *  услугу в прайс. */
export function retry(ref: string): void {
  mark(ref, undefined);
}

/** Убрать отвергнутую совсем. Только по решению человека. */
export function drop(ref: string): void {
  dequeue(ref);
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

/**
 * Когда запись сделана.
 *
 * Живёт здесь, рядом с `newRef`, а не в форме. Причина в том же, в чём и
 * у ссылки: очередь владеет тем, как выглядит отложенная запись, и время
 * в ней — часть этой формы, а не украшение экрана. Отдельная польза
 * попутная: часы — вещь нечистая, и вызванные прямо в теле компонента
 * они заставляют компилятор React ругаться на отрисовку.
 */
export function stamp(): number {
  return Date.now();
}

export function newRef(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Отправить всё, что накопилось.
 *
 * Три разных исхода, и разница между ними — это разница между «подождём»
 * и «потеряли»:
 *
 *   ушло           — убираем из очереди, дело сделано;
 *   связи нет      — останавливаем весь проход: остальным идти некуда;
 *   сервер отказал — ПОМЕЧАЕМ и идём дальше.
 *
 * Последнее раньше было обрывом всего прохода, и это было ошибкой. Отказ
 * по существу — удалённая услуга, закрытая смена — не проходит и на
 * второй попытке, а очередь пробовала ту же запись при каждом заходе на
 * страницу и до остальных не доходила никогда. Одна машина запирала за
 * собой все, молча и навсегда.
 *
 * Выбрасывать её тоже нельзя: мойщик записал машину, страница сказала
 * «записано», и исчезнуть запись не имеет права. Пусть висит с пометкой,
 * а решает человек — то же правило, что в приложении (`OrderQueue`).
 */
export async function flushQueue(
  send: (item: QueuedOrder) => Promise<void>,
  /** Отличить обрыв связи от отказа по существу — знает вызывающий. */
  isOffline: () => boolean = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false,
): Promise<number> {
  let sent = 0;
  for (const item of waiting(readQueue())) {
    try {
      await send(item);
      dequeue(item.ref);
      sent++;
    } catch (e) {
      // связи нет — остальным идти некуда, ждём следующей попытки
      if (isOffline()) break;
      /* Сервер ответил отказом. Причину кладём как есть: человеку её
         показывают рядом с номером машины, и «не приняли» без причины не
         объясняет, что делать. */
      mark(item.ref, reasonOf(e));
    }
  }
  return sent;
}

/**
 * Чем объяснить отказ.
 *
 * Server Action бросает обычную ошибку, и текст её — единственное, что у
 * нас есть. Обрезаем: в сообщении может лежать стек, а строка стоит под
 * номером машины в одну линию.
 */
function reasonOf(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  const first = text.split('\n')[0].trim();
  return first.slice(0, 80) || 'FAILED';
}
