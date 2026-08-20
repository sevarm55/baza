'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTransition } from 'react';

import { SUCCESS_HOLD } from '@/lib/motion';

export type AsyncStatus = 'idle' | 'running' | 'done' | 'failed';

/**
 * Одно действие, один запрос.
 *
 * Три вещи, которые в кабинете до сих пор писались руками в каждой форме
 * и в половине из них не писались вовсе:
 *
 * 1. Засов. `disabled={pending}` от `useTransition` от второго нажатия не
 *    спасает: между двумя касаниями мокрого экрана перерисовки может не
 *    быть, и оба касания войдут в обработчик до того, как кнопка
 *    погаснет. Ref меняется в ту же миллисекунду, что и первое касание, —
 *    ровно так это уже сделано в форме записи машины, и оттуда правило
 *    переехало сюда.
 *
 * 2. Ответ. После успеха кнопка коротко показывает, что получилось, и
 *    возвращается в покой сама. Отдельного окна «Сохранено» нет: окно
 *    требует закрыть себя, то есть просит ещё одно нажатие за то, что всё
 *    и так хорошо.
 *
 * 3. Ошибка. Текст ошибки остаётся рядом с кнопкой, а не заменяет собой
 *    экран, и набранное в форме никуда не девается.
 *
 * Признак `running` не равен `disabled`. Погашенная кнопка говорит
 * «сейчас нельзя», занятая — «принято, идёт». Это разные сообщения, и
 * выглядеть они обязаны по-разному.
 */
export function useAsyncAction<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  opts: {
    /** во что превратить пойманное исключение; по умолчанию его текст */
    message?: (e: unknown) => string;
    /** позвать после удачи: закрыть лист, сбросить поля */
    onDone?: () => void;
    /** сколько держать отметку «получилось» */
    hold?: number;
  } = {},
) {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lock = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Свежие ссылки на колбэки: обработчик создаётся один раз, а `onDone`
     форма пересоздаёт на каждой отрисовке. */
  const ref = useRef({ fn, opts });
  useEffect(() => {
    ref.current = { fn, opts };
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setStatus('idle');
  }, []);

  const run = useCallback((...args: A) => {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setStatus('running');

    startTransition(async () => {
      const { fn: call, opts: o } = ref.current;
      try {
        await call(...args);
        /* Ушли с экрана, пока летел ответ. Ничего не показываем: состояние
           принадлежит компоненту, которого больше нет. */
        if (!alive.current) return;
        setStatus('done');
        o.onDone?.();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (alive.current) setStatus('idle');
        }, o.hold ?? SUCCESS_HOLD);
      } catch (e) {
        if (!alive.current) return;
        setStatus('failed');
        setError(o.message ? o.message(e) : errorText(e));
      } finally {
        lock.current = false;
      }
    });
  }, []);

  return {
    run,
    /* Занятость держится до конца перехода: сервер уже ответил, но
       страница ещё перерисовывается новыми данными, и отпустить кнопку
       раньше значит показать старые числа под словом «Готово». */
    running: status === 'running' || pending,
    done: status === 'done' && !pending,
    failed: status === 'failed',
    status,
    error,
    setError,
    reset,
  };
}

function errorText(e: unknown) {
  if (e instanceof Error && e.message) return e.message;
  return '';
}
