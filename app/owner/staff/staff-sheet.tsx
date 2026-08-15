'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { archiveStaff, saveStaff, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatPhone } from '@/lib/phone';
import { hy } from '@/lib/i18n/hy';
import type { StaffPerson } from './model';

/**
 * Карточка сотрудника.
 *
 * Одна панель на весь список, а не своя у каждой строки: форма тут одна
 * и та же, а десять скрытых форм в разметке — это десять состояний,
 * которые надо держать согласованными без единой причины.
 *
 * Сверху результат — то, ради чего человека держат: сколько машин он
 * сделал за месяц и сколько на этом заработал. Ниже — данные, которые
 * правят, и отдельно от них доступ в систему.
 *
 * Разделение на «данные» и «доступ» не косметическое. Имя и процент —
 * договорённость между владельцем и работником, её меняют по разговору.
 * Телефон и PIN — ключ от кабинета: по ним человек входит, и смена
 * номера означает не исправление опечатки, а другого человека. Пока они
 * лежали в одной форме, между ними не было видно никакой разницы.
 *
 * PIN не показывается. Он хранится хешем, и достать его нельзя ни здесь,
 * ни где-либо ещё — это не ограничение интерфейса, а устройство продукта:
 * забытый код не восстанавливают, а назначают заново.
 */
export function StaffSheet({
  person,
  money,
  unitOne,
  onClose,
}: {
  /** кто открыт; `null` — панель закрыта */
  person: StaffPerson | null;
  money: (n: number) => string;
  unitOne: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStaff, null);

  /* Панель закрывается, когда сервер подтвердил запись. Состояние
     сверяется прямо в отрисовке, а не эффектом: эффект успел бы
     показать кадр с уже сохранённым, но ещё открытым окном. */
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
      subtitle={
        person
          ? person.present
            ? `${person.roleLabel} · ${hy.owner.onShiftNow}`
            : person.roleLabel
          : undefined
      }
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
          {/* Результат месяца. Он и есть ответ на вопрос, ради которого
              карточку открывают: что этот человек приносит. */}
          <div className="client-total">
            <span className="client-total-label">{hy.owner.payrollAccrued}</span>
            <span className="num client-total-value">{money(person.earned)}</span>
            <span className="num client-total-note">
              {person.count} {unitOne} · {hy.owner.periodMonth.toLocaleLowerCase('hy')}
            </span>
          </div>

          <dl className="facts mt-3.5">
            <div>
              <dt>{hy.settings.percent}</dt>
              <dd className="num">{person.percent}%</dd>
            </div>
            <div>
              <dt>{hy.owner.onShift}</dt>
              <dd>
                {person.present ? (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full dot-live" aria-hidden />
                    {person.since ? hy.today.since(person.since) : hy.owner.onShiftNow}
                  </span>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>{hy.owner.offShiftNow}</span>
                )}
              </dd>
            </div>
            {/* Долг называется, только когда он есть: «0 ֏ к выплате» —
                это не показание, а пустая строка на месте показания. */}
            {person.due > 0 && (
              <div>
                <dt>{hy.owner.toPay}</dt>
                <dd className="num">{money(person.due)}</dd>
              </div>
            )}
          </dl>

          {/* Ключом стоит человек: при переходе к другому поля обязаны
              сброситься, а не донести чужое имя и чужой процент. */}
          <form key={person.id} id="staff-edit" action={action} className="mt-4 grid gap-3">
            <input type="hidden" name="id" value={person.id} />

            <label className="grid gap-1.5">
              <span className="label">{hy.settings.name}</span>
              <input className="field" name="name" defaultValue={person.name} required autoFocus />
            </label>

            <label className="grid gap-1.5">
              <span className="label">{hy.settings.percent}</span>
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

            <p className="note">{hy.settings.percentNote}</p>
            {state?.error && <p className="alert">{state.error}</p>}
          </form>

          {/* Доступ в систему — отдельным разделом, а не полями формы.

              Телефон правке не подлежит: по нему человек входит, и смена
              номера — это уже другой человек. Раньше он стоял в шапке
              панели и читался наравне с полями, то есть выглядел полем,
              которое почему-то нельзя тронуть. */}
          <section className="mt-5">
            <h3 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>
              {hy.settings.access}
            </h3>

            <dl className="facts">
              <div>
                <dt>{hy.auth.phone}</dt>
                <dd className="num">{formatPhone(person.phone)}</dd>
              </div>
              <div>
                <dt>{hy.auth.pin}</dt>
                <dd style={{ color: 'var(--muted)' }}>{hy.settings.pinHidden}</dd>
              </div>
              <div>
                <dt>{hy.settings.role}</dt>
                <dd>{person.roleLabel}</dd>
              </div>
            </dl>

            <p className="note mt-3">{hy.settings.staffNote}</p>
          </section>

          <Link className="link-row mt-5" href="/owner/payroll">
            {hy.reports.toPayroll}
          </Link>

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
