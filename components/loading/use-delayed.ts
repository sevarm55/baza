'use client';

import { useEffect, useRef, useState } from 'react';

import { LOADING_DELAY, LONG_WAIT } from '@/lib/motion';

/**
 * Признак загрузки, включающийся не сразу.
 *
 * Между нажатием и ответом чаще всего проходит меньше двух десятых
 * секунды. Если на это время подставить скелет, человек увидит вспышку
 * серого и решит, что страница моргнула, — хуже, чем если бы не было
 * ничего. Поэтому загрузка получает право показаться только тогда, когда
 * ждать действительно приходится.
 *
 * Обратный ход мгновенный: пришли данные — показываем данные. Придержать
 * готовый ответ ради красоты анимации значит соврать про скорость
 * продукта в единственном месте, где скорость видна.
 */
export function useDelayedFlag(active: boolean, delay = LOADING_DELAY) {
  const [shown, setShown] = useState(false);

  /* Сброс при отрисовке, а не в эффекте: состояние, поставленное из
     эффекта, заставляет React нарисовать кадр дважды — сначала со
     старым значением, потом с новым. Тот же приём, что в формах
     кабинета. */
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    if (!active) setShown(false);
  }

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(id);
  }, [active, delay]);

  return shown && active;
}

/**
 * Долго ли уже ждём.
 *
 * Нужен там, где операция может идти секундами: экспорт, закрытие смены,
 * восстановление сессии. По этому признаку экран добавляет строку о том,
 * чем занят, — но не процент: процента сервер не присылает, а
 * нарисованный процент врёт и его ловят.
 */
export function useLongWait(active: boolean, after = LONG_WAIT) {
  const [long, setLong] = useState(false);

  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    if (!active) setLong(false);
  }

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setLong(true), after);
    return () => clearTimeout(id);
  }, [active, after]);

  return long && active;
}

/**
 * Жив ли ещё компонент.
 *
 * Мойщик нажимает «записать» и тут же уходит на журнал; владелец меняет
 * период графика и уходит в другой раздел. Ответ приходит в разобранный
 * компонент, и `setState` на нём в лучшем случае ничего не делает, а в
 * худшем возвращает на экран данные, которых там уже никто не ждёт.
 */
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
