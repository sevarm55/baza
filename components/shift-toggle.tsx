import { toggleShiftAction } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Переключатель смены в вебе.
 *
 * Формой, а не клиентским компонентом с состоянием: смена — это одно
 * действие в час, а не то, что крутят пальцем. Серверное действие само
 * перерисует страницу, и промежуточное состояние показывать нечего.
 *
 * Два состояния — две громкости, и это не оформление.
 *
 * Пока смена не начата, начать её — единственное, что человек может
 * сделать на этом экране: записывать машины нельзя, и всё остальное
 * ждёт. Поэтому вне смены это большая лаймовая кнопка во всю ширину, с
 * объяснением под ней — тем самым, которое раньше висело в стороне и
 * относилось к погашенной кнопке записи.
 *
 * На смене всё наоборот: главное — записать машину, а закрыть смену
 * жмут один раз за день. Тогда это тихая строка внизу.
 */
export function ShiftToggle({ open, className = '' }: { open: boolean; className?: string }) {
  if (open) {
    return (
      <form action={toggleShiftAction} className={className}>
        <input type="hidden" name="open" value="false" />
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] px-3 py-2.5 text-[13.5px] font-semibold transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--board-ink) 6%, transparent)',
            color: 'var(--board-muted)',
          }}
        >
          {hy.work.endShift}
        </button>
      </form>
    );
  }

  return (
    <form action={toggleShiftAction} className={className}>
      <input type="hidden" name="open" value="true" />
      <button className="btn btn-big">{hy.work.startShift}</button>
      {/* Вне смены записывать нельзя: машина, записанная мимо смены, не
          попадает в сдачу наличных при закрытии. То же правило в
          приложении и на сервере. Объяснение стоит под кнопкой, которая
          это правило снимает, а не под той, которую оно гасит. */}
      <p className="note mt-2.5">{hy.work.needShift}</p>
    </form>
  );
}
