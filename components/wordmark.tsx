import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Марка Tetrin, набранная: «TETR» чернилами и «IN» вывороткой на
 * грейповой плашке. Имя лежит в одном месте (`lib/brand.ts`), знак
 * собирается из него.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  const name = BRAND.toUpperCase();

  return (
    <span
      className={cn(
        'inline-flex items-center font-wordmark text-[13px] leading-none tracking-[0.18em] text-foreground select-none',
        className,
      )}
      aria-hidden
    >
      {name.slice(0, -2)}
      <span className="ml-0.5 rounded-[3px] bg-primary px-1 py-0.5 text-primary-foreground">
        {name.slice(-2)}
      </span>
    </span>
  );
}
