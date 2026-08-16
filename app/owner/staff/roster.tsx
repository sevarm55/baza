'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/money';
import { AddStaff } from './add-staff';
import { StaffSheet } from './staff-sheet';
import type { StaffPerson } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount, unitForms } from '@/lib/i18n/terms';

/**
 * Список людей.
 *
 * Была страница-справочник: имя, телефон, процент — и всё. Она отвечала,
 * кто заведён, и молчала о том, ради чего этих людей держат; за этим
 * владелец шёл на сводку и в зарплаты, а вернувшись, не помнил, у кого
 * какой процент.
 *
 * Теперь строка отвечает целиком: кто, на смене ли он сейчас, сколько
 * машин сделал за месяц, сколько на этом заработал и по какой ставке.
 * Телефона и кода в строке нет — они ключ от кабинета, а не результат
 * работы, и живут в карточке отдельным разделом.
 *
 * Точка слева — состояние, а не опознавательный знак: зелёная значит
 * «стоит на мойке прямо сейчас». Цветом человека помечено имя — тот же
 * цвет, что в ленте, во дворе и на зарплатах.
 *
 * На широком экране это таблица, потому что здесь именно сравнивают —
 * у кого больше машин, у кого выше ставка; на телефоне сравнивать нечем,
 * там читают строку за строкой.
 */
export function StaffRoster({
  rows,
  currency,
  unitOne,
  staffRole,
}: {
  rows: StaffPerson[];
  currency: string;
  unitOne: string;
  staffRole: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const person = rows.find((r) => r.id === open) ?? null;
  const money = (n: number) => formatMoney(n, currency, t.locale);

  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState
          title={t.settings.staffEmpty}
          note={t.settings.staffEmptyNote}
          action={<AddStaff staffRole={staffRole} variant="cta" />}
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel title={t.settings.staff} count={rows.length}>
        {/* Телефон: строками. */}
        <div className="board-journal lg:hidden">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(p.id)}
              className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
              aria-label={`${p.name} · ${t.common.edit}`}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${p.present ? 'dot-live' : 'dot-idle'}`}
                aria-label={p.present ? t.owner.onShiftNow : undefined}
                aria-hidden={p.present ? undefined : true}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-semibold">{p.name}</span>
                  {p.owner && <span className="tag">{p.roleLabel}</span>}
                </span>
                <span
                  className="num block truncate text-[12px]"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {unitCount(p.count, unitOne, t.locale)} · {p.percent}%
                  {p.due > 0 && ` · ${t.owner.toPay.toLocaleLowerCase(t.locale)} ${money(p.due)}`}
                </span>
              </span>

              <span className="num shrink-0 text-[14px] font-semibold">{money(p.earned)}</span>
              <ChevronRight
                className="size-3.5 shrink-0"
                style={{ color: 'var(--board-muted)' }}
                aria-hidden
              />
            </button>
          ))}
        </div>

        <table className="tbl hidden lg:table">
          <thead>
            <tr>
              <th>{t.settings.staff}</th>
              <th className="end">{unitForms(unitOne, t.locale).many}</th>
              <th className="end">{t.owner.payrollAccrued}</th>
              <th className="end">{t.settings.percent}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              /* Без `role` и `tabIndex` на `<tr>`: с ними React молча
                 бросает гидратацию всего поддерева, и таблица остаётся
                 мёртвой разметкой. Клавиатуре служит настоящая кнопка в
                 конце строки. */
              <tr key={p.id} className="row-click" onClick={() => setOpen(p.id)}>
                <td>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* Точка здесь означает состояние, а не человека.

                        Цвет человека — опознавательный знак, он стоит в
                        ленте и во дворе, где имён нет. Здесь имя написано
                        целиком, а вопрос другой: стоит ли он на мойке
                        прямо сейчас. Две точки подряд отвечали бы на два
                        вопроса сразу и не отвечали ни на один. */}
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        p.present ? 'dot-live' : 'dot-idle'
                      }`}
                      aria-label={p.present ? t.owner.onShiftNow : undefined}
                      aria-hidden={p.present ? undefined : true}
                    />
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {/* Метки «на смене» здесь больше нет: слева от имени
                        уже горит зелёная точка, и она означает ровно это.
                        Точка и слово рядом — один ответ, записанный
                        дважды, и вместе они весят больше самого имени. */}
                    {p.owner && <span className="tag">{p.roleLabel}</span>}
                  </span>
                </td>

                <td className="num end" style={{ color: 'var(--board-muted)' }}>
                  {p.count || '—'}
                </td>

                {/* Начислено и долг в одной ячейке: их читают вместе —
                    «за месяц сто тридцать пять, из них не отдано шесть», —
                    и разнесённые по столбцам они гоняют глаз
                    туда-обратно. */}
                <td className="num end">
                  <span className="block font-semibold">{money(p.earned)}</span>
                  {p.due > 0 && (
                    <span className="block text-[12px]" style={{ color: 'var(--warn-on-board)' }}>
                      {t.owner.toPay.toLocaleLowerCase(t.locale)} {money(p.due)}
                    </span>
                  )}
                </td>

                <td className="num end" style={{ color: 'var(--board-muted)' }}>
                  {p.percent} %
                </td>

                <td className="end">
                  <button
                    type="button"
                    onClick={() => setOpen(p.id)}
                    aria-label={`${p.name} · ${t.common.edit}`}
                    style={{ color: 'var(--board-muted)' }}
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <StaffSheet person={person} money={money} unitOne={unitOne} onClose={() => setOpen(null)} />
    </>
  );
}
