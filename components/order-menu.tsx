'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Copy, Check, MoreVertical, Users, UserRound, X } from 'lucide-react';
import { revokeOrder, saveOrderCrew } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { personColor } from '@/lib/person-color';
import { useT } from '@/lib/i18n/client';
import { LoadingButton, TetrinMiniLoader } from '@/components/loading';
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
export function OrderMenu({
  orderId,
  clientKey,
  crew = [],
  staff = [],
  teamPercent = null,
}: {
  orderId: string;
  clientKey?: string | null;
  /** кто мыл сейчас — этим открывается окно правки */
  crew?: { staffId: string | null }[];
  /** активные люди точки; пусто — правку не предлагаем */
  staff?: { id: string; name: string }[];
  /** общий процент команды; null — совместная работа выключена */
  teamPercent?: number | null;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);

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

  /* Правка состава предлагается, только когда ею можно что-то сделать:
     совместная работа включена и людей больше одного. У бизнеса без
     общего процента собрать бригаду не из чего, а у точки с одним
     человеком — не из кого. Пункт меню, который открывает окно с одним
     заранее отмеченным именем, читается как поломка. */
  const canEditCrew = teamPercent !== null && staff.length > 1;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={t.owner.rowActions}
            aria-label={t.owner.rowActions}
            aria-busy={pending || undefined}
            aria-disabled={pending || undefined}
            /* `ms-auto`, а не выравнивание текста у ячейки: кнопка —
               блочный флекс, и `text-align: end` её не двигает. Без
               этого она вставала в тридцати пяти пикселях от правого
               края, тогда как первый столбец отступает от левого на
               десять, и таблица выглядела съехавшей вправо. */
            className="ms-auto flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted transition hover:bg-surface2 hover:text-ink data-open:bg-surface2 data-open:text-ink aria-disabled:opacity-60"
          />
        }
      >
        {pending ? <TetrinMiniLoader /> : <MoreVertical className="size-4" aria-hidden />}
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

        {/* Изменить состав.

            Нужно ровно для одного случая, и он частый: мыли втроём, а
            записавший отметил двоих. Без правки третий остаётся без
            денег, а единственным выходом была бы отмена записи и
            повторный ввод — то есть потеря номера, услуги и места в
            ленте ради одной галочки.

            Стоит до черты, среди безобидного: правка состава ничего не
            стирает, она только перекладывает уже начисленное. */}
        {canEditCrew && (
          <DropdownMenuItem className="py-2" onClick={() => setEditing(true)}>
            <Users aria-hidden />
            {t.crew.edit}
          </DropdownMenuItem>
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

    {editing && (
      <CrewSheet
        orderId={orderId}
        title={clientKey ?? ''}
        staff={staff}
        current={crew.map((p) => p.staffId).filter((id): id is string => Boolean(id))}
        onClose={() => setEditing(false)}
      />
    )}
    </>
  );
}

/**
 * Кто работал над этой записью.
 *
 * Отмеченные — весь состав, а не «кого добавить»: правка состава это
 * ответ на вопрос «кто мыл», а не список поправок к прежнему ответу.
 * Поэтому окно открывается с уже отмеченными участниками, и снять
 * галочку так же легко, как поставить.
 *
 * Пустой состав сохранить нельзя. Машина, за которую не начислено
 * никому, деньгами не является ни для кого — она молча пропала бы из
 * ведомостей всех участников, и найти её потом было бы нечем.
 */
function CrewSheet({
  orderId,
  title,
  staff,
  current,
  onClose,
}: {
  orderId: string;
  title: string;
  staff: { id: string; name: string }[];
  current: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const state = await saveOrderCrew(orderId, chosen);
      if (state?.error) {
        setError(state.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      side
      title={t.crew.edit}
      subtitle={title || t.crew.editLead}
      footer={
        <>
          <button type="button" className="btn-inline" onClick={onClose}>
            {t.common.cancel}
          </button>
          <LoadingButton
            type="button"
            className="btn btn-auto"
            busy={pending}
            disabled={chosen.length === 0}
            label={t.common.save}
            busyLabel={t.common.saving}
            onClick={save}
          />
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {staff.map((s) => {
          const on = chosen.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className="pick"
              data-on={on ? '' : undefined}
              aria-pressed={on}
              onClick={() =>
                setChosen((cur) => (on ? cur.filter((id) => id !== s.id) : [...cur, s.id]))
              }
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: personColor(s.name) }}
                aria-hidden
              />
              <span className="pick-name">{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Что произойдёт после сохранения — до нажатия. Добавление
          человека делит тот же фонд на большее число, а не пересчитывает
          его по сегодняшней настройке: ставка уже лежит снимком в
          записи. Об этом стоит сказать заранее — иначе владелец ждёт,
          что зарплата вырастет вместе с бригадой. */}
      <p className="note mt-3.5">{t.crew.percentHint}</p>

      {error && <p className="alert mt-2.5">{error}</p>}
    </Sheet>
  );
}
