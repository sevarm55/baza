'use client';

import { useState } from 'react';

/**
 * Кто вошёл: фото, имя, роль.
 *
 * Раньше здесь стоял квадратик с двумя буквами имени. Буквы отвечали на
 * вопрос «чья это строка» в списке, где строк двадцать, — а здесь строка
 * одна, и различать её не с чем. Лицо кабинета не должно выглядеть как
 * ячейка таблицы.
 *
 * Своей карточки у людей пока нет: вместо неё общий снимок — тёмный
 * фиолетовый шёлк с лаймовой полосой света. Ни знака, ни буквы: заглушка
 * стоит на месте чужого лица и ничего о человеке не утверждает. Когда
 * появятся свои карточки, подменится только адрес картинки.
 *
 * Кадров два: квадратный в строке и широкий в раскрытом виде
 * (`avatar-wide.jpg`) — один снимок, два обреза, чтобы полоса не тянула
 * квадрат по горизонтали.
 *
 * Нажатие разворачивает снимок во всю ширину прибора, имя переезжает на
 * него белым. То же движение, что в приложении: там фото раскрывают
 * оттяжкой вниз и с отдачей в палец, здесь — нажатием, потому что у мышки
 * нет ни оттяжки, ни отдачи. Обещать вебу жест, которого у него нет,
 * значит сделать кнопку, которая не нажимается.
 */
export function ProfileFace({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={name}
      className="relative block w-full cursor-pointer overflow-hidden text-left transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ height: open ? 232 : 46 }}
    >
      {/* Картинка фоном, а не элементом: она обязана обрезаться по кадру,
          а не растягивать прибор вбок. */}
      <span
        className="absolute top-0 left-0 bg-[#2E1065] bg-cover transition-all duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          backgroundImage: open ? 'url(/avatar-wide.jpg)' : 'url(/avatar.jpg)',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          width: open ? '100%' : 46,
          height: open ? '100%' : 46,
          borderRadius: open ? 'var(--radius-card)' : 'var(--radius-sm)',
        }}
        aria-hidden
      />

      {/* Затемнение только под раскрытым снимком: белое имя ложится на
          капли, а капли светлые. */}
      <span
        className="absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none"
        style={{
          opacity: open ? 1 : 0,
          borderRadius: 'var(--radius-card)',
          background: 'linear-gradient(to bottom, transparent 42%, rgb(0 0 0 / 0.68))',
        }}
        aria-hidden
      />

      <span
        className="absolute min-w-0 transition-all duration-300 motion-reduce:transition-none"
        style={{
          left: open ? 18 : 60,
          bottom: open ? 16 : 'auto',
          top: open ? 'auto' : 1,
          right: open ? 18 : 0,
        }}
      >
        <span
          className="block truncate leading-tight font-bold transition-[color,font-size] duration-300 motion-reduce:transition-none"
          style={{ fontSize: open ? 22 : 20, color: open ? '#fff' : 'var(--board-ink)' }}
        >
          {name}
        </span>
        <span
          className="block truncate text-[13.5px] transition-colors duration-300 motion-reduce:transition-none"
          style={{ color: open ? 'rgb(255 255 255 / 0.78)' : 'var(--board-muted)' }}
        >
          {role}
        </span>
      </span>
    </button>
  );
}
