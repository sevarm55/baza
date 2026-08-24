import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Два представления одного экрана.
 *
 * Ниже 768px продукт показывает композицию приложения, выше — кабинет,
 * который был. Переключает CSS, а не JavaScript, и это не мелочь:
 * страницы отдаются с сервера, и любой выбор по ширине окна на клиенте
 * означал бы вспышку чужой раскладки на первой отрисовке — ровно там,
 * где её видно хуже всего, на медленном телефоне.
 *
 * Данные при этом считаются один раз: страница остаётся серверной, оба
 * представления получают уже посчитанное. Бизнес-логика не знает, что
 * представлений два.
 *
 * Клиентские компоненты, которые что-то ДЕЛАЮТ в фоне (поток событий,
 * опрос, тяжёлый график), в скрытом дереве всё равно смонтируются —
 * `display: none` останавливает отрисовку, но не JavaScript. Такие
 * компоненты сами спрашивают `useIsMobile()` и молчат на чужой ширине;
 * см. `components/patterns/live-activity.tsx`.
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
 * Полотно экрана приложения.
 *
 * Табло, а не белый лист: цвет полотна отличается от карточек на нём, и
 * именно поэтому белая карточка читается карточкой. Поле по бокам — 16
 * точек, как в приложении, и оно уважает чёлку в повороте.
 *
 * Место под полосу вкладок отводится здесь, а не на каждой странице:
 * забыть его можно ровно один раз, и тогда последняя строка списка
 * навсегда останется под вкладками.
 */
export function MobilePage({
  children,
  className,
  /** страница без нижних вкладок: лист, вход, полноэкранная форма */
  bare = false,
  /** без бокового поля: списки во всю ширину сами держат свои края */
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  bare?: boolean;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        'm-enter flex min-w-0 flex-col gap-3 pt-2',
        !flush && 'm-pad-x',
        !bare && 'm-tabs-space',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Раздел экрана: тихий заголовок, счётчик справа, содержимое под ними.
 *
 * Заголовок мелкий и приглушённый намеренно — он подписывает содержимое,
 * а не соревнуется с ним. Тот же кегль, что у `section(_:)` в приложении.
 */
export function MobileSection({
  title,
  count,
  action,
  children,
  className,
  headClassName,
}: {
  title?: ReactNode;
  /** число справа от заголовка: «7 машин», «12» */
  count?: ReactNode;
  /** ссылка или кнопка в правом углу заголовка */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headClassName?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col', className)}>
      {(title !== undefined || action !== undefined) && (
        <div className={cn('flex items-center gap-2 px-1 pt-3 pb-1.5', headClassName)}>
          {title !== undefined && (
            <h2 className="text-[13px] leading-tight font-semibold text-m-muted">{title}</h2>
          )}
          {count !== undefined && <span className="num text-xs text-m-muted">{count}</span>}
          {action && <div className="ml-auto flex shrink-0 items-center">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
