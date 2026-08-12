'use client';

import { useActionState, useState } from 'react';
import { archiveStaff, saveStaff, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatPhone } from '@/lib/phone';
import { personColor } from '@/lib/person-color';
import { hy } from '@/lib/i18n/hy';

export type StaffPerson = {
  id: string;
  name: string;
  phone: string;
  percent: number;
  roleLabel: string;
  /** себя отключить нельзя — владелец потеряет доступ в кабинет */
  canRemove: boolean;
  /** стоит ли он на мойке прямо сейчас */
  present: boolean;
  /** машин за этот месяц */
  count: number;
  /** заработано за месяц, уже деньгами */
  earned: string;
};

/**
 * Люди списком.
 *
 * Была страница-справочник: имя, телефон, процент — и всё. Она отвечала,
 * кто заведён, и молчала о том, ради чего этих людей держат; за этим
 * владелец шёл на сводку и в зарплаты, а вернувшись, не помнил, у кого
 * какой процент.
 *
 * Теперь рядом с человеком стоит месяц: сколько машин он сделал и
 * сколько на этом заработал. На широком экране это таблица, потому что
 * здесь именно сравнивают — у кого больше машин, у кого выше ставка; на
 * телефоне сравнивать нечем, там читают строку за строкой.
 *
 * Правка — панелью справа, как карточка машины и расход: список
 * остаётся на месте, и видно, кого правишь среди прочих.
 */
export function StaffTable({ rows, unit }: { rows: StaffPerson[]; unit: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const person = rows.find((r) => r.id === open) ?? null;

  return (
    <>
      {/* Телефон: строками. */}
      <div className="board-journal lg:hidden">
        {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p.id)}
            className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: personColor(p.name) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[14.5px] font-semibold">{p.name}</span>
                {p.present && <span className="tag-good">{hy.owner.onShift}</span>}
              </span>
              <span className="num block truncate text-[12px]" style={{ color: 'var(--board-muted)' }}>
                {formatPhone(p.phone)} · {p.roleLabel}
              </span>
            </span>

            <span className="shrink-0 text-end">
              <span className="num block text-[14px] font-semibold">{p.earned}</span>
              <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                {p.count} · {p.percent} %
              </span>
            </span>
          </button>
        ))}
      </div>

      <table className="tbl hidden lg:table">
        <thead>
          <tr>
            <th>{hy.settings.staff}</th>
            <th>{hy.auth.phone}</th>
            <th className="end">{hy.owner.tabPayroll}</th>
            <th className="end">{hy.settings.percent}</th>
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
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: personColor(p.name) }}
                    aria-hidden
                  />
                  <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  {p.present && <span className="tag-good">{hy.owner.onShift}</span>}
                </span>
              </td>

              <td className="num" style={{ color: 'var(--board-muted)' }}>
                {formatPhone(p.phone)} · {p.roleLabel}
              </td>

              {/* Деньги и машины в одной ячейке: читают их вместе — «за
                  сорок шесть машин сто тридцать пять тысяч», — и
                  разнесённые по столбцам они заставляли глаз ходить
                  туда-обратно. */}
              <td className="num end">
                <span className="block font-semibold">{p.earned}</span>
                <span className="block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                  {p.count} {unit}
                </span>
              </td>

              <td className="num end" style={{ color: 'var(--board-muted)' }}>
                {p.percent} %
              </td>

              <td className="end">
                <button
                  type="button"
                  onClick={() => setOpen(p.id)}
                  aria-label={`${p.name} · ${hy.common.edit}`}
                  style={{ color: 'var(--board-muted)' }}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m6.5 4 4 4-4 4" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <StaffEditor person={person} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * Правка человека.
 *
 * Одна панель на весь список, а не своя у каждой строки: форма тут одна
 * и та же, а сорок скрытых форм в разметке — это сорок состояний,
 * которые надо держать синхронными без единой причины.
 */
function StaffEditor({ person, onClose }: { person: StaffPerson | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStaff, null);

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) onClose();
  }

  return (
    <Sheet
      open={person !== null}
      onClose={onClose}
      side
      title={person?.name ?? ''}
      /* Телефон правке не подлежит: по нему человек входит, и смена
         номера — это уже другой человек. Стоит в шапке, а не в теле
         формы: там он читался наравне с полями и выглядел полем,
         которое почему-то нельзя тронуть. */
      subtitle={person ? formatPhone(person.phone) : undefined}
      footer={
        <>
          {person?.canRemove && (
            <button form="staff-remove" className="btn-inline btn-inline-danger me-auto">
              {hy.settings.remove}
            </button>
          )}
          <button form="staff-edit" className="btn btn-auto" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        </>
      }
    >
      {person && (
        <>
          {/* Ключом стоит человек: при переходе к другому поля обязаны
              сброситься, а не донести чужое имя и чужой процент. */}
          <form key={person.id} id="staff-edit" action={action} className="grid gap-3">
            <input type="hidden" name="id" value={person.id} />

            <label className="grid gap-1.5">
              <span className="label">{hy.settings.name}</span>
              <input className="field" name="name" defaultValue={person.name} required autoFocus />
            </label>

            <label className="grid gap-1.5">
              <span className="label">
                {hy.settings.percent} · {person.roleLabel}
              </span>
              <div className="relative">
                {/* Знак слева, как «+374» у телефона и как в форме найма:
                    два окна об одном и том же не должны выглядеть
                    по-разному. */}
                <input
                  className="field num !ps-8"
                  name="percent"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  defaultValue={person.percent}
                  required
                />
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                  %
                </span>
              </div>
            </label>

            {state?.error && <p className="alert">{state.error}</p>}
          </form>

          {/* Форма удаления пустая и скрытая: её кнопка стоит в подвале
              окна и связана с ней атрибутом `form`. Вкладывать одну форму
              в другую нельзя, а поднимать всю форму в подвал незачем — в
              HTML для этого и есть связь по идентификатору. */}
          {person.canRemove && (
            <form key={`rm-${person.id}`} id="staff-remove" action={archiveStaff} className="hidden">
              <input type="hidden" name="id" value={person.id} />
            </form>
          )}
        </>
      )}
    </Sheet>
  );
}
