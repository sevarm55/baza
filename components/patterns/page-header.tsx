import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Шапка раздела.
 *
 * Слева заголовок и одна тихая строка контекста (даты периода, счётчик,
 * пояснение). Справа управление: главное действие одно, остальные
 * тише. Ряд под шапкой (`children`) отдан инструментам страницы:
 * периоду, фильтрам, вкладкам. Если инструментов нет, ряда нет.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  back,
  children,
  className,
  mobileTitle = false,
}: {
  title: ReactNode;
  /** пояснение, что это за страница: одной короткой фразой */
  description?: ReactNode;
  /** строка контекста под заголовком: период, дата, счётчик */
  meta?: ReactNode;
  /** кнопки справа: одна главная, остальные outline/ghost */
  actions?: ReactNode;
  /** ссылка назад для вложенных страниц */
  back?: { href: string; label: string };
  /** ряд инструментов под шапкой */
  children?: ReactNode;
  className?: string;
  /**
   * Показывать заголовок и на телефоне.
   *
   * По умолчанию его там нет: раздел уже назван шапкой «← Название».
   * Но у страниц, где заголовок — это ДАННЫЕ (дата дня, номер машины), в
   * шапке стоит имя раздела, а не они, и спрятать их значит спрятать
   * ответ на вопрос «что я сейчас смотрю».
   */
  mobileTitle?: boolean;
}) {
  return (
    /* На телефоне заголовка здесь нет: раздел уже назван шапкой
       «← Название» наверху экрана, и второй такой же заголовок под ней
       был бы шапкой над шапкой. Остаются действия — и они становятся
       крупнее: по кнопке в тридцать шесть точек мокрым пальцем не
       попасть. */
    <header className={cn('mb-5 flex flex-col gap-4 max-md:mb-3 max-md:gap-2.5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className={cn('min-w-0 flex-1 basis-40', !mobileTitle && 'max-md:hidden')}>
          {back && (
            <Link
              href={back.href}
              /* На телефоне «назад» уже стоит стрелкой в шапке экрана;
                 вторая такая же ссылка под ней — это два ответа на один
                 вопрос. */
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground max-md:hidden"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              {back.label}
            </Link>
          )}
          <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.01em] max-md:text-[length:var(--m-t-title)] max-md:font-bold max-md:tracking-[-0.03em]">
            {title}
          </h1>
          {(description || meta) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground max-md:mt-1.5 max-md:text-[length:var(--m-t-lead)] max-md:text-m-muted">
              {description}
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              'flex max-w-full flex-wrap items-center gap-2',
              /* На телефоне действия становятся кнопками системы: рост
                 пятьдесят две точки и скругление восемнадцать — по
                 кнопке в тридцать шесть точек мокрым пальцем не
                 попасть. */
              'max-md:w-full max-md:[&>*]:min-h-[52px] max-md:[&>*]:flex-1',
              'max-md:[&>*]:rounded-m-row max-md:[&>*]:text-[length:var(--m-t-field)]',
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {/* `min-w-0` обязателен: без него слишком широкий инструмент
          (полоса из шести фильтров) растягивает ряд, ряд растягивает
          страницу, и весь экран начинает ездить вбок. */}
      {children && (
        <div
          /* `flex-nowrap` на телефоне обязателен: колоночный flex с
             переносом раскладывает детей по КОЛОНКАМ, и ширину ряду
             задаёт самый широкий из них — лента фильтров растягивает
             страницу вбок вместо того, чтобы кататься внутри себя. */
          className="flex min-w-0 flex-wrap items-center gap-2 max-md:flex-col max-md:flex-nowrap max-md:items-stretch max-md:gap-2.5"
        >
          {children}
        </div>
      )}
    </header>
  );
}

/**
 * Заголовок блока внутри страницы: секции, группы, списка.
 * Размер один на весь продукт, чтобы иерархия читалась весом и
 * положением, а не кеглем.
 */
export function SectionHeader({
  title,
  count,
  description,
  actions,
  className,
  as: Tag = 'h2',
}: {
  title: ReactNode;
  count?: number | string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <Tag className="flex items-center gap-2 text-[15px] leading-tight font-semibold">
          {title}
          {count !== undefined && (
            <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </Tag>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
