import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Рамки, в которых витрина показывает продукт.
 *
 * Окно браузера и телефон нарисованы теми же токенами, что и кабинет:
 * граница в пиксель, белая поверхность, никаких теней. Рамка говорит
 * «это экран», а не «это картинка», и то, что внутри, собрано из тех
 * же компонентов, что рисуют настоящий кабинет.
 */
export function BrowserFrame({
  title,
  children,
  className,
  badge,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** метка «демо» в правом верхнем углу */
  badge?: ReactNode;
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/60 px-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        {title && <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>}
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}

export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative w-[272px] overflow-hidden rounded-[28px] border border-border bg-card p-1.5',
        className,
      )}
    >
      <div className="overflow-hidden rounded-[22px] border border-border bg-background">
        <div className="flex h-7 items-center justify-center">
          <span className="h-4 w-20 rounded-full bg-foreground/90" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Метка демо-данных: стоит на каждом экране витрины. */
export function DemoBadge({ label }: { label: string }) {
  return (
    <span className="rounded-sm bg-lime px-1.5 py-0.5 text-2xs font-medium tracking-wider text-lime-foreground uppercase">
      {label}
    </span>
  );
}

/** Подпись раздела над заголовком: маленьким капсом, как метки показаний. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-2xs font-medium tracking-wider text-primary uppercase', className)}>{children}</span>
  );
}
