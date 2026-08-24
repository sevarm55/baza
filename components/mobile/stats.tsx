import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Числа мобильного слоя.
 *
 * Главное число экрана набрано в полсотни пунктов и стоит прямо на
 * белом листе, без коробки вокруг. Коробка вокруг главного числа делает
 * его одним из предметов экрана; без неё оно и есть экран.
 */
export function MReading({
  label,
  value,
  under,
  tone = 'ink',
  children,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** фишка сравнения, состояние смены — всё, что стоит под числом */
  under?: ReactNode;
  tone?: 'ink' | 'good' | 'bad';
  /** полоса долей, разрез — всё, что объясняет число */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col px-1', className)}>
      <span className="text-[13.5px] leading-tight font-medium text-m-muted">{label}</span>
      <span
        className={cn(
          'num mt-1.5 leading-[1.02] font-bold tracking-[-0.035em]',
          'text-[clamp(38px,13vw,52px)]',
          tone === 'ink' && 'text-m-ink',
          tone === 'good' && 'text-m-good',
          tone === 'bad' && 'text-m-bad',
        )}
      >
        {value}
      </span>
      {under && <div className="mt-3 flex flex-wrap items-center gap-2">{under}</div>}
      {children}
    </div>
  );
}

/**
 * Фишка сравнения: стрелка, разница, с чем сравнили.
 *
 * Знак стрелкой И цветом, а не одним цветом: смысл, переданный
 * оттенком, теряется на мокром телефоне под солнцем — того же требует
 * WCAG 1.4.1.
 *
 * Рост лаймовый: это единственная хорошая новость экрана, и она имеет
 * право на фирменный цвет. Падение остаётся тихим — красная плашка на
 * сводке кричала бы каждый второй день, а день бывает просто дождливым.
 */
export function MDelta({
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
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-bold',
          up ? 'bg-m-lime text-[#170b2b]' : 'bg-m-tile text-m-ink',
        )}
      >
        <Icon aria-hidden className="size-[15px]" strokeWidth={2.4} />
        <span className="num">{diff}</span>
      </span>
      {label && <span className="text-[12.5px] text-m-faint">{label}</span>}
    </span>
  );
}

/**
 * Полоса долей: из чего состоит целое.
 *
 * Куски разделены зазором, а не только цветом: две соседние ступени
 * одного грейпа на солнце сливаются, а щель в три точки видна всегда.
 * Первый кусок — доля владельца, и он самый тёмный: полоса отвечает на
 * вопрос «сколько из этого моего», и ответ виден раньше, чем прочитаны
 * подписи.
 */
export function MSplitBar({
  parts,
  height = 12,
  className,
}: {
  parts: { key: string; color: string; amount: number; label?: string }[];
  height?: number;
  className?: string;
}) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.amount), 0);
  if (total <= 0) return null;

  return (
    <div className={cn('flex w-full gap-[3px]', className)} style={{ height }} aria-hidden>
      {parts
        .filter((p) => p.amount > 0)
        .map((p) => (
          <span
            key={p.key}
            className="rounded-full"
            style={{ width: `${(p.amount / total) * 100}%`, background: p.color, minWidth: 4 }}
          />
        ))}
    </div>
  );
}

/**
 * Легенда полосы: точка, подпись, сумма.
 *
 * Строками, а не в ряд: суммы должны стоять одна под другой, иначе их
 * нельзя сравнить взглядом.
 */
export function MLegend({
  parts,
  className,
}: {
  parts: { key: string; color: string; label: ReactNode; value: ReactNode; share?: ReactNode }[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {parts.map((p) => (
        <li key={p.key} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          <span className="min-w-0 flex-1 truncate text-[14px] text-m-muted">{p.label}</span>
          {p.share !== undefined && (
            <span className="num shrink-0 text-[12.5px] text-m-faint">{p.share}</span>
          )}
          <span className="num shrink-0 text-[14px] font-bold text-m-ink">{p.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Кольцо разреза с числом в середине.
 *
 * Кольцо, а не круг: середина занята итогом, и без него разрез
 * показывал бы доли неизвестно от чего. Сегменты разделены зазором по
 * той же причине, что и в полосе.
 */
export function MRing({
  parts,
  total,
  caption,
  size = 168,
  className,
}: {
  parts: { key: string; color: string; amount: number }[];
  /** число в середине кольца */
  total: ReactNode;
  /** подпись под числом */
  caption?: ReactNode;
  size?: number;
  className?: string;
}) {
  const sum = parts.reduce((acc, p) => acc + Math.max(0, p.amount), 0);
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  /* Зазор между кусками съедается из каждого куска, а не добавляется
     к кольцу: иначе сумма дуг перестала бы равняться окружности и
     последний кусок наезжал бы на первый. */
  const gap = sum > 0 && parts.length > 1 ? 6 : 0;

  let offset = 0;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--m-tile)"
            strokeWidth={stroke}
          />
          {sum > 0 &&
            parts
              .filter((p) => p.amount > 0)
              .map((p) => {
                const length = (Math.max(0, p.amount) / sum) * circumference;
                const dash = Math.max(0, length - gap);
                const node = (
                  <circle
                    key={p.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length;
                return node;
              })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <span className="num text-[22px] leading-tight font-bold tracking-[-0.02em] text-m-ink">
          {total}
        </span>
        {caption && <span className="mt-0.5 text-[11.5px] text-m-muted">{caption}</span>}
      </div>
    </div>
  );
}

/**
 * Ступени грейпа для разрезов и графиков.
 *
 * Пять оттенков одного цвета вместо радуги: разрез отвечает на вопрос
 * «какой кусок больше», а не «какого цвета услуга». Лайм в этот ряд не
 * входит — он занят долей владельца и живым временем.
 */
export const M_SERIES = [
  'var(--m-grape)',
  'var(--m-step-2)',
  'var(--m-step-3)',
  'var(--m-step-4)',
  'var(--m-step-5)',
] as const;

/** Цвет ступени по номеру: ряд короткий, дальше он повторяется. */
export function mSeries(index: number): string {
  return M_SERIES[index % M_SERIES.length];
}
