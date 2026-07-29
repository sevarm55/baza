import { hy } from '@/lib/i18n/hy';

/**
 * Знак и название рядом.
 *
 * Знак берём из public/logo.svg — того же файла, из которого собраны
 * иконки приложения. Один источник: пересобрал иконки скриптом —
 * поменялось и здесь, разъехаться нечему.
 *
 * Именно со своей плашкой, а не голыми полосами: полоса действия —
 * лайм, и по светлой шапке она даёт контраст 1.06, то есть исчезает.
 * На грейповой плашке знак одинаково читается в обеих темах.
 */
export function Logo({
  size = 34,
  withName = true,
  className = '',
}: {
  size?: number;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={size} height={size} aria-hidden />
      {withName && (
        <span
          className="font-bold text-ink"
          style={{
            // название растёт вместе со знаком, иначе на крупном
            // размере оно висит подписью, а не читается как марка
            fontSize: Math.round(size * 0.48),
            letterSpacing: '0.2em',
          }}
        >
          {hy.app.name.toUpperCase()}
        </span>
      )}
    </span>
  );
}
