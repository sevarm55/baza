'use client';

import { useActionState, useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { archiveService, saveService, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/loading';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { DataTable, type Column } from '@/components/patterns/data-table';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { EmptyState } from '@/components/patterns/states';
import { useT } from '@/lib/i18n/client';
import { AddService } from './add-service';
import { ServiceFields } from './service-fields';
import type { ServiceRow } from './model';

/**
 * Прейскурант.
 *
 * Список «название — цена» отвечал, сколько стоит, и молчал о том, что
 * из него берут. Цену правили вслепую: поднять на комплексе, который
 * заказывают дважды в месяц, это ничего, а поднять на мойке кузова,
 * которых сорок шесть, — совсем другие деньги. Поэтому рядом с ценой
 * стоит месяц: сколько раз услугу взяли и сколько она принесла.
 *
 * Цена при этом остаётся тем, что здесь правят, и стоит последней из
 * базовых колонок; классы, если они есть, идут за ней.
 */
export function ServiceList({
  rows,
  step,
  currencySymbol,
  tiers,
}: {
  rows: ServiceRow[];
  step: number;
  currencySymbol: string;
  /** классы бизнеса; пусто — ни колонок, ни ряда цен по классам в листе */
  tiers: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const service = rows.find((r) => r.id === open) ?? null;

  /* Состояние сохранения живёт здесь, а не в листе, хотя правят там.
     Лист закрывается, когда сервер подтвердил запись, а закрывает его
     этот список — здесь лежит `open`. Сверяем именно смену `state`, а не
     его удачность: иначе лист, открытый второй раз, захлопывался бы
     сразу — прошлый успех никуда не девается. */
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(null);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t.settings.servicesEmpty}
        description={t.settings.servicesEmptyNote}
        action={<AddService currencySymbol={currencySymbol} step={step} tiers={tiers} />}
      />
    );
  }

  const editLabel = (s: ServiceRow) => `${s.name} · ${t.common.edit}`;
  const priceCell = (display: string, muted = false) => (
    <span className={muted ? 'text-muted-foreground' : undefined}>
      {display} <span className="font-normal text-muted-foreground">{currencySymbol}</span>
    </span>
  );

  const columns: Column<ServiceRow>[] = [
    {
      key: 'name',
      header: t.owner.colService,
      cell: (s) => <span className="font-semibold">{s.name}</span>,
    },
    {
      key: 'count',
      header: t.owner.timesShort,
      align: 'right',
      hideBelow: 'sm',
      className: 'text-muted-foreground',
      cell: (s) => (s.count > 0 ? String(s.count) : '—'),
    },
    {
      key: 'revenue',
      header: t.owner.revenue,
      align: 'right',
      hideBelow: 'sm',
      className: 'text-muted-foreground',
      cell: (s) => (s.count > 0 ? s.revenue : '—'),
    },
    {
      key: 'price',
      header: t.settings.price,
      align: 'right',
      className: 'font-semibold',
      cell: (s) => priceCell(s.display),
    },
    /* По колонке на класс. Своей цены нет — стоит базовая, тише: так
       же это понимает форма («пустая клетка — как базовая»). */
    ...tiers.map(
      (tier, i): Column<ServiceRow> => ({
        key: `tier-${i}`,
        header: tier,
        align: 'right',
        hideBelow: 'md',
        cell: (s) => (s.tierPrices[i] > 0 ? priceCell(s.tierDisplay[i]) : priceCell(s.display, true)),
      }),
    ),
    {
      key: 'actions',
      header: <span className="sr-only">{t.common.edit}</span>,
      align: 'right',
      width: '3rem',
      className: 'py-1.5',
      cell: (s) => (
        <Button variant="ghost" size="icon-sm" aria-label={editLabel(s)} onClick={() => setOpen(s.id)}>
          <Pencil />
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        mobile={{
          /* Услуга и цена — единственное, ради чего в прейскурант
             смотрят. Цены по классам стоят под названием строкой:
             колонка на класс на трёхстах шестидесяти точках не
             помещается, а «Джип 5 500» рядом с «Седан 4 000»
             читается сразу. */
          title: (s) => (
            <span className="truncate text-[15.5px] font-semibold text-m-ink">{s.name}</span>
          ),
          note: (s) =>
            tiers.length > 0
              ? tiers
                  .map((tier, i) =>
                    `${tier} ${s.tierPrices[i] > 0 ? s.tierDisplay[i] : s.display}`,
                  )
                  .join(' · ')
              : s.count > 0
                ? `${t.owner.timesShort} ${s.count} · ${s.revenue}`
                : undefined,
          extra: (s) =>
            tiers.length > 0 && s.count > 0
              ? `${t.owner.timesShort} ${s.count} · ${s.revenue}`
              : undefined,
          value: (s) => (
            <span>
              {s.display}{' '}
              <span className="font-normal text-m-muted">{currencySymbol}</span>
            </span>
          ),
        }}
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        rowLabel={editLabel}
        onRowClick={(s) => setOpen(s.id)}
      />

      <ServiceEditor
        service={service}
        step={step}
        currencySymbol={currencySymbol}
        tiers={tiers}
        state={state}
        action={action}
        pending={pending}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/**
 * Правка услуги.
 *
 * Один лист на весь прейскурант, а не свой у каждой строки: форма тут
 * одна и та же, а десять скрытых форм в разметке — это десять состояний
 * без единой причины. Удаление тише сохранения и в другом углу: сюда
 * пришли менять цену, а не убирать услугу.
 */
function ServiceEditor({
  service,
  step,
  currencySymbol,
  tiers,
  state,
  action,
  pending,
  onClose,
}: {
  service: ServiceRow | null;
  step: number;
  currencySymbol: string;
  tiers: string[];
  /** состояние сохранения — из списка: он же и закрывает лист */
  state: FormState;
  action: (formData: FormData) => void;
  pending: boolean;
  onClose: () => void;
}) {
  const t = useT();

  /* Убрать из прайса: подтверждение отдельным окном, сама запись — тем
     же действием и с тем же полем `id`, что и раньше. */
  const [confirm, setConfirm] = useState(false);
  const [removing, startRemove] = useTransition();
  function remove(id: string) {
    startRemove(async () => {
      const fd = new FormData();
      fd.set('id', id);
      await archiveService(fd);
      setConfirm(false);
      onClose();
    });
  }

  return (
    <EntitySheet
      open={service !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={service?.name ?? ''}
      footer={
        <SheetActions
          start={
            <Button variant="destructive-soft" onClick={() => setConfirm(true)}>
              {t.settings.remove}
            </Button>
          }
        >
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <LoadingButton
            form="service-edit"
            busy={pending}
            label={t.settings.save}
            busyLabel={t.common.saving}
          />
        </SheetActions>
      }
    >
      {service && (
        <div className="flex flex-col gap-5">
          {/* Что эта услуга приносит — до того, как трогать её цену. */}
          {service.count > 0 && (
            <DetailList>
              <DetailRow label={t.owner.timesShort} value={String(service.count)} mono />
              <DetailRow label={t.owner.revenue} value={service.revenue} mono />
            </DetailList>
          )}

          {/* Ключом стоит услуга: при переходе к другой поля обязаны
              сброситься, а не донести чужое название и чужую цену. */}
          <form
            key={service.id}
            id="service-edit"
            action={action}
            onSubmit={(e) => {
              if (pending) e.preventDefault();
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="id" value={service.id} />

            <ServiceFields
              idPrefix="service-edit"
              name={service.name}
              price={service.price}
              tiers={tiers}
              tierPrices={service.tierPrices}
              step={step}
              currencySymbol={currencySymbol}
              autoFocus
            />

            {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
          </form>

          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            destructive
            title={t.settings.remove}
            description={t.settings.removeServiceNote}
            confirmLabel={t.settings.remove}
            busyLabel={t.common.deleting}
            busy={removing}
            onConfirm={() => remove(service.id)}
          >
            <p className="text-sm font-medium">
              {service.name} · <span className="num">{service.display}</span> {currencySymbol}
            </p>
          </ConfirmDialog>
        </div>
      )}
    </EntitySheet>
  );
}
