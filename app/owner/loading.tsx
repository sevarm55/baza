import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonText } from '@/components/loading';

/**
 * Что видно, пока сводка едет с сервера.
 *
 * Страницы кабинета динамические: заранее их не отдать, и между
 * нажатием на раздел и первой цифрой проходит доля секунды, в которую
 * до сих пор не было ничего — экран просто замирал. Подсветка на
 * вкладке говорила «нажатие принято», но не говорила, что грузится.
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
 * чем отсутствие скелета. По этой же причине у каждого раздела кабинета
 * теперь свой `loading.tsx`: раньше все они брали этот, сводочный, и
 * список услуг ждал под видом графика выручки.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead />

        <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <SkeletonCard className="h-[136px]" />
          <SkeletonCard className="h-[136px]" />
        </div>

        <SkeletonText className="mt-3.5 h-3.5 w-64" />

        <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
          <SkeletonCard className="h-[300px] lg:col-span-8 lg:h-[420px]" />
          <SkeletonCard className="h-[180px] lg:col-span-4 lg:h-[420px]" />

          <SkeletonCard className="h-[180px] lg:col-span-6" />
          <SkeletonCard className="h-[180px] lg:col-span-6" />

          <SkeletonCard className="h-[300px] lg:col-span-12" />
        </div>
      </div>
    </AfterDelay>
  );
}
