'use client';

import { useState, useTransition } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { revokeOrder } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { useT } from '@/lib/i18n/client';
import { LoadingButton, TetrinMiniLoader } from '@/components/loading';

/**
 * Отмена ошибочной записи.
 *
 * В конце каждой строки стоял крестик. Из сорока записей за смену
 * отменяют одну, а крестик был в каждой — самый заметный предмет строки
 * и самый опасный: промах мокрым пальцем по строке из сорока стоил
 * записи и заработка за неё.
 *
 * Теперь на его месте три точки. Они ничего не делают сами и потому
 * молчат: одинаковые в каждой строке и приглушённые, как время рядом.
 * За ними — вопрос, называющий машину, услугу и сумму. Промахнуться
 * мимо строки можно; подтвердить чужую машину, прочитав её номер, — нет.
 *
 * Запись при этом не удаляется: она остаётся в истории и в аудите, но
 * перестаёт попадать в выручку и в заработок. Поэтому и слово в кнопке
 * «отменить», а не «удалить», — то же самое, что видит владелец.
 */
export function RevokeOrder({
  orderId,
  title,
  detail,
}: {
  orderId: string;
  /** чем строка называется: номер машины, а если его нет — услуга */
  title: string;
  /** услуга и сумма — то, по чему запись узнают во второй раз */
  detail: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="flex size-8 shrink-0 items-center justify-center rounded-[6px] transition aria-disabled:opacity-60"
        style={{ color: 'var(--board-muted)' }}
        title={t.work.rowActions}
        aria-label={`${t.work.rowActions}: ${title}`}
        /* Не `disabled`: выключенная кнопка гаснет до 40 процентов, и
           индикатор внутри неё становится почти не виден — то есть
           признак работы пропадает ровно тогда, когда он нужен. */
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        onClick={() => !pending && setAsking(true)}
      >
        {/* Три точки текстом читались как «меню», а не как «идёт»:
            многоточие в этом месте продукта означает продолжение, а не
            работу. Здесь та же волна, что в остальных кнопках. */}
        {pending ? <TetrinMiniLoader /> : <MoreHorizontal className="size-4" aria-hidden />}
      </button>

      <Sheet
        open={asking}
        onClose={pending ? () => {} : () => setAsking(false)}
        title={t.work.revokeTitle}
        footer={
          <>
            <button
              type="button"
              className="btn-inline"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {t.work.revokeKeep}
            </button>
            <LoadingButton
              type="button"
              className="btn btn-auto btn-bad"
              busy={pending}
              label={t.work.revoke}
              busyLabel={t.common.deleting}
              onClick={() =>
                startTransition(async () => {
                  await revokeOrder(orderId);
                  setAsking(false);
                })
              }
            />
          </>
        }
      >
        <div className="grid gap-2">
          {/* Сначала машина, потом всё остальное: подтверждают не
              «запись», а конкретный номер. */}
          <div className="num text-[19px] leading-none font-bold tracking-[-0.02em]">{title}</div>
          <div className="num text-[13.5px]" style={{ color: 'var(--muted)' }}>
            {detail}
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>
            {t.work.revokeNote}
          </p>
        </div>
      </Sheet>
    </>
  );
}
