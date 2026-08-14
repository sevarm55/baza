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
    <div aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div className="grid gap-2">
          <Bar className="h-6 w-44" />
          <Bar className="h-3.5 w-56" />
        </div>
      </div>

      <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Block className="h-[136px]" />
        <Block className="h-[136px]" />
      </div>

      <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
        <Bar className="h-8 w-[220px] !rounded-[8px]" />
        <Day rows={2} />
        <Day rows={3} />
      </div>
    </div>
  );
}

/** Место рабочего дня: шапка с суммой и строки людей под ней. */
function Day({ rows }: { rows: number }) {
  return (
    <div
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Bar className="h-4 w-32" />
          <Bar className="h-3 w-24" />
        </div>
        <div className="grid justify-items-end gap-2">
          <Bar className="h-5 w-24" />
          <Bar className="h-3 w-16" />
        </div>
      </div>

      <div className="grid gap-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="size-4 shrink-0" />
            <Bar className="h-3.5 w-28" />
            <Bar className="ms-auto h-3.5 w-20" />
            <Bar className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Block({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton rounded-[var(--radius-card)] ${className}`}
      style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    />
  );
}

function Bar({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton rounded-[4px] ${className}`}
      style={{ background: 'color-mix(in srgb, var(--board-ink) 8%, transparent)' }}
    />
  );
}
