import { toggleShiftAction } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Переключатель смены в вебе.
 *
 * Формой, а не клиентским компонентом с состоянием: смена — это одно
 * действие в час, а не то, что крутят пальцем. Серверное действие само
 * перерисует страницу, и промежуточное состояние показывать нечего.
 */
export function ShiftToggle({ open }: { open: boolean }) {
  return (
    <form action={toggleShiftAction} className="mb-3.5">
      <input type="hidden" name="open" value={open ? 'false' : 'true'} />
      <div className="card flex items-center gap-3">
        {/* Точка того же цвета, что зелёная у владельца: он видит её в
            списке «на смене», и это должен быть один и тот же сигнал. */}
        <span
          className={`size-2.5 shrink-0 rounded-full ${open ? 'bg-good' : 'bg-faint'}`}
          aria-hidden
        />
        <span className="flex-1 text-[15px] font-semibold">
          {open ? hy.work.onShift : hy.work.offShift}
        </span>
        <button className={open ? 'btn-inline' : 'btn-inline btn-inline-primary'}>
          {open ? hy.work.endShift : hy.work.startShift}
        </button>
      </div>
    </form>
  );
}
