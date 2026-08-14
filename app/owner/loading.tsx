/**
 * Что видно, пока сводка едет с сервера.
 *
 * Страницы кабинета динамические: заранее их не отдать, и между нажатием
 * на раздел и первой цифрой проходит доля секунды, в которую до сих пор
 * не было ничего — экран просто замирал. Подсветка на вкладке говорила
 * «нажатие принято», но не говорила, что грузится.
 *
 * Скелет повторяет разметку сводки: плита итога и слагаемые, строка
 * фактов, график во всю рабочую ширину, три прибора справа и лента
 * ниже. Не крутящийся кружок: кружок сообщает «ждите», а скелет — «вот
 * что сейчас появится», и переход читается как продолжение, а не как
 * пауза.
 *
 * Форма повторяет именно эту страницу, а не «страницу кабинета вообще».
 * Общий скелет рисовал крупный прибор слева и мелочь справа, и после
 * загрузки разметка на глазах перекладывалась заново — это заметнее,
 * чем отсутствие скелета.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div className="grid gap-2">
          <Bar className="h-6 w-40" />
          <Bar className="h-3.5 w-24" />
        </div>
        <Bar className="h-9 w-[240px] !rounded-[8px]" />
      </div>

      <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Block className="h-[136px]" />
        <Block className="h-[136px]" />
      </div>

      <Bar className="mt-3.5 h-3.5 w-64" />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <Block className="h-[300px] lg:col-span-8 lg:h-[420px]" />
        <Block className="h-[180px] lg:col-span-4 lg:h-[420px]" />

        <Block className="h-[180px] lg:col-span-6" />
        <Block className="h-[180px] lg:col-span-6" />

        <Block className="h-[300px] lg:col-span-12" />
      </div>
    </div>
  );
}

/** Место прибора: те же чернила полотна и тот же радиус, что у Panel. */
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
