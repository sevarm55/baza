/**
 * Что видно, пока раздел едет с сервера.
 *
 * Страницы кабинета динамические: заранее их не отдать, и между нажатием
 * на раздел и первой цифрой проходит доля секунды, в которую до сих пор
 * не было ничего — экран просто замирал. Подсветка на вкладке говорила
 * «нажатие принято», но не говорила, что грузится.
 *
 * Здесь скелет повторяет разметку раздела: заголовок, крупный прибор
 * слева, приборы справа, список ниже. Не крутящийся кружок: кружок
 * сообщает «ждите», а скелет — «вот что сейчас появится», и переход
 * читается как продолжение, а не как пауза.
 *
 * Форма общая для всех разделов сознательно: точная копия каждого
 * экрана рассыпалась бы при первой же правке страницы, а расхождение
 * скелета с содержимым заметнее, чем его приблизительность.
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

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <Block className="h-[280px] lg:col-span-8" />

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Block className="h-[104px]" />
          <div className="grid grid-cols-2 gap-[var(--seam)]">
            <Block className="h-[92px]" />
            <Block className="h-[92px]" />
          </div>
        </div>

        <Block className="h-[260px] lg:col-span-8" />
        <Block className="h-[180px] lg:col-span-4" />
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
