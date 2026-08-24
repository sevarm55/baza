import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Белая бумага на полотне табло.
 *
 * Грань в 0.8 пикселя обязательна: без неё белая карточка на светлом
 * полотне перестаёт быть карточкой. Тени нет — в приложении её тоже
 * почти нет, слои разделяет тон и грань.
 *
 * Три размера скругления, и ни одного случайного: `hero` у главного
 * показания экрана, `card` у коробки списка, `box` у прибора внутри.
 */
export function MobileCard({
  children,
  className,
  radius = 'card',
  padded = true,
  tone = 'paper',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  radius?: 'hero' | 'card' | 'box' | 'tile';
  padded?: boolean;
  /** `paper` — белая бумага, `warm` — тёплая под действие, `quiet` — вдавленная */
  tone?: 'paper' | 'warm' | 'quiet' | 'slate';
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      data-slot="m-card"
      className={cn(
        'flex min-w-0 flex-col',
        radius === 'hero' && 'rounded-m-hero',
        radius === 'card' && 'rounded-m-card',
        radius === 'box' && 'rounded-m-box',
        radius === 'tile' && 'rounded-m-tile',
        tone === 'paper' && 'border border-m-hair bg-m-surface',
        tone === 'warm' && 'border border-m-hair bg-m-warm',
        tone === 'quiet' && 'border border-m-inset-soft bg-m-inset-soft',
        tone === 'slate' && 'bg-m-slate text-white',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Показание прибора: подпись над числом, число по оси экрана, приписка.
 *
 * Единственное место продукта, где цифра набрана в сорок пять пунктов.
 * Кегль здесь — иерархия, а не украшение: экран отвечает на один
 * вопрос, и ответ должен читаться раньше, чем прочитан заголовок.
 *
 * Число уменьшается на узком экране само (`clamp`), а не переносится:
 * «886 300 ֏», разорванное на две строки, читается двумя числами.
 */
export function MobileReading({
  meta,
  label,
  value,
  tone = 'default',
  under,
  children,
  className,
}: {
  /** дата периода и плашки над подписью */
  meta?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'good' | 'bad';
  /** сравнение с прошлым отрезком, состояние смены */
  under?: ReactNode;
  /** разрез, полоса долей — всё, что объясняет число */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <MobileCard radius="hero" padded={false} className={cn('px-5 py-5', className)}>
      {meta && <div className="mb-4 flex min-w-0 items-center gap-2">{meta}</div>}
      <div className="text-[13px] leading-snug font-medium text-m-muted">{label}</div>
      <div
        className={cn(
          'num mt-0.5 leading-[1.05] font-bold tracking-[-0.02em]',
          'text-[clamp(30px,11vw,45px)]',
          tone === 'default' && 'text-m-ink',
          tone === 'good' && 'text-m-good',
          tone === 'bad' && 'text-m-bad',
        )}
      >
        {value}
      </div>
      {under}
      {children}
    </MobileCard>
  );
}

/**
 * Плашка сравнения: стрелка, разница, с чем сравнили.
 *
 * Знак стрелкой и цифрой, а не одним цветом: смысл, переданный
 * оттенком, теряется на мокром телефоне под солнцем — и того же
 * требует WCAG 1.4.1.
 */
export function MobileDelta({
  up,
  diff,
  label,
  className,
}: {
  up: boolean;
  diff: ReactNode;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-m-pill bg-m-chip px-2.5 py-1.5',
        up ? 'text-m-good' : 'text-m-bad',
        className,
      )}
    >
      <span aria-hidden className="text-[10px] leading-none font-black">
        {up ? '↑' : '↓'}
      </span>
      <span className="num text-[12.5px] font-bold">{diff}</span>
      {label && <span className="truncate text-xs text-m-muted">{label}</span>}
    </span>
  );
}
