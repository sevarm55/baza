'use client';

import { useState, useTransition } from 'react';
import { signOut } from '@/app/actions';
import { IconPower } from '@/components/icons';
import { Sheet } from '@/components/sheet';
import { useT } from '@/lib/i18n/client';

/**
 * При выходе просим service worker выбросить кэш страниц.
 * На мойке один телефон часто ходит по рукам, и следующий сотрудник
 * не должен увидеть офлайн чужую смену.
 *
 * Значок без подписи — единственный на шапке, и подпись у него есть:
 * всплывающая на компьютере и озвучиваемая читалкой везде. Слово рядом
 * со значком заняло бы половину шапки телефона ради действия, которое
 * делают раз в день.
 */
function dropCache() {
  navigator.serviceWorker?.controller?.postMessage('bazis:signout');
}

export function SignOutButton({
  shiftOpen,
  labelled,
}: {
  shiftOpen?: boolean;
  /**
   * С подписью, а не одним значком.
   *
   * В шапке телефона значок один и место дорого — там подпись
   * всплывающая. В профиле, в разделе «аккаунт», у него есть и место, и
   * соседи: одинокая иконка питания среди строк настроек не читается
   * как выход, а слово рядом с ней, набранное текстом, ещё и не
   * нажимается — по нему в первую очередь и щёлкают.
   */
  labelled?: boolean;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  /* Обычный случай — форма. Она уходит и без JavaScript, а выход должен
     работать всегда: телефон, с которого не удаётся выйти, — это чужая
     смена в чужих руках. */
  if (!shiftOpen) {
    return (
      <form action={signOut} onSubmit={dropCache}>
        <button
          className={labelled ? 'btn-inline btn-inline-danger' : 'btn-icon btn-icon-board'}
          title={labelled ? undefined : t.auth.signOut}
          aria-label={labelled ? undefined : t.auth.signOut}
        >
          <IconPower className="size-4" />
          {labelled && t.auth.signOut}
        </button>
      </form>
    );
  }

  /* Смена открыта — выход не запрещаем, но объясняем. Смена живёт на
     сервере, телефон ей не нужен, и она закроется вечером сама. Молчать
     об этом нельзя: человек, вышедший из приложения, считает, что он
     ушёл с работы, а у владельца он остаётся на площадке. */
  return (
    <>
      <button
        type="button"
        className="btn-icon btn-icon-board"
        title={t.auth.signOut}
        aria-label={t.auth.signOut}
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        <IconPower className="size-4" />
      </button>

      <Sheet
        open={asking}
        onClose={pending ? () => {} : () => setAsking(false)}
        title={t.work.signOutOpenTitle}
        footer={
          <>
            <button
              type="button"
              className="btn-inline"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {t.work.endStay}
            </button>
            <button
              type="button"
              className="btn btn-auto"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  dropCache();
                  await signOut();
                })
              }
            >
              {pending ? t.common.loading : t.auth.signOut}
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-[1.6]" style={{ color: 'var(--muted)' }}>
          {t.work.signOutOpenNote}
        </p>
      </Sheet>
    </>
  );
}
