import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Строка фактов: числа на полотне, разделённые волосяной чертой.
 *
 * Не три цветные плитки. Три заливки одинаковой силы спорят и между
 * собой, и с главным числом над ними, и первым на экране читается цвет,
 * а не деньги. Здесь числа стоят строкой, без коробок вокруг каждого, —
 * тем же приёмом, что показатели дня в сводке приложения.
 */
export function MobileStatRow({
  items,
  className,
  quiet = true,
}: {
  items: { key: string; label: ReactNode; value: ReactNode }[];
  className?: string;
  /** вдавленная подложка под строкой; `false` — прямо на полотне */
  quiet?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-stretch',
        quiet && 'rounded-m-box border border-m-inset-soft bg-m-inset-soft',
        'py-3.5',
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={item.key} className="flex min-w-0 flex-1 items-center">
          {i > 0 && <span aria-hidden className="h-[34px] w-px shrink-0 bg-m-divider" />}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2">
            <span className="num truncate text-[18px] leading-none font-bold text-m-ink">
              {item.value}
            </span>
            <span className="truncate text-[10.5px] leading-none font-medium text-m-muted">
              {item.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Полоса, разрезанная по долям.
 *
 * Отвечает на вопрос, которого нет у колонок цифр, — КАКОЙ ДОЛЕЙ. Из
 * каждых двадцати двух тысяч владельцу осталось четыре, и это видно
 * длиной куска, без чтения.
 *
 * Целое считается по кускам, а не приходит снаружи: полоса, у которой
 * сумма частей не сходится с её же длиной, врёт молча.
 */
export function MobileSplitBar({
  parts,
  height = 12,
  className,
}: {
  parts: { key: string; color: string; amount: number }[];
  height?: number;
  className?: string;
}) {
  const total = Math.max(1, parts.reduce((sum, p) => sum + p.amount, 0));
  return (
    <div className={cn('flex w-full gap-0.5', className)} style={{ height }} aria-hidden>
      {parts.map((p) => (
        <span
          key={p.key}
          className="block"
          style={{
            /* Не тоньше четырёх точек: кусок нулевой ширины читается как
               отсутствие статьи, а она есть. */
            width: `max(4px, ${(p.amount / total) * 100}%)`,
            background: p.color,
            borderRadius: height / 3,
          }}
        />
      ))}
    </div>
  );
}

/** Подписи к полосе — одной строкой, а не колонками. */
export function MobileSplitLegend({
  parts,
  className,
}: {
  parts: { key: string; color: string; label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {parts.map((p) => (
        <span key={p.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          <span className="truncate text-[11px] text-m-muted">{p.label}</span>
          <span className="num text-[11px] font-bold text-m-ink">{p.value}</span>
        </span>
      ))}
    </div>
  );
}
