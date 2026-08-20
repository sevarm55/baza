'use client';

import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { useDelayedFlag } from './use-delayed';
import { TetrinMiniLoader } from './tetrin-mini-loader';

/**
 * Кнопка, у которой «занято» и «нельзя» — разные состояния.
 *
 * До сих пор в кабинете было одно: `disabled={pending}`. Кнопка бледнела
 * одинаково и когда форма недозаполнена, и когда запрос уже летит, а
 * подпись подменялась на «Загрузка…» — из-за чего кнопка меняла ширину
 * прямо под пальцем и соседняя кнопка уезжала на другую строку.
 *
 * Здесь три подписи лежат стопкой в одной ячейке сетки. Ширина кнопки
 * равна самой длинной из них и не меняется никогда; переход между
 * подписями — прозрачность и два пикселя по вертикали.
 *
 * Засов стоит до перерисовки. `pending` от React меняется в следующем
 * кадре, а между двумя касаниями мокрого экрана кадра может не быть, и
 * оба касания уйдут на сервер. Поэтому обработчик проверяет признак
 * занятости сам и гасит событие, не дожидаясь, пока кнопка изменится.
 *
 * Атрибут `disabled` не ставится ни в одном из состояний: браузер
 * выкидывает выключенную кнопку из порядка обхода, и человек, который
 * дошёл до неё с клавиатуры, теряет место на странице ровно в тот
 * момент, когда нажал. Вместо него `aria-disabled` и та же проверка в
 * обработчике.
 */
export function LoadingButton({
  busy = false,
  done = false,
  disabled = false,
  label,
  busyLabel,
  doneLabel,
  icon,
  className = 'btn',
  onClick,
  type = 'submit',
  ...rest
}: {
  /** запрос летит */
  busy?: boolean;
  /** только что получилось */
  done?: boolean;
  /** действие недоступно: не хватает данных, нет прав, нечего сохранять */
  disabled?: boolean;
  label: ReactNode;
  /** «Сохраняем…»; пусто — остаётся обычная подпись и один индикатор */
  busyLabel?: ReactNode;
  /** «Сохранено»; пусто — отметки об успехе у кнопки нет */
  doneLabel?: ReactNode;
  /** значок перед обычной подписью */
  icon?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'type'> & {
    type?: 'button' | 'submit' | 'reset';
  }) {
  /* Заливка темнеет и засов встаёт сразу, а подпись меняется чуть
     позже. Ответ на девяносто миллисекунд не должен успевать мигнуть
     словом «Сохраняем…»: вспышка чужой подписи читается как сбой. Но и
     ждать девяносто миллисекунд, прежде чем ответить на палец, нельзя —
     поэтому цвет отвечает мгновенно, а слово догоняет. */
  const showBusyFace = useDelayedFlag(busy, 90);
  /* Отметка об успехе только там, где для неё есть подпись: иначе
     кнопка ушла бы в состояние, у которого нет ни одного видимого
     лица, и на полторы секунды стала бы пустой. */
  const canShowDone = doneLabel !== undefined;
  const face = busy && showBusyFace ? 'busy' : done && !busy && canShowDone ? 'done' : 'idle';

  return (
    <button
      {...rest}
      type={type}
      className={className}
      data-busy={busy ? 'true' : undefined}
      aria-busy={busy || undefined}
      aria-disabled={disabled || busy || undefined}
      onClick={(e) => {
        if (busy || disabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      }}
    >
      <span className="btn-stack">
        <Face on={face === 'idle'}>
          {icon}
          {label}
        </Face>

        <Face on={face === 'busy'}>
          <TetrinMiniLoader />
          <span className="btn-face-label">{busyLabel ?? label}</span>
        </Face>

        {doneLabel !== undefined && (
          <Face on={face === 'done'}>
            <span className="btn-done">
              <Check className="size-[1em]" aria-hidden />
            </span>
            {doneLabel}
          </Face>
        )}
      </span>
    </button>
  );
}

/**
 * Одна подпись в стопке.
 *
 * Спрятанные подписи скрыты от чтеца экрана: иначе кнопка «Сохранить»
 * читалась бы как «Сохранить Сохраняем Сохранено» — три слова подряд об
 * одном действии, из которых верно ровно одно.
 */
function Face({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="btn-face" data-on={String(on)} aria-hidden={on ? undefined : true}>
      {children}
    </span>
  );
}
