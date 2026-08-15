import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { PointForm } from '@/components/point-form';
import { getDict } from '@/lib/i18n/server';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import type { Point } from '@/lib/accounts';

/** Library-owned branch switcher used inside the shadcn sidebar. */
export async function PointSwitcher({
  points,
  currentId,
  subtitle,
  sidebar = false,
}: {
  points: Point[];
  currentId: string;
  subtitle: string;
  sidebar?: boolean;
}) {
  const t = await getDict();
  const current = points.find((point) => point.id === currentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          sidebar ? (
            <SidebarMenuButton
              size="lg"
              tooltip={current?.name ?? t.points.title}
              aria-label={`${current?.name ?? t.points.title} · ${subtitle}`}
            />
          ) : (
            <button
              type="button"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-start outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            />
          )
        }
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
          <Building2 className="size-4" aria-hidden="true" />
        </span>
        <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">
            {current?.name ?? t.points.title}
          </span>
          <span className="truncate text-xs text-sidebar-foreground/60">{subtitle}</span>
        </span>
        <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/55" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={sidebar ? 'right' : 'bottom'}
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
                    className={`size-2 shrink-0 rounded-full ${point.canRead ? 'bg-good' : 'bg-warn'}`}
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
