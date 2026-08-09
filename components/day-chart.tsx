import { formatMoney } from '@/lib/money';

export type ChartPoint = { label: string; value: number; peak?: boolean };
type SplitSegment = { label: string; value: number; color: string };

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
}: {
  points: ChartPoint[];
  currency: string;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value));
  const peakIndex = points.findIndex((p) => p.value === max && max > 0);

  return (
    /* Волна, а не карточка с диаграммой.
    
       Столбики остались, но полотна вокруг них больше нет: на табло
       график — это рельеф под показанием, а не отдельный прибор в
       рамке. Рамка требовала заголовка, заголовок требовал места, и
       вместе они отнимали высоту у того, ради чего сюда смотрят. */
    <div className="mt-1 mb-2">
      <div className="flex h-[64px] items-end gap-[3px]">
        {points.map((p, i) => {
          const height = max > 0 ? Math.max(2, Math.round((p.value / max) * 100)) : 2;
          const isPeak = i === peakIndex && max > 0;
          return (
            <div
              key={`${p.label}-${i}`}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: `${height}%`,
                /* Пик выделен: именно он отвечает на вопрос «когда у меня
                   заезд», ради которого сюда и смотрят. Остальные —
                   приглушённым чернилом полотна, чтобы волна читалась
                   рельефом, а не набором палок. */
                background: isPeak
                  ? 'var(--tone-violet-glow)'
                  : 'color-mix(in srgb, var(--board-ink) 14%, transparent)',
              }}
              title={`${p.label} · ${formatMoney(p.value, currency)}`}
            />
          );
        })}
      </div>

      {/* Подписи под волной: время слева, пик справа. Больше ничего —
          читают тут форму, а не значения. */}
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="num text-[11px]" style={{ color: 'var(--board-muted)' }}>
          {points[0]?.label}
          {points.length > 1 && ` — ${points[points.length - 1]?.label}`}
        </span>
        {max > 0 && (
          <span className="num text-[11px]" style={{ color: 'var(--board-muted)' }}>
            {points[peakIndex]?.label} · {formatMoney(max, currency)}
          </span>
        )}
      </div>
    </div>
  );
}

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
