/**
 * Знаки продукта.
 *
 * До этого файла их роль исполняли эмодзи: 💵 на способе оплаты, 🎟 на
 * абонементе, ✅ после записи, ⏻ на выходе. Причина, по которой они
 * ушли, не вкусовая.
 *
 * Эмодзи рисует не приложение, а операционная система. Один и тот же
 * 💵 — это плоская зелёная бумажка на Android, объёмная долларовая
 * пачка на iPhone и синеватая купюра в Windows; ни одна из трёх не
 * знает ни про грейп, ни про лайм, и рядом с выверенной палитрой они
 * выглядят наклейками с чужого экрана. Вдобавок доллар на способе
 * оплаты в стране, где платят драмами, — это просто неправда.
 *
 * Здесь все знаки одного рисунка: контур 1.5 по сетке 16, скруглённые
 * концы, никаких заливок. Тот же рисунок, что у значков разделов в
 * `sections.tsx`, — набор должен читаться как один набор.
 */
import type { SVGProps } from 'react';

function Glyph({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Закрыть окно. */
export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </Glyph>
  );
}

/** Наличные: купюра. */
export function IconCash(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect x="1.75" y="4.25" width="12.5" height="7.5" rx="1.25" />
      <circle cx="8" cy="8" r="1.75" />
    </Glyph>
  );
}

/** Карта: прямоугольник с магнитной полосой. */
export function IconCard(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M1.75 6.75h12.5M4.25 9.75h2.5" />
    </Glyph>
  );
}

/** Перевод: телефон со стрелкой вверх. */
export function IconTransfer(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="1.75" />
      <path d="M8 5.25v4.5M6.25 7l1.75-1.75L9.75 7" />
    </Glyph>
  );
}

/** Абонемент: талон с линией отрыва. */
export function IconTicket(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect x="1.75" y="4.25" width="12.5" height="7.5" rx="1.5" />
      <path d="M6 4.25v7.5" strokeDasharray="1.4 1.4" />
    </Glyph>
  );
}

/** Записано. */
export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Glyph>
  );
}

/** Кончился: перечёркнутый круг. */
export function IconVoid(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="m4.25 11.75 7.5-7.5" />
    </Glyph>
  );
}

/** Выход из системы. */
export function IconPower(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M8 2.25v5.5" />
      <path d="M11.6 4.4a5 5 0 1 1-7.2 0" />
    </Glyph>
  );
}

/** Тёмная тема. */
export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M13.25 9.6A5.75 5.75 0 0 1 6.4 2.75a5.75 5.75 0 1 0 6.85 6.85Z" />
    </Glyph>
  );
}

/** Светлая тема. */
export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" />
    </Glyph>
  );
}

/** Тема ещё не прочитана: половина круга. */
export function IconHalf(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" />
    </Glyph>
  );
}
