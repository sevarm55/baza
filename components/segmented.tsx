'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { SwitchMark } from '@/components/switch-mark';
import { usePendingTab } from '@/components/use-pending-tab';

/**
 * Жёлоб с переезжающей плашкой — единственный переключатель продукта.
 *
 * Приём был придуман для периода на сводке и повторён руками ещё в пяти
 * местах: месяцы расходов, вкладки зарплат, порядок клиентов, месяцы
 * отчёта. Разметка везде была почти одинаковой — «почти» и есть беда:
 * у одного жёлоба радиус 8, у другого 14, у третьего плашка не
 * переезжает, а перескакивает. Переключатель, который в каждом разделе
 * ведёт себя чуть иначе, каждый раз приходится читать заново.
 *
 * Два способа выбрать одно и то же, и разница между ними не в стиле:
 *
 *   `href`      — выбор живёт в адресе: период, месяц, раздел. Такую
 *                 вкладку можно послать ссылкой и открыть в новой
 *                 вкладке браузера, и она подсвечивается сразу, не
 *                 дожидаясь сервера (см. `usePendingTab`).
 *   `onSelect`  — выбор живёт в состоянии страницы: фильтр списка,
 *                 метрика графика. Адрес при этом не трогается: строка
 *                 поиска и позиция прокрутки остаются на месте.
 *
 * Углы 8 снаружи и 6 внутри, а не одинаковые: скругление плашки должно
 * быть меньше внешнего ровно на толщину жёлоба, иначе между двумя
 * дугами остаётся серп фона — самая заметная небрежность в любом
 * переключателе.
 */

export type Segment = {
  key: string;
  label: ReactNode;
  /** переход, а не состояние: вкладка живёт в адресе */
  href?: string;
  /** тихое число рядом с подписью: сколько строк за этой вкладкой */
  count?: number;
};

export function Segmented({
  id,
  items,
  current,
  onSelect,
  full = false,
  scroll = false,
  label,
}: {
  /** свой у каждой группы: одинаковый начнёт перебрасывать плашку между ними */
  id: string;
  items: Segment[];
  current: string;
  /** пусто у вкладок-ссылок: там выбор делает переход */
  onSelect?: (key: string) => void;
  /** во всю ширину на телефоне: три кнопки делят её поровну */
  full?: boolean;
  /** длинный набор уезжает вбок, а не переносится абзацем */
  scroll?: boolean;
  label?: string;
}) {
  /* Догадка нужна только ссылкам: у кнопки состояние меняется в тот же
     кадр, и подсвечивать «нажатую, но ещё не открытую» нечего. */
  const { active, pending, select } = usePendingTab(current);
  const links = items.some((x) => x.href);
  const shown = links ? active : current;

  return (
    /* Группа нажатых кнопок, а не `tablist`.

       Роль вкладки обещает читалке экрана панель, к которой вкладка
       ведёт, — `aria-controls` с идентификатором. Ни у одного из этих
       переключателей такой панели нет: одни меняют отбор списка на
       месте, другие вовсе ссылки. Вкладка без своей панели озвучивается
       как сломанная разметка, а «нажата / не нажата» — ровно то, что
       здесь и происходит. */
    <div
      className={`seg${full ? ' seg-full' : ''}${scroll ? ' scroll-x' : ''}`}
      role="group"
      aria-label={label}
    >
      {items.map((x) => {
        const on = shown === x.key;
        const body = (
          <span className="seg-body">
            {x.label}
            {x.count !== undefined && <b className="seg-count num">{x.count}</b>}
          </span>
        );

        return x.href ? (
          <Link
            key={x.key}
            href={x.href}
            onClick={() => select(x.key)}
            aria-current={on ? 'page' : undefined}
            data-pending={pending && on ? '' : undefined}
            className="seg-item"
            data-on={on ? '' : undefined}
          >
            {on && <SwitchMark id={id} radius={6} />}
            {body}
          </Link>
        ) : (
          <button
            key={x.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(x.key)}
            className="seg-item"
            data-on={on ? '' : undefined}
          >
            {on && <SwitchMark id={id} radius={6} />}
            {body}
          </button>
        );
      })}
    </div>
  );
}
