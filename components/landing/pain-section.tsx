import type { Dict } from '@/lib/i18n';

import { PainScroll } from './pain-scroll';
import { Words } from './words';

/**
 * Что ломается без системы. Четвёртая секция витрины.
 *
 * Стоит после доказательства нарочно. Первые три секции говорили, что
 * продукт делает; эта напоминает, из чего человек уходит. Раньше — до
 * доказательства — она читалась бы нытьём; после — узнаванием.
 *
 * Каждая боль это не строчка, а сцена с роботом: владелец мойки узнаёт
 * не формулировку, а свой стол. Устройство и раскладка — в
 * `pain-scroll.tsx`.
 *
 * Робота, выглядывающего из-за края экрана (`peek.tsx`), здесь нет
 * сознательно: персонаж и так стоит в секции четырежды, пятый на том же
 * экране — уже перебор, да и налезал он ровно на липкую сцену. Компонент
 * оставлен для секции, где робота больше нигде не будет.
 *
 * Заодно с ним ушёл `overflow-hidden`, и это не уборка, а починка:
 * `overflow` на предке отменяет `position: sticky` у потомка, и липкая
 * сцена вместо того, чтобы стоять, уезжала вверх вместе с текстом.
 */

/**
 * Сцены. Порядок совпадает с порядком болей в словаре: тетрадь,
 * калькулятор, чеки, телефон.
 */
const ART = [
  '/hero/pain/p1.webp',
  '/hero/pain/p2.webp',
  '/hero/pain/p3.webp',
  '/hero/pain/p4.webp',
] as const;

export function PainSection({ t }: { t: Dict }) {
  const l = t.landing.problem;

  return (
    <section
      id="pain"
      aria-labelledby="pain-title"
      className="relative scroll-mt-16 bg-[var(--landing-bg)]"
    >
      <div className="mx-auto w-full max-w-[1360px] px-5 pt-20 pb-24 md:px-10 md:pt-28 md:pb-32">
        <Words
          id="pain-title"
          text={l.title}
          className="font-wordmark max-w-[16ch] text-[26px] leading-[1.12] tracking-[-0.01em] uppercase md:text-[36px]"
        />

        <PainScroll items={l.items} art={ART} />
      </div>
    </section>
  );
}
