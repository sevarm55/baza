'use client';

import { switchPoint } from '@/app/actions';

/**
 * Форма перехода на другую точку.
 *
 * Клиентская ровно ради одной строки: попросить service worker выбросить
 * кэш страниц. Он кладёт переходы по АДРЕСУ, а адрес при смене точки не
 * меняется — `/owner` остаётся `/owner`. Без сброса человек, оставшись
 * без связи, увидел бы выручку прежней мойки под названием новой и
 * поверил бы ей: цифры выглядят настоящими, потому что настоящие и есть,
 * только не те.
 *
 * Та же строка стоит на выходе из аккаунта — по той же причине.
 */
export function PointForm({ tid, children }: { tid: string; children: React.ReactNode }) {
  return (
    <form
      action={switchPoint}
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage('bazis:switch');
      }}
    >
      <input type="hidden" name="tid" value={tid} />
      {children}
    </form>
  );
}
