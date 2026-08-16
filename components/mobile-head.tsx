'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { phonePlace } from '@/components/mobile-place';
import { useT } from '@/lib/i18n/client';

/**
 * Шапка экрана на телефоне.
 *
 * Раньше здесь стояла одна и та же полоса на весь продукт: гамбургер,
 * знак, название бизнеса. Она отвечала на вопрос «чей это кабинет» —
 * тот единственный, который человек себе не задаёт: он открыл своё
 * приложение и знает, чьё оно. На вопросы «где я» и «как вернуться» она
 * не отвечала вовсе, и узнать раздел можно было, только открыв меню.
 *
 * Теперь шапок две, и выбирает между ними адрес.
 *
 *   корневой экран   →  знак, бизнес, имя, колокольчик;
 *   внутренний       →  стрелка назад и название раздела.
 *
 * Стрелка ведёт по адресу, а не в историю браузера. `history.back()`
 * возвращает туда, откуда пришли, — а пришли могли из уведомления, из
 * поиска, по ссылке из переписки, и тогда «назад» уводит из продукта
 * совсем. Родитель у раздела один и тот же всегда, откуда бы в него ни
 * зашли.
 */
export function MobileHead({
  brand,
  actions,
}: {
  /** левая часть корневого экрана: знак с названием или переключатель точек */
  brand: ReactNode;
  /** колокольчик и всё, что относится ко всему кабинету сразу */
  actions?: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const place = phonePlace(pathname, t);

  if (place.parent === null) {
    return (
      <header className="appbar">
        {brand}
        {actions && <div className="appbar-actions">{actions}</div>}
      </header>
    );
  }

  /* `appbar-inner` — не оформление, а признак для страницы под шапкой.
     Раздел уже назван здесь, и повторять его же крупным заголовком в
     начале полотна незачем: одно слово дважды подряд на экране в ладонь
     шириной съедает первый экран и ничего не сообщает. Прячет заголовок
     соседний селектор в globals.css — страница про шапку ничего не
     знает и знать не должна. */
  return (
    <header className="appbar appbar-inner">
      <Link href={place.parent} className="appbar-back" aria-label={t.common.back}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <span className="appbar-title">{place.title}</span>
      {actions && <div className="appbar-actions">{actions}</div>}
    </header>
  );
}
