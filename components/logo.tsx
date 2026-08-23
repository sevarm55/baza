import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Знак и название рядом. Знак тот же, что у приложения на телефоне
 * (`public/logo.png`); скругление долей от размера, как у иконки.
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
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        aria-hidden
        style={{ borderRadius: Math.round(size * 0.22) }}
      />
      {withName && (
        <span
          className="font-wordmark font-bold text-foreground"
          style={{ fontSize: Math.round(size * 0.42), letterSpacing: '0.18em' }}
        >
          {BRAND.toUpperCase()}
        </span>
      )}
    </span>
  );
}
