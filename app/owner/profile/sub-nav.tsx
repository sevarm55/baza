import type { ReactNode } from 'react';

/**
 * Оглавление длинной страницы настроек: якоря к её панелям.
 *
 * На широком экране стоит слева и едет вместе с прокруткой. На телефоне
 * его нет вовсе: строка мелких якорей над панелями — это оглавление
 * документа, а не орган управления приложением, и попасть по ней
 * пальцем нельзя. Страница там прокручивается целиком, а «где я» видно
 * по заголовку панели.
 */
export function SubNav({ label, items }: { label: string; items: { id: string; label: ReactNode }[] }) {
  return (
    <nav aria-label={label} className="max-md:hidden lg:w-48 lg:shrink-0">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:sticky lg:top-18 lg:flex-col lg:gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block rounded-md py-1 text-sm text-muted-foreground transition-colors hover:text-foreground lg:px-2 lg:py-1.5 lg:hover:bg-muted"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Две колонки: оглавление слева, стопка панелей справа. */
export function SubNavLayout({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
      {nav}
      <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}
