'use client';

import { useState } from 'react';

/**
 * Цифры, которые перекатываются при смене значения.
 *
 * Тот же приём, что в приложении: `.contentTransition(.numericText(value:))`
 * на показании и на плитках. Разряд, который изменился, уезжает и на его
 * место приходит новый — снизу, если стало больше, сверху, если меньше.
 * Направление здесь не украшение: оно и есть сообщение — по нему видно,
 * что число выросло, ещё до того, как его прочитали.
 *
 * Это НЕ счётчик. Число не крутится от нуля при появлении экрана —
 * такого в продукте нет и не будет: показание это факт, а не барабан
 * (DESIGN.md §11). Анимируется только переход между двумя настоящими
 * значениями: сменили период, пришла новая запись, изменилась смена.
 *
 * Меняются обычно последние разряды, поэтому строки сравниваются с
 * конца: у «9 500» и «12 000» разная длина, и посимвольное сравнение
 * слева пометило бы изменившимся всё подряд.
 */
export function NumericText({
  children,
  className = '',
}: {
  /** уже отформатированная строка: «22 500 ֏», «4», «40 %» */
  children: string;
  className?: string;
}) {
  const [prev, setPrev] = useState(children);

  /* Состояние выводится прямо в рендере, а не эффектом: эффект успел бы
     показать кадр с новым числом без анимации. Тот же приём, что у
     подсветки вкладок в `use-pending-tab`. */
  const [shown, setShown] = useState(children);
  if (shown !== children) {
    setPrev(shown);
    setShown(children);
  }

  const changed = prev !== children;
  const up = numberIn(children) >= numberIn(prev);

  if (!changed) return <span className={className}>{children}</span>;

  const chars = [...children];
  const before = [...prev];
  // сколько знаков с конца совпало — их не трогаем
  let same = 0;
  while (
    same < chars.length &&
    same < before.length &&
    chars[chars.length - 1 - same] === before[before.length - 1 - same]
  ) {
    same++;
  }
  const lastChanged = chars.length - same;

  return (
    <span className={className}>
      {chars.map((ch, i) =>
        i < lastChanged ? (
          <span
            // ключ с самим знаком: React пересоздаёт узел, и анимация
            // запускается заново на каждой смене
            key={`${i}-${ch}-${children.length}`}
            className={up ? 'tick tick-up' : 'tick tick-down'}
            style={{ animationDelay: `${Math.min(i, 6) * 18}ms` }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ) : (
          <span key={`keep-${i}`}>{ch === ' ' ? ' ' : ch}</span>
        ),
      )}
    </span>
  );
}

/** Число из строки: «22 500 ֏» → 22500. Нужно только ради направления. */
function numberIn(s: string): number {
  const digits = s.replace(/[^\d]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? (s.trim().startsWith('−') || s.trim().startsWith('-') ? -n : n) : 0;
}
