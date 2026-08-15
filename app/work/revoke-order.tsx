'use client';

import { useState, useTransition } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { revokeOrder } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { hy } from '@/lib/i18n/hy';

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
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="flex size-8 shrink-0 items-center justify-center rounded-[6px] transition disabled:opacity-40"
        style={{ color: 'var(--board-muted)' }}
        title={hy.work.rowActions}
        aria-label={`${hy.work.rowActions}: ${title}`}
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        {pending ? '…' : <MoreHorizontal className="size-4" aria-hidden />}
      </button>

      <Sheet
        open={asking}
        onClose={pending ? () => {} : () => setAsking(false)}
        title={hy.work.revokeTitle}
        footer={
          <>
            <button
              type="button"
              className="btn-inline"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {hy.work.revokeKeep}
            </button>
            <button
              type="button"
              className="btn btn-auto btn-bad"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await revokeOrder(orderId);
                  setAsking(false);
                })
              }
            >
              {pending ? hy.common.loading : hy.work.revoke}
            </button>
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
            {hy.work.revokeNote}
          </p>
        </div>
      </Sheet>
    </>
  );
}
