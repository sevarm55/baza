import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Мобильное представление экрана: ниже 768px его видно, выше — нет.
 *
 * Переключает CSS, а не JavaScript, и это не мелочь: страницы отдаются
 * с сервера, и любой выбор по ширине окна на клиенте означал бы вспышку
 * чужой раскладки на первой отрисовке — ровно там, где её видно хуже
 * всего, на медленном телефоне.
 *
 * Данные при этом считаются один раз: страница остаётся серверной, оба
 * представления получают уже посчитанное. Бизнес-логика не знает, что
 * представлений два.
 *
 * Клиентские компоненты, которые что-то ДЕЛАЮТ в фоне (поток событий,
 * опрос, тяжёлый график), в скрытом дереве всё равно смонтируются:
 * `display: none` останавливает отрисовку, но не JavaScript. Такие
 * компоненты сами спрашивают `useIsMobile()` и молчат на чужой ширине.
 */
export function MobileOnly({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  return <Tag className={cn('md:hidden', className)}>{children}</Tag>;
}

/** Десктопное представление: на телефоне его нет вовсе. */
export function DesktopOnly({
  children,
  className,
  as: Tag = 'div',
  /** `contents`, когда обёртка не должна ломать сетку родителя */
  display = 'block',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
  display?: 'block' | 'contents' | 'flex';
}) {
  return (
    <Tag
      className={cn(
        'hidden',
        display === 'contents' && 'md:contents',
        display === 'flex' && 'md:flex',
        display === 'block' && 'md:block',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Столбец экрана: одинаковый шаг между блоками на всех экранах.
 *
 * Шаг задан здесь, а не в каждой странице, потому что несовпадающие
 * отступы — первое, по чему приложение перестаёт выглядеть одним
 * приложением. Разрешено ровно два: обычный (12) и просторный (16) для
 * экранов из двух-трёх крупных предметов.
 */
export function MScreen({
  children,
  className,
  space = 'normal',
}: {
  children: ReactNode;
  className?: string;
  space?: 'normal' | 'air' | 'tight';
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col',
        space === 'tight' && 'gap-2',
        space === 'normal' && 'gap-3',
        space === 'air' && 'gap-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Раздел экрана: заголовок, счётчик, ссылка «все» справа.
 *
 * Заголовок тёмный и заметный, а не тихий: на белом листе без границ
 * именно он делит экран на части. Счётчик рядом с ним, а не в скобках
 * в тексте, — число всегда стоит на одном месте.
 */
export function MSection({
  title,
  count,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  /** число справа от заголовка: «7», «12 машин» */
  count?: ReactNode;
  /** ссылка или кнопка в правом углу заголовка */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      {(title !== undefined || action !== undefined) && (
        <div className="flex min-w-0 items-center gap-2 px-1">
          {title !== undefined && (
            <h2 className="truncate text-[length:var(--m-t-section)] leading-tight font-bold tracking-[-0.01em] text-m-ink">
              {title}
            </h2>
          )}
          {count !== undefined && (
            <span className="num shrink-0 text-[13px] font-semibold text-m-faint">{count}</span>
          )}
          {action && <div className="ml-auto flex shrink-0 items-center">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Тихая ссылка в углу раздела: «все», «показать ещё».
 *
 * Грейпом и без подчёркивания: на этом экране цвет уже значит
 * «нажимается», и второй признак был бы шумом.
 */
export function MLink({
  children,
  className,
  ...rest
}: React.ComponentProps<'a'> & { children: ReactNode }) {
  return (
    <a
      {...rest}
      className={cn(
        'm-press text-[length:var(--m-t-note)] font-semibold text-m-grape outline-none',
        'focus-visible:ring-2 focus-visible:ring-m-grape/40 rounded-m-chip',
        className,
      )}
    >
      {children}
    </a>
  );
}
