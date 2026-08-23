'use client';

import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type RowAction = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** линия перед пунктом */
  separator?: boolean;
};

/**
 * Меню «…» в строке таблицы или карточке. Самые частые действия в него
 * не прячут: они стоят кнопкой рядом. Здесь живёт то, что делают
 * редко или что опасно.
 */
export function RowActions({
  actions,
  label,
  size = 'icon-sm',
  align = 'end',
}: {
  actions: RowAction[];
  /** подпись кнопки для чтеца экрана */
  label: string;
  size?: 'icon-sm' | 'icon-xs' | 'icon';
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size={size} aria-label={label} data-no-row-click />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44">
        {actions.map((a) => (
          <div key={a.key}>
            {a.separator && <DropdownMenuSeparator />}
            {a.href ? (
              <DropdownMenuItem
                variant={a.destructive ? 'destructive' : 'default'}
                disabled={a.disabled}
                render={<Link href={a.href} />}
              >
                {a.icon}
                {a.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant={a.destructive ? 'destructive' : 'default'}
                disabled={a.disabled}
                onClick={a.onSelect}
              >
                {a.icon}
                {a.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
