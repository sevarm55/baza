'use client';

import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { enUS, hy, ru } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale, useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

const DF_LOCALE = { hy, ru, en: enUS } as const;

function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDay(s: string | null | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Выбор отрезка дат: кнопка с текущим отрезком, календарь в окне,
 * «Применить». Выбор живёт в адресе, поэтому наружу уходят строки
 * `YYYY-MM-DD`, а не объекты Date: их собирает страница в поясе
 * бизнеса. Будущие дни недоступны: будущих машин не бывает.
 */
export function DateRangePicker({
  from,
  to,
  active = false,
  onApply,
  className,
}: {
  from?: string | null;
  to?: string | null;
  /** этот режим выбран сейчас: кнопка выглядит как выбранный сегмент */
  active?: boolean;
  onApply: (from: string, to: string) => void;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: fromDay(from),
    to: fromDay(to),
  }));

  const label =
    active && from && to
      ? `${formatShort(from, locale)} — ${formatShort(to, locale)}`
      : t.reports.pickRange;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRange({ from: fromDay(from), to: fromDay(to) });
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            className={cn('num', className)}
            aria-pressed={active}
          />
        }
      >
        <CalendarDays data-icon="inline-start" aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={setRange}
          locale={DF_LOCALE[locale]}
          disabled={{ after: new Date() }}
          defaultMonth={range?.from ?? new Date()}
        />
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!range?.from}
            onClick={() => {
              if (!range?.from) return;
              onApply(toDay(range.from), toDay(range.to ?? range.from));
              setOpen(false);
            }}
          >
            {t.reports.apply}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** «23.08» из `YYYY-MM-DD`: для подписи на кнопке. */
function formatShort(day: string, locale: string): string {
  const d = fromDay(day);
  if (!d) return day;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}
