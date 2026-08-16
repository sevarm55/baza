'use client';

import { useActionState, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { archiveService, saveService, type FormState } from '@/app/actions';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { Sheet } from '@/components/sheet';
import { AddService } from './add-service';
import { ServiceFields } from './service-fields';
import { useT } from '@/lib/i18n/client';

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
 * Поэтому рядом с ценой стоит месяц: сколько раз услугу взяли и сколько
 * она принесла. Цена при этом остаётся тем, что здесь правят, и стоит
 * последней — там, где рука заканчивает читать строку.
 *
 * На широком экране это таблица, потому что здесь именно сравнивают
 * строки между собой; на телефоне сравнивать нечем, там читают строку за
 * строкой.
 *
 * Кнопки «добавить» в заголовке прибора больше нет: она стоит в
 * заголовке раздела, одна на страницу. Две одинаковые кнопки в двадцати
 * пикселях друг от друга заставляют выбирать между ними, хотя делают
 * они одно и то же.
 */
export function ServiceList({
  rows,
  step,
  currencySymbol,
}: {
  rows: ServiceRow[];
  step: number;
  currencySymbol: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const service = rows.find((r) => r.id === open) ?? null;

  if (rows.length === 0) {
    return (
      <Panel title={t.settings.services}>
        <EmptyState
          title={t.settings.servicesEmpty}
          note={t.settings.servicesEmptyNote}
          action={<AddService variant="cta" currencySymbol={currencySymbol} step={step} />}
        />
      </Panel>
    );
  }

  return (
    /* Без заголовка: прибор на странице один, и называет его сама
       страница. «Услуги и цены» под заголовком «Услуги» — это одно и то
       же слово, написанное дважды подряд, а счётчик стоит строкой выше
       в перечислении фактов. */
    <Panel>
      <div className="board-journal lg:hidden">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            aria-label={`${s.name} · ${t.common.edit}`}
            className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{s.name}</span>
              {s.count > 0 && (
                <span
                  className="num block truncate text-[12px]"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {s.count} {t.owner.timesShort} · {s.revenue}
                </span>
              )}
            </span>
            <span className="num shrink-0 text-[14px] font-semibold">
              {s.display} <span style={{ color: 'var(--board-muted)' }}>{currencySymbol}</span>
            </span>
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
            <th>{t.owner.colService}</th>
            <th className="end">{t.owner.timesShort}</th>
            <th className="end">{t.owner.revenue}</th>
            <th className="end">{t.settings.price}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            /* Без `role` и `tabIndex` на `<tr>`: с ними React молча
               бросает гидратацию поддерева. Клавиатуре служит настоящая
               кнопка в конце строки. */
            <tr key={s.id} className="row-click" onClick={() => setOpen(s.id)}>
              <td className="text-[15px] font-semibold">{s.name}</td>

              <td className="num end" style={{ color: 'var(--board-muted)' }}>
                {s.count || '—'}
              </td>

              <td className="num end" style={{ color: 'var(--board-muted)' }}>
                {s.count ? s.revenue : '—'}
              </td>

              <td className="num end text-[15px] font-semibold">
                {s.display} <span style={{ color: 'var(--board-muted)' }}>{currencySymbol}</span>
              </td>

              <td className="end">
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  aria-label={`${s.name} · ${t.common.edit}`}
                  style={{ color: 'var(--board-muted)' }}
                >
                  <ChevronRight className="size-3.5" aria-hidden />
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
    </Panel>
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
  const t = useT();
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
      footer={
        <>
          {/* Удаление тише сохранения и в другом углу: сюда пришли
              менять цену, а не убирать услугу. В списке этой кнопки нет
              вовсе — десять кнопок «убрать» в прейскуранте предлагали
              удалить там, где просто читают. */}
          <button form="service-remove" className="btn-inline btn-inline-danger me-auto">
            {t.settings.remove}
          </button>
          {/* Отмена рядом с сохранением, а не крестиком в углу: закрыть
              окно и не сохранить — такое же решение, как сохранить, и
              приниматься оно должно там же, где второе. */}
          <button type="button" className="btn-inline" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button form="service-edit" className="btn btn-auto" disabled={pending}>
            {pending ? t.common.loading : t.settings.save}
          </button>
        </>
      }
    >
      {service && (
        <>
          {/* Что эта услуга приносит — до того, как трогать её цену.
              Поднять на той, которую берут дважды в месяц, и на той,
              которую берут сорок раз, — разные решения. */}
          {service.count > 0 && (
            <dl className="facts">
              <div>
                <dt>{t.owner.timesShort}</dt>
                <dd className="num">{service.count}</dd>
              </div>
              <div>
                <dt>{t.owner.revenue}</dt>
                <dd className="num">{service.revenue}</dd>
              </div>
            </dl>
          )}

          {/* Ключом стоит услуга: при переходе к другой поля обязаны
              сброситься, а не донести чужое название и чужую цену. */}
          <form key={service.id} id="service-edit" action={action} className="mt-4 grid gap-3.5">
            <input type="hidden" name="id" value={service.id} />

            <ServiceFields
              idPrefix="service-edit"
              name={service.name}
              price={service.price}
              step={step}
              currencySymbol={currencySymbol}
              autoFocus
            />

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
