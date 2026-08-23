'use client';

import { useState, useTransition } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { revokeOrder } from '@/app/actions';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';

/**
 * Отмена ошибочной записи.
 *
 * В конце строки стоят три тихие точки, а не крестик: из сорока записей
 * за смену отменяют одну, и самый заметный предмет строки не должен быть
 * самым опасным. За точками вопрос, называющий машину, услугу и сумму.
 * Промахнуться мимо строки можно; подтвердить чужую машину, прочитав её
 * номер, нет.
 *
 * Запись при этом не удаляется: она остаётся в истории и в аудите, но
 * перестаёт попадать в выручку и в заработок. Поэтому и слово в кнопке
 * «отменить», а не «удалить», то же самое, что видит владелец.
 */
export function RevokeOrder({
  orderId,
  title,
  detail,
}: {
  orderId: string;
  /** чем строка называется: номер машины, а если его нет, услуга */
  title: string;
  /** услуга и сумма: то, по чему запись узнают во второй раз */
  detail: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        title={t.work.rowActions}
        aria-label={`${t.work.rowActions}: ${title}`}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        <MoreHorizontal aria-hidden />
      </Button>

      {/* Сначала машина, потом всё остальное: подтверждают не «запись»,
          а конкретный номер. */}
      <ConfirmDialog
        open={asking}
        onOpenChange={(next) => !pending && setAsking(next)}
        title={t.work.revokeTitle}
        description={
          <>
            <span className="num font-medium text-foreground">{`${title} · ${detail}`}</span>
            <br />
            {t.work.revokeNote}
          </>
        }
        destructive
        busy={pending}
        cancelLabel={t.work.revokeKeep}
        confirmLabel={t.work.revoke}
        busyLabel={t.common.deleting}
        onConfirm={() =>
          startTransition(async () => {
            await revokeOrder(orderId);
            setAsking(false);
          })
        }
      />
    </>
  );
}
