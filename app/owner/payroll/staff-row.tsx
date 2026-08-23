'use client';

import { Fragment, useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { PersonAvatar } from '@/components/patterns/person';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { StaffEntry } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';

/** Ячейка компактной таблицы: одна геометрия на все дни. */
const CELL = 'px-4 py-2.5';

/** Сколько столбцов в таблице дня: столько же занимает строка разложения. */
const STAFF_COLUMNS = 6;

/**
 * Человек внутри рабочего дня.
 *
 * Одна строка таблицы, а не карточка с кнопкой во всю ширину: лист из
 * пяти человек должен читаться пятью фактами, а не пятью призывами
 * нажать. Слева направо ровно теми словами, которыми владелец думает:
 * «Валод, три машины, двадцать процентов, шесть с половиной тысяч, ещё
 * не отдавал». Нажимаемого в строке два предмета — флажок и «выплатить»;
 * всё остальное раскрывает разложение суммы по машинам.
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const owed = entry.earned > 0;
  const closed = !owed && entry.paid > 0;
  const lines = entry.lines;
  const facts = [unitCount(entry.count, unitOne, t.locale), entry.rate].filter(Boolean).join(' · ');

  return (
    <Fragment>
      <TableRow
        data-state={picked ? 'selected' : undefined}
        className={cn(
          'data-[state=selected]:bg-primary-soft/40',
          lines && 'cursor-pointer',
          closed && 'text-muted-foreground',
        )}
        onClick={
          lines
            ? (event) => {
                /* Флажок и кнопки делают своё; остальная строка — это
                   раскрытие. Иначе каждое нажатие на флажок разворачивало
                   бы разложение, которого не просили. Флажок Base UI —
                   не кнопка, а span с ролью, поэтому роль в списке. */
                if (!(event.target as HTMLElement).closest('button, a, label, input, [role=checkbox]')) {
                  setOpen((was) => !was);
                }
              }
            : undefined
        }
      >
        {/* Флажок у того, кому ещё должны; галка у того, с кем уже
            рассчитались. Одно место, два состояния — по нему день и
            читается сверху вниз, без чтения сумм. */}
        <TableCell className={`${CELL} w-10 pr-0`}>
          {onPick ? (
            <Checkbox
              checked={picked}
              disabled={busy}
              aria-label={`${entry.name} · ${money(entry.earned)}`}
              onCheckedChange={(on) => onPick(entry.key, on)}
            />
          ) : (
            <Check
              className={cn('size-4', closed ? 'text-success' : 'text-muted-foreground/50')}
              aria-hidden
            />
          )}
        </TableCell>

        <TableCell className={`${CELL} max-w-56`}>
          <span className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar name={entry.name} size="sm" />
            <span className="min-w-0">
              <span
                className={cn('block truncate', closed ? 'font-medium' : 'font-semibold text-foreground')}
              >
                {entry.name}
              </span>
              {/* На узком экране столбца с машинами нет: факты встают
                  второй строкой под именем, чтобы не потеряться. */}
              <span className="num block truncate text-xs text-muted-foreground md:hidden">{facts}</span>
            </span>
          </span>
        </TableCell>

        <TableCell className={`${CELL} num hidden text-muted-foreground md:table-cell`}>{facts}</TableCell>

        <TableCell className={`${CELL} num text-right`}>
          <span className={cn('block', owed && 'font-semibold text-foreground')}>
            {money(owed ? entry.earned : entry.paid)}
          </span>
          {/* Уже отданная часть дня — второй строкой под суммой: это про
              деньги, а не про действие. Сверху сколько осталось, под ним
              сколько ушло. */}
          {owed && entry.paid > 0 && (
            <span className="block text-xs font-normal text-muted-foreground">
              {t.payroll.alreadyPaid(money(entry.paid))}
            </span>
          )}
        </TableCell>

        <TableCell className={`${CELL} text-right`}>
          {owed ? (
            onPay ? (
              <Button size="xs" variant="outline" disabled={busy} onClick={() => onPay(entry.key)}>
                {t.payroll.pay}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t.payroll.unpaid}</span>
            )
          ) : closed ? (
            <span className="num text-xs text-muted-foreground" title={entry.paidNote ?? undefined}>
              {entry.paidAt}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t.payroll.unpaid}</span>
          )}
        </TableCell>

        <TableCell className="w-10 px-2 py-1.5">
          {lines && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={open}
              aria-controls={open ? detailsId : undefined}
              aria-label={`${t.payroll.details} · ${entry.name}`}
              onClick={() => setOpen((was) => !was)}
            >
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
            </Button>
          )}
        </TableCell>
      </TableRow>

      {/* Разложение суммы — ответ на вопрос «почему столько»: цена
          машины, ставка в момент записи и доля с неё. Ставка берётся из
          самой записи: после смены процента текущая её уже не объясняет. */}
      {lines && open && (
        <TableRow id={detailsId} className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={STAFF_COLUMNS} className="px-4 py-2">
            <ul className="flex flex-col pl-10 text-xs">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 py-1">
                  <span className="min-w-0 flex-1 truncate">{line.title}</span>
                  {/* Совместная мойка дописывает делитель: без него строка
                      «12 000 ֏ × 45 %» врёт на глазах. Процент общий на
                      команду, а получает человек свою часть фонда. */}
                  <span className="num whitespace-nowrap text-muted-foreground">
                    {money(line.price)} × {line.percent}%
                    {line.crew > 1 && ` ÷ ${line.crew}`}
                  </span>
                  <span className="num w-20 shrink-0 text-right font-semibold text-foreground">
                    {money(line.earned)}
                  </span>
                </li>
              ))}
            </ul>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
