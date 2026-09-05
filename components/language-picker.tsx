'use client';

import { Check, ChevronDown, Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';

/**
 * Выбор языка интерфейса. Каждый язык подписан своим словом; флагов
 * нет: флаг это страна, а не язык. `compact` даёт один значок для
 * шапки, обычный вид показывает текущий язык словом.
 *
 * Цвет наследует и потому принимает `className`: в шапке витрины значок
 * стоит на тёмном кадре при любой теме и красится не `--foreground`, а
 * тем, что ему передали. В кабинете `className` не нужен вовсе.
 */
export function LanguagePicker({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const { setLocale, switching } = useSetLocale();
  const title = `${t.common.language}: ${LOCALE_NAMES[locale]}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          compact ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={className}
              aria-busy={switching || undefined}
              aria-disabled={switching || undefined}
              title={title}
              aria-label={title}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={className}
              aria-busy={switching || undefined}
              aria-disabled={switching || undefined}
            />
          )
        }
      >
        {switching ? <Spinner /> : <Languages aria-hidden="true" />}
        {!compact && (
          <>
            <span>{LOCALE_NAMES[locale]}</span>
            <ChevronDown data-icon="inline-end" aria-hidden="true" className="text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((code: Locale) => (
          <DropdownMenuItem
            key={code}
            nativeButton
            render={
              <button type="button" className="w-full text-start" onClick={() => setLocale(code)} />
            }
          >
            {code === locale ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <span aria-hidden="true" className="size-4" />
            )}
            {LOCALE_NAMES[code]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
