'use client';

import { useSyncExternalStore } from 'react';

/**
 * Свернуть боковую колонку.
 *
 * Выбор переживает перезагрузку, и это не удобство, а обязательное
 * условие: колонка, разворачивающаяся сама при каждом переходе,
 * бесполезна — свернуть её пришлось бы заново на каждой странице.
 *
 * Само состояние живёт классом на `<html>`, а не в React. Причина в
 * порядке: разметку собирает сервер, он про выбор человека не знает, и
 * любое состояние в React применилось бы только после гидратации — то
 * есть колонка на долю секунды развернулась бы и схлопнулась на глазах.
 * Класс ставит короткий скрипт до первой отрисовки (см. `RailBoot`), а
 * дальше ширину держит CSS.
 *
 * Кнопка при этом остаётся клиентской: ей нужно знать текущее
 * состояние, чтобы повернуть значок и сказать читалке экрана, что
 * произойдёт при нажатии.
 */

const KEY = 'tetr_rail';
const CLASS = 'rail-tight';

/** Ставит класс до отрисовки. Вызывается из `<head>` строкой. */
export const RAIL_BOOT = `try{if(localStorage.getItem('${KEY}')==='1')document.documentElement.classList.add('${CLASS}')}catch(e){}`;

/* Подписчики на смену состояния. Своё состояние React здесь не держит:
   правда живёт классом на документе, поставленным до отрисовки, и
   копия в компоненте немедленно начала бы с ней расходиться. */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isTight() {
  return document.documentElement.classList.contains(CLASS);
}

export function RailCollapse({ labelExpand, labelCollapse }: { labelExpand: string; labelCollapse: string }) {
  /* На сервере колонка развёрнута: он не знает выбора человека. Класс
     до первой отрисовки ставит загрузочный скрипт, поэтому мигания нет
     даже когда серверный ответ разошёлся с настоящим состоянием. */
  const tight = useSyncExternalStore(subscribe, isTight, () => false);

  function toggle() {
    const next = !tight;
    document.documentElement.classList.toggle(CLASS, next);
    listeners.forEach((fn) => fn());
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* приватный режим — тогда выбор живёт до перезагрузки */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rail-collapse"
      aria-label={tight ? labelExpand : labelCollapse}
      title={tight ? labelExpand : labelCollapse}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="12" height="10" rx="2" />
        <path d="M6.5 3v10" />
        {/* Стрелка показывает, что произойдёт, а не где мы сейчас:
            кнопка обещает действие. */}
        <path d={tight ? 'M9.4 6.6 10.8 8l-1.4 1.4' : 'M11.6 6.6 10.2 8l1.4 1.4'} />
      </svg>
    </button>
  );
}
