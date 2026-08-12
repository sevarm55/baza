'use client';

import { useActionState, useState } from 'react';
import { archiveService, saveService, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { hy } from '@/lib/i18n/hy';

export type ServiceRow = {
  id: string;
  name: string;
  /** цена в крупных единицах — её и правят в поле */
  price: number;
  /** та же цена, но уже разбитая на разряды: её читают */
  display: string;
  /** сколько раз брали за этот месяц */
  count: number;
  /** сколько принесла за месяц, уже деньгами */
  revenue: string;
};

/**
 * Прейскурант.
 *
 * Был списком «название — цена»: он отвечал, сколько стоит, и молчал о
 * том, что из него берут. Цену правили вслепую — поднять на комплексе,
 * который заказывают дважды в месяц, это ничего, а поднять на мойке
 * кузова, которых сорок шесть, — совсем другие деньги.
 *
 * Теперь рядом с ценой стоит месяц: сколько раз услугу взяли и сколько
 * она принесла. На широком экране это таблица, потому что здесь именно
 * сравнивают строки между собой; на телефоне — строки, там сравнивать
 * нечем.
 *
 * Правка — панелью справа, как везде в кабинете: прейскурант остаётся
 * на месте, и видно, какую цену правишь среди прочих.
 */
export function ServicesTable({
  rows,
  step,
  currencySymbol,
}: {
  rows: ServiceRow[];
  step: number;
  currencySymbol: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const service = rows.find((r) => r.id === open) ?? null;

  return (
    <>
      <div className="board-journal lg:hidden">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{s.name}</span>
              {s.count > 0 && (
                <span className="num block truncate text-[12px]" style={{ color: 'var(--board-muted)' }}>
                  {s.count} · {s.revenue}
                </span>
              )}
            </span>
            <span className="num shrink-0 text-[14px] font-semibold">
              {s.display} <span style={{ color: 'var(--board-muted)' }}>{currencySymbol}</span>
            </span>
          </button>
        ))}
      </div>

      <table className="tbl hidden lg:table">
        <thead>
          <tr>
            <th>{hy.owner.colService}</th>
            <th className="end">{hy.owner.timesShort}</th>
            <th className="end">{hy.owner.revenue}</th>
            <th className="end">{hy.settings.price}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            /* Без `role` и `tabIndex` на `<tr>`: с ними React молча
               бросает гидратацию поддерева. Клавиатуре служит настоящая
               кнопка в конце строки. */
            <tr key={s.id} className="row-click" onClick={() => setOpen(s.id)}>
              <td className="font-medium">{s.name}</td>

              <td className="num end" style={{ color: 'var(--board-muted)' }}>
                {s.count || '—'}
              </td>

              <td className="num end" style={{ color: 'var(--board-muted)' }}>
                {s.count ? s.revenue : '—'}
              </td>

              <td className="num end font-semibold">
                {s.display} <span style={{ color: 'var(--board-muted)' }}>{currencySymbol}</span>
              </td>

              <td className="end">
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  aria-label={`${s.name} · ${hy.common.edit}`}
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

      <ServiceEditor
        service={service}
        step={step}
        currencySymbol={currencySymbol}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/**
 * Правка услуги.
 *
 * Одна панель на весь прейскурант, а не своя у каждой строки: форма тут
 * одна и та же, а десять скрытых форм в разметке — это десять состояний
 * без единой причины.
 */
function ServiceEditor({
  service,
  step,
  currencySymbol,
  onClose,
}: {
  service: ServiceRow | null;
  step: number;
  currencySymbol: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);

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
      open={service !== null}
      onClose={onClose}
      side
      title={service?.name ?? ''}
      subtitle={service && service.count > 0 ? `${service.count} · ${service.revenue}` : undefined}
      footer={
        <>
          {/* Удаление тише сохранения и в другом углу: сюда пришли
              менять цену, а не убирать услугу. В списке этой кнопки нет
              вовсе — десять кнопок «убрать» в прейскуранте предлагали
              удалить там, где просто читают. */}
          <button form="service-remove" className="btn-inline btn-inline-danger me-auto">
            {hy.settings.remove}
          </button>
          <button form="service-edit" className="btn btn-auto" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        </>
      }
    >
      {service && (
        <>
          {/* Ключом стоит услуга: при переходе к другой поля обязаны
              сброситься, а не донести чужое название и чужую цену. */}
          <form key={service.id} id="service-edit" action={action} className="grid gap-3">
            <input type="hidden" name="id" value={service.id} />

            <label className="grid gap-1.5">
              <span className="label">{hy.settings.name}</span>
              <input className="field" name="name" defaultValue={service.name} required autoFocus />
            </label>

            <label className="grid gap-1.5">
              <span className="label">{hy.settings.price}</span>
              <div className="relative">
                <input
                  className="field num !ps-8"
                  name="price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={step}
                  defaultValue={service.price}
                  required
                />
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                  {currencySymbol}
                </span>
              </div>
            </label>

            {state?.error && <p className="alert">{state.error}</p>}
          </form>

          <form key={`rm-${service.id}`} id="service-remove" action={archiveService} className="hidden">
            <input type="hidden" name="id" value={service.id} />
          </form>
        </>
      )}
    </Sheet>
  );
}
