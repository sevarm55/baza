'use client';

import { Building2, Check, ChevronsUpDown } from 'lucide-react';

import { PointForm } from '@/components/point-form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { useT } from '@/lib/i18n/client';
import type { Point } from '@/lib/accounts';
import { cn } from '@/lib/utils';

/**
 * Переключатель филиалов. Показывается только тем, у кого их больше
 * одного: у кого мойка одна, тот не должен узнать, что бывают вторые.
 * Переход идёт формой `switchPoint`, а не ссылкой: меняется сессия.
 */
export function PointSwitcher({
  points,
  currentId,
  subtitle,
  variant = 'sidebar',
}: {
  points: Point[];
  currentId: string;
  subtitle: string;
  variant?: 'sidebar' | 'bar';
}) {
  const t = useT();
  const { isMobile } = useSidebar();
  const current = points.find((point) => point.id === currentId);
  const name = current?.name ?? t.points.title;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === 'sidebar' ? (
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              aria-label={`${name} · ${subtitle}`}
              className="data-open:bg-sidebar-accent"
            />
          ) : (
            <button
              type="button"
              className="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          )
        }
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Building2 className="size-4" aria-hidden="true" />
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={variant === 'sidebar' && !isMobile ? 'right' : 'bottom'}
        align="start"
        sideOffset={8}
        className="w-72"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.points.title}</DropdownMenuLabel>
          {points.map((point) => {
            const here = point.id === currentId;
            return (
              <PointForm key={point.id} tid={point.id}>
                <DropdownMenuItem
                  disabled={here}
                  nativeButton
                  render={<button type="submit" className="w-full py-2 text-start" />}
                >
                  <span
                    className={cn('size-2 shrink-0 rounded-full', point.canRead ? 'bg-success' : 'bg-warning')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{point.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {point.role === 'owner' ? t.roles.owner : t.roles.staff}
                      {point.canRead ? '' : ` · ${t.points.needsPayment}`}
                    </span>
                  </span>
                  {here && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </DropdownMenuItem>
              </PointForm>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
