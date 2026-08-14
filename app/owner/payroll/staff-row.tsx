'use client';

import { useId, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import type { StaffEntry } from './model';

/**
 * Человек внутри рабочего дня.
 *
 * Одна строка, а не карточка с кнопкой во всю ширину. Прежде под каждым
 * именем лежала лаймовая полоса «отметить выплаченным», и лист из пяти
 * человек читался пятью призывами нажать; кто из них сколько получит,
 * приходилось искать между кнопками.
 *
 * Читается строка слева направо ровно теми словами, которыми владелец
 * думает: «Валод, три машины, двадцать процентов, шесть с половиной
 * тысяч, ещё не отдавал». Нажимаемого в ней два предмета — флажок и
 * «выплатить»; всё остальное открывает разложение суммы по машинам.
 *
 * Закрытая строка приглушена, но не спрятана: полный итог рабочего дня
 * владельцу нужен целиком, иначе завтра он не вспомнит, отдал ли.
 */
export function StaffRow({
  entry,
  currency,
  unitOne,
  picked,
  onPick,
  onPay,
  busy,
}: {
  entry: StaffEntry;
  currency: string;
  unitOne: string;
  picked: boolean;
  /** пусто, когда платить нечего или некому */
  onPick: ((key: string, on: boolean) => void) | null;
  onPay: ((key: string) => void) | null;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const money = (n: number) => formatMoney(n, currency);
  const owed = entry.earned > 0;
  const closed = !owed && entry.paid > 0;
  const lines = entry.lines;

  return (
    <div>
      <div
        className={`pay-row${lines ? ' pay-row-open' : ''}`}
        data-on={picked ? '' : undefined}
        data-paid={closed ? '' : undefined}
        onClick={lines ? () => setOpen((was) => !was) : undefined}
      >
        {/* Флажок у того, кому ещё должны; галка у того, с кем уже
            рассчитались. Одно место, два состояния — по нему день и
            читается сверху вниз, без чтения сумм. */}
        {onPick ? (
          <label
            className="pay-pick"
            onClick={(event) => event.stopPropagation()}
            title={entry.name}
          >
            <input
              type="checkbox"
              checked={picked}
              disabled={busy}
              onChange={(event) => onPick(entry.key, event.target.checked)}
            />
            <span className="sr-only">{`${entry.name} · ${money(entry.earned)}`}</span>
          </label>
        ) : (
          <span className="pay-pick" aria-hidden>
            {closed ? (
              <Check className="size-4" style={{ color: 'var(--good-on-board)' }} />
            ) : (
              <span
                className="size-1.5 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--board-ink) 22%, transparent)' }}
              />
            )}
          </span>
        )}

        <span className="pay-who">
          {/* Цвет человека — тот же, что в ленте и на смене: кто это,
              читается по цвету раньше, чем по имени. */}
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span className="truncate">{entry.name}</span>
        </span>

        <span className="pay-facts">
          {entry.count} {unitOne}
          {entry.rate && ` · ${entry.rate}`}
        </span>

        <span className="pay-money">
          {money(owed ? entry.earned : entry.paid)}
          {/* Уже отданная часть дня — второй строкой под суммой, а не
              рядом с кнопкой. Рядом с кнопкой она была фразой в полстроки
              на месте, отведённом под одно слово: на телефоне надпись
              наезжала на «сколько машин», и обе становились нечитаемыми.
              Здесь же ей и место по смыслу — это про деньги, а не про
              действие: сверху сколько осталось, под ним сколько ушло. */}
          {owed && entry.paid > 0 && (
            <span className="pay-money-note">{hy.payroll.alreadyPaid(money(entry.paid))}</span>
          )}
        </span>

        <span className="pay-state">
          {owed ? (
            onPay ? (
              <button
                type="button"
                className="btn-inline"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onPay(entry.key);
                }}
              >
                {hy.payroll.pay}
              </button>
            ) : (
              <span>{hy.payroll.unpaid}</span>
            )
          ) : closed ? (
            <span className="pay-state-paid truncate" title={entry.paidNote ?? undefined}>
              {entry.paidAt}
            </span>
          ) : (
            <span>{hy.payroll.unpaid}</span>
          )}
        </span>

        {lines ? (
          <button
            type="button"
            className="chev"
            data-open={open ? '' : undefined}
            aria-expanded={open}
            aria-controls={id}
            aria-label={hy.payroll.details}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((was) => !was);
            }}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="chev" aria-hidden />
        )}
      </div>

      {/* Разложение суммы. Оно и есть ответ на вопрос «почему столько»:
          цена машины, ставка в момент записи и доля с неё. Ставка берётся
          из самой записи — после смены процента текущая её уже не
          объясняет. */}
      {lines && (
        <div className="pay-details" id={id} data-open={open ? '' : undefined}>
          <div>
            <div className="pb-2 ps-[2.45rem] pe-1">
              {lines.map((line) => (
                <div key={line.id} className="pay-line">
                  <span className="truncate">{line.title}</span>
                  <span className="whitespace-nowrap">
                    {money(line.price)} × {line.percent}%
                  </span>
                  <b>{money(line.earned)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
