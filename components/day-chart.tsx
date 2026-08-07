import { formatMoney } from '@/lib/money';

export type ChartPoint = { label: string; value: number; peak?: boolean };

/**
 * Рельеф периода столбиками.
 *
 * Не SVG, а обычные блоки: так график тянется по ширине без искажений
 * и остаётся чётким на любом экране. Подписи ставим не под каждым
 * столбиком, а через один-два — иначе на телефоне они слипаются в кашу.
 */
export function DayChart({
  points,
  currency,
  byHour,
  labelEvery = 3,
}: {
  points: ChartPoint[];
  currency: string;
  /* Раньше это угадывалось по числу столбиков: больше двадцати четырёх —
     дни. Пока периоды были «7 дней» и «30 дней», догадка работала. С
     календарным месяцем она ломается седьмого числа: семь столбиков, и
     график объявляет их часами. */
  byHour: boolean;
  labelEvery?: number;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value));
  const peakIndex = points.findIndex((p) => p.value === max && max > 0);

  return (
    <div className="tile mb-2.5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="label">{byHour ? 'ԺԱՄԵՐ' : 'ՕՐԵՐ'}</span>
        {max > 0 && (
          <span className="num text-[12px] text-faint">
            {points[peakIndex]?.label} · {formatMoney(max, currency)}
          </span>
        )}
      </div>

      <div className="flex h-[92px] items-end gap-[3px]">
        {points.map((p, i) => {
          const height = max > 0 ? Math.max(2, Math.round((p.value / max) * 100)) : 2;
          const isPeak = i === peakIndex && max > 0;
          return (
            <div
              key={`${p.label}-${i}`}
              className="flex-1 rounded-t-[3px] transition-[height]"
              style={{
                height: `${height}%`,
                // пик выделен цветом: именно он отвечает на вопрос
                // «когда у меня заезд», ради которого сюда и смотрят
                background: isPeak
                  ? 'var(--color-accent-strong)'
                  : p.value > 0
                    ? 'var(--bar)'
                    : 'var(--bar-empty)',
              }}
              title={`${p.label} · ${formatMoney(p.value, currency)}`}
            />
          );
        })}
      </div>

      <div className="mt-2 flex gap-[3px]">
        {points.map((p, i) => (
          <div
            key={`l-${p.label}-${i}`}
            className="num flex-1 overflow-hidden text-center text-[10px] whitespace-nowrap text-faint"
          >
            {i % labelEvery === 0 ? p.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export type SplitSegment = { label: string; value: number; color: string };

/**
 * Приход одной полосой вместо отдельных плиток.
 * Владельцу важна не абсолютная сумма наличных, а их доля: сколько денег
 * проходит мимо кассы — вопрос, с которого начинается весь продукт.
 */
export function PaymentSplit({
  segments,
  currency,
}: {
  segments: SplitSegment[];
  currency: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;

  // крупное вперёд: доля наличных — то, ради чего сюда смотрят
  const visible = segments.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div className="tile mb-2.5">
      <div className="mb-2.5 flex h-2.5 overflow-hidden rounded-full">
        {visible.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[12.5px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="text-muted">{s.label}</span>
            <span className="num font-semibold">{formatMoney(s.value, currency)}</span>
            <span className="num text-faint">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
