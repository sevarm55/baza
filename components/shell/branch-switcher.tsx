'use client';

import { ChevronsUpDown, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { switchPoint } from '@/app/actions';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import type { Point } from '@/lib/accounts';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Переключатель филиалов: контекст данных, а не пункт навигации.
 *
 * Стоит в шапке рядом с названием страницы, потому что именно это он и
 * меняет: «Аршакуняц / Сегодня» читается как адрес того, на что
 * смотришь. Пока филиал один, на его месте стоит тихое название без
 * стрелки: человеку с одной мойкой не о чем переключаться.
 *
 * Список открывается компактным окном с клавиатурной навигацией; поиск
 * появляется только когда филиалов столько, что глазами искать дольше,
 * чем набрать. Переход идёт действием `switchPoint`: меняется подписанная
 * cookie, а не адрес, поэтому ссылкой это сделать нельзя.
 */
const SEARCH_FROM = 6;

export function BranchSwitcher({
  points,
  currentId,
  canManage = false,
  className,
}: {
  points: Point[];
  currentId: string;
  /** показывать ссылку на страницу филиалов (только владельцу) */
  canManage?: boolean;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const current = points.find((p) => p.id === currentId);
  const name = current?.name ?? t.points.title;

  const select = (id: string) => {
    if (id === currentId || pending) {
      setOpen(false);
      return;
    }
    setTarget(id);
    const data = new FormData();
    data.set('tid', id);
    startTransition(async () => {
      /* Service worker кэширует страницы по адресу, а адрес при смене
         точки не меняется: без сброса офлайн показал бы цифры прежней
         мойки под названием новой. */
      navigator.serviceWorker?.controller?.postMessage('bazis:switch');
      await switchPoint(data);
      setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${t.points.title}: ${name}`}
            aria-busy={pending || undefined}
            className={cn(
              'flex h-8 min-w-0 max-w-56 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-accent',
              className,
            )}
          />
        }
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            current?.canRead ? 'bg-success' : 'bg-warning',
          )}
        />
        <span className="truncate">{name}</span>
        {pending ? (
          <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-72 p-0">
        <Command>
          {points.length >= SEARCH_FROM && (
            <CommandInput placeholder={t.points.search} autoFocus />
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>{t.common.noResults}</CommandEmpty>
            <CommandGroup heading={t.points.title}>
              {points.map((point) => {
                const here = point.id === currentId;
                const busy = pending && target === point.id;
                return (
                  <CommandItem
                    key={point.id}
                    value={`${point.name} ${point.id}`}
                    onSelect={() => select(point.id)}
                    disabled={pending && !busy}
                    data-checked={here ? 'true' : undefined}
                    aria-current={here ? 'true' : undefined}
                    className="gap-2.5 py-1.5"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        point.canRead ? 'bg-success' : 'bg-warning',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{point.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {point.role === 'owner' ? t.roles.owner : t.roles.staff}
                        {point.canRead ? '' : ` · ${t.points.needsPayment}`}
                      </span>
                    </span>
                    {busy && <Spinner className="size-3.5 shrink-0" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {canManage && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__manage"
                    onSelect={() => {
                      setOpen(false);
                      router.push('/owner/points');
                    }}
                    className="gap-2.5 text-muted-foreground"
                  >
                    <Settings2 className="size-4" aria-hidden />
                    {t.points.manage}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Название бизнеса в шапке, когда переключать нечего. Тот же размер и
 * то же место, что у переключателя, только без стрелки и без реакции на
 * наведение: это подпись, а не кнопка.
 */
export function BranchLabel({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex h-8 min-w-0 max-w-56 items-center px-1 text-sm font-medium', className)}>
      <span className="truncate">{name}</span>
    </span>
  );
}
