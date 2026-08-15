'use client';

import { createContext, useCallback, useContext, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  DICTS,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Dict,
  type Locale,
} from './index';

/**
 * Язык в браузере.
 *
 * В контексте лежит КОД языка, а не словарь: словарь — это объект с
 * функциями (`payroll.paySum(sum)`), а функции через границу серверного
 * компонента не проходят вовсе. Поэтому сервер передаёт сюда две буквы,
 * а сам словарь берётся на месте из `DICTS`.
 *
 * Все три словаря попадают в браузерный бандл — и это осознанная плата.
 * Ленивая подгрузка сэкономила бы десятки килобайт один раз за установку
 * приложения и взамен дала бы мигание чужим языком при каждом первом
 * рендере. Экран мойщика открывают сорок раз за смену, и мигать он не
 * должен.
 */
type Ctx = {
  locale: Locale;
  t: Dict;
  /** Переключить язык. Мгновенно и без перезагрузки страницы. */
  setLocale: (next: Locale) => void;
  /** Идёт ли сейчас переключение — на время него кнопки гасят. */
  switching: boolean;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [switching, startTransition] = useTransition();
  const current: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next) || next === current) return;

      /* Кука пишется прямо здесь, а не серверным действием: серверное
         действие — это запрос к серверу, и до его ответа интерфейс
         остался бы на старом языке. `SameSite=Lax` хватает: кука не
         секрет, а настройка вида. */
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.lang = next;

      /* `refresh()` перерисовывает серверные компоненты новым языком, не
         трогая состояние клиентских: открытый лист остаётся открытым,
         набранная сумма — набранной, прокрутка — на месте. Ни выхода из
         аккаунта, ни перезагрузки страницы. */
      startTransition(() => router.refresh());
    },
    [current, router],
  );

  const value = useMemo<Ctx>(
    () => ({ locale: current, t: DICTS[current], setLocale, switching }),
    [current, setLocale, switching],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  /* Провайдер стоит в корневой разметке, то есть выше всего, что
     рисуется. Если его вдруг нет — это сборка, а не язык: показываем
     армянский, но не роняем экран мойщика посреди смены. */
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    t: DICTS[DEFAULT_LOCALE],
    setLocale: () => {},
    switching: false,
  };
}

/** Словарь текущего языка. Основной способ получить строки в браузере. */
export function useT(): Dict {
  return useI18n().t;
}

/** Код языка — для дат, чисел и атрибута `lang`. */
export function useLocale(): Locale {
  return useI18n().locale;
}

/** Переключатель языка для настроек. */
export function useSetLocale(): { setLocale: (next: Locale) => void; switching: boolean } {
  const { setLocale, switching } = useI18n();
  return { setLocale, switching };
}
