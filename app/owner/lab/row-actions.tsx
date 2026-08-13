'use client';

import { EllipsisVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { hy } from '@/lib/i18n/hy';

/**
 * Меню строки ленты.
 *
 * В нашем кабинете действие строки одно и стоит прямо в ней: крестик
 * отмены. Здесь — стандартный приём библиотеки: три точки и выпадающее
 * меню, куда складывают всё, что может понадобиться.
 *
 * Опыт как раз про разницу. Меню дешевле для того, кто пишет: любое
 * новое действие добавляется строкой. И дороже для того, кто читает:
 * до отмены теперь два нажатия вместо одного, а что внутри — надо
 * открыть, чтобы узнать.
 */
export function FeedRowActions({ plate }: { plate: string }) {
  return (
    <DropdownMenu>
      {/* `render`, а не `asChild`: примитивы здесь из Base UI. */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={plate} />}
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>{hy.owner.clientHistory}</DropdownMenuItem>
        <DropdownMenuItem>{hy.common.edit}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">{hy.owner.cancelOrder}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
