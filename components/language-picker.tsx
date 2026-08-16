'use client';

import { Check, ChevronDown, Languages } from 'lucide-react';
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
            /* Тот же каркас строки, что у темы рядом (`.setting-row`):
               две соседние настройки в одном приборе, набранные разными
               размерами и с разными полями, читаются как детали из
               разных наборов. */
            <button type="button" disabled={switching} className="setting-row disabled:opacity-60">
              <span className="flex min-w-0 items-center gap-2.5">
                <Languages aria-hidden="true" className="size-4 shrink-0" />
                <span className="setting-row-label truncate">{t.common.language}</span>
              </span>
              {/* То, что стоит сейчас. Собственное имя языка, не код: «HY»
                  не читается никем, кроме нас. Рядом шеврон: без знака
                  строка не отличается от читаемой. */}
              <span className="flex items-center gap-1.5">
                <span className="setting-row-value truncate">{LOCALE_NAMES[locale]}</span>
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
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
