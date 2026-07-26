import { hy } from '@/lib/i18n/hy';

/**
 * Знак и название рядом.
 *
 * Знак берём из public/mark.svg — того же файла, из которого собраны
 * иконки приложения. Один источник: пересобрал иконки скриптом —
 * поменялось и здесь, разъехаться нечему.
 */
export function Logo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mark.svg" alt="" width={size} height={size} aria-hidden />
      <span className="text-[13px] font-bold tracking-[0.28em] text-accent">
        {hy.app.name.toUpperCase()}
      </span>
    </span>
  );
}
