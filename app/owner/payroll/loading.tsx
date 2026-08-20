import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList, SkeletonText } from '@/components/loading';

/**
 * Что видно, пока едут зарплаты.
 *
 * Общий скелет кабинета здесь не годится: он рисует крупный прибор
 * слева и приборы справа, а на этой странице сверху плита с итогом, под
 * ней переключатель и блоки рабочих дней со строками людей. Скелет,
 * который показывает не ту разметку, читается как «страница загрузилась
 * неправильно», и вздрагивание при подстановке настоящего содержимого
 * заметно сильнее, чем его отсутствие.
 *
 * Строк ровно столько, сколько бывает в дне на маленькой мойке: два-три
 * человека. Пустых мест больше, чем данных, не рисуем — иначе после
 * загрузки страница схлопывается.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <SkeletonCard className="h-[136px]" />
          <SkeletonCard className="h-[136px]" />
        </div>

        <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
          <SkeletonText className="h-8 w-[220px] !rounded-[8px]" />
          <Day rows={2} />
          <Day rows={3} />
        </div>
      </div>
    </AfterDelay>
  );
}

/** Место рабочего дня: шапка с суммой и строки людей под ней. */
function Day({ rows }: { rows: number }) {
  return (
    <div
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
      aria-hidden
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <SkeletonText className="h-4 w-32" />
          <SkeletonText className="h-3 w-24" />
        </div>
        <div className="grid justify-items-end gap-2">
          <SkeletonText className="h-5 w-24" />
          <SkeletonText className="h-3 w-16" />
        </div>
      </div>

      <SkeletonList rows={rows} />
    </div>
  );
}
