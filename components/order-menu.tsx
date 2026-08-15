'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Copy, Check, MoreVertical, UserRound, X } from 'lucide-react';
import { revokeOrder } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Действия над записью ленты.
 *
 * Раньше в конце строки стоял один крестик — отмена. Отмена нужна редко,
 * а занимала единственное место в строке; всё остальное, что владелец
 * хочет сделать с записью, делать было негде.
 *
 * Три точки собирают их в одном месте и в понятном порядке: сначала
 * безобидное (посмотреть машину, скопировать номер), в конце — то, что
 * трогает деньги. Отмена отделена чертой и подписана красным: в списке
 * из сорока строк промах по соседнему пункту не должен стоить записи.
 *
 * Запись при отмене не удаляется — она остаётся в истории и в аудите,
 * но перестаёт попадать в выручку и зарплату. Поэтому и спрашиваем.
 */
export function OrderMenu({ orderId, clientKey }: { orderId: string; clientKey?: string | null }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);

  /* Копируем двумя путями. `navigator.clipboard` требует и разрешения, и
     фокуса документа: в меню, которое само перехватывает фокус, он
     отказывает молча — пункт нажимается, ничего не происходит, и на вид
     он мёртвый. Старый `execCommand` работает без разрешений и без
     фокуса, поэтому остаётся запасным, а не единственным. */
  async function copyKey() {
    if (!clientKey) return;
    let ok = false;

    try {
      await navigator.clipboard.writeText(clientKey);
      ok = true;
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = clientKey;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(field);
        field.select();
        ok = document.execCommand('copy');
        field.remove();
      } catch {
        ok = false;
      }
    }

    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={t.owner.rowActions}
            aria-label={t.owner.rowActions}
            disabled={pending}
            /* `ms-auto`, а не выравнивание текста у ячейки: кнопка —
               блочный флекс, и `text-align: end` её не двигает. Без
               этого она вставала в тридцати пяти пикселях от правого
               края, тогда как первый столбец отступает от левого на
               десять, и таблица выглядела съехавшей вправо. */
            className="ms-auto flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted transition hover:bg-surface2 hover:text-ink data-open:bg-surface2 data-open:text-ink disabled:opacity-40"
          />
        }
      >
        {pending ? '…' : <MoreVertical className="size-4" aria-hidden />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
        {clientKey && (
          <>
            <DropdownMenuItem
              render={<Link href={`/owner/clients/${encodeURIComponent(clientKey)}`} />}
              className="py-2"
            >
              <UserRound aria-hidden />
              {t.owner.openClient}
            </DropdownMenuItem>

            <DropdownMenuItem className="py-2" onClick={copyKey} closeOnClick={false}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span className="num">{copied ? t.owner.copiedKey : clientKey}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
          </>
        )}

        {/* Подтверждение вторым нажатием, а не окном браузера.

            Системное `confirm` посреди меню выглядит как ошибка сайта, а
            не как вопрос продукта, и вдобавок гасит меню под собой.
            Здесь пункт сам превращается в вопрос: первое нажатие
            взводит, второе отменяет запись. Промахнуться мимо одного
            пункта дважды подряд трудно, а выйти из вопроса можно просто
            закрыв меню. */}
        <DropdownMenuItem
          variant="destructive"
          className="py-2"
          closeOnClick={armed}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              setTimeout(() => setArmed(false), 4000);
              return;
            }
            startTransition(async () => void (await revokeOrder(orderId)));
          }}
        >
          <X aria-hidden />
          {armed ? t.owner.confirmCancel : t.owner.cancelOrder}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
