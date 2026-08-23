'use client';

import Link from 'next/link';
import { Bell as BellIcon, ChevronRight, Clock3, Wallet } from 'lucide-react';
import { useState, useTransition } from 'react';

import { snoozeAlert } from '@/app/actions';
import { EmptyState } from '@/components/patterns/states';
import { EntitySheet } from '@/components/patterns/entity-sheet';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { Alert } from '@/lib/alerts';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Колокольчик владельца: список поводов, а не лента событий. У каждого
 * повода одно действие, и он гаснет, когда дело сделано. Цифра на
 * колокольчике — число поводов; нет поводов, нет цифры.
 */
export function Bell({ alerts }: { alerts: Alert[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [snoozing, setSnoozing] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="relative"
        onClick={() => setOpen(true)}
        aria-label={alerts.length > 0 ? `${t.alerts.title} · ${alerts.length}` : t.alerts.title}
      >
        <BellIcon aria-hidden="true" />
        {alerts.length > 0 && (
          <span className="num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
            {alerts.length}
          </span>
        )}
      </Button>

      <EntitySheet open={open} onOpenChange={setOpen} title={t.alerts.title}>
        {alerts.length === 0 ? (
          <EmptyState compact title={t.alerts.empty} description={t.alerts.emptyNote} />
        ) : (
          <ul className="-mx-5 divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.key} className="flex items-center gap-3 px-5 py-3">
                <Link
                  href={a.href}
                  onClick={() => setOpen(false)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
                      a.tone === 'warn'
                        ? 'bg-warning-soft text-warning-soft-foreground'
                        : 'bg-primary-soft text-primary',
                    )}
                  >
                    {a.key === 'payroll-due' ? <Wallet aria-hidden /> : <Clock3 aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.note}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-muted-foreground"
                  aria-busy={pending && snoozing === a.key}
                  aria-disabled={pending || undefined}
                  onClick={() => {
                    if (pending) return;
                    setSnoozing(a.key);
                    startTransition(() => snoozeAlert(a.key));
                  }}
                >
                  {pending && snoozing === a.key && <Spinner className="size-3" />}
                  {t.alerts.later}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </EntitySheet>
    </>
  );
}
