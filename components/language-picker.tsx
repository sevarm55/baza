'use client';

import { Check, Languages } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';

/**
 * Выбор языка интерфейса.
 *
 * Строка, а не ряд из трёх кнопок: языков будет больше трёх раньше, чем
 * кажется, а ряд кнопок ломается уже на четвёртой. Слева — «Язык», справа
 * — то, что стоит сейчас, написанное на себе самом.
 *
 * Флагов здесь нет и не будет. Флаг — это страна, а не язык: русский
 * флаг для армянина, который выбирает русский интерфейс, говорит совсем
 * не то, что нужно сказать. Каждый язык подписан своим словом, потому
 * что человек, случайно попавший в чужой язык, ищет глазами СВОЁ слово,
 * а перевод чужого ему не помогает.
 *
 * Переключение мгновенное и без перезагрузки: открытый лист остаётся
 * открытым, набранная сумма — набранной. Выхода из аккаунта не
 * происходит, страница не меняется.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { setLocale, switching } = useSetLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          /* Два вида одной вещи. В настройках это строка «Язык — Русский»:
             там есть место и есть контекст. В шапке телефона места нет
             вовсе, и остаётся один значок рядом с переключателем темы —
             подпись для него читает только читалка экрана. */
          compact ? (
            <button
              type="button"
              disabled={switching}
              className="btn-icon btn-icon-board disabled:opacity-60"
              title={`${t.common.language}: ${LOCALE_NAMES[locale]}`}
              aria-label={`${t.common.language}: ${LOCALE_NAMES[locale]}`}
            >
              <Languages aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={switching}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-1 py-2 text-start disabled:opacity-60"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Languages aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate text-[15px]">{t.common.language}</span>
              </span>
              {/* То, что стоит сейчас. Собственное имя языка, не код: «HY»
                  не читается никем, кроме нас. */}
              <span className="truncate text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {LOCALE_NAMES[locale]}
              </span>
            </button>
          )
        }
      />
      <DropdownMenuContent align="end">
        {LOCALES.map((code: Locale) => (
          <DropdownMenuItem
            key={code}
            nativeButton
            render={
              <button
                type="button"
                className="w-full py-2 text-start"
                onClick={() => setLocale(code)}
              />
            }
          >
            {/* Галочка занимает место всегда, даже когда её нет: иначе
                строки разъезжаются влево-вправо при переключении. */}
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
