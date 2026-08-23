'use client';

import { useState } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/patterns/data-table';
import { Panel } from '@/components/patterns/panel';
import { Person, PersonAvatar } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import { unitForms } from '@/lib/i18n/terms';
import { AddStaff } from './add-staff';
import { StaffSheet } from './staff-sheet';
import type { StaffPerson } from './model';

/**
 * Список людей.
 *
 * Строка отвечает целиком: кто, на смене ли он сейчас, по какой ставке,
 * сколько машин сделал за месяц и сколько на этом заработал. Телефона и
 * кода в строке нет — они ключ от кабинета, а не результат работы, и
 * живут в карточке отдельным разделом.
 *
 * Владелец — не строка этого списка: у него нет ни ставки, ни смены, ни
 * начислений, и в таблице сравнения он давал бы строку из прочерков.
 * Своей панелью он отвечает на другой вопрос — «под кем этот кабинет».
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

  const crew = rows.filter((p) => !p.owner);
  const owners = rows.filter((p) => p.owner);
  const editLabel = (p: StaffPerson) => `${p.name} · ${t.common.edit}`;

  if (crew.length === 0 && owners.length === 0) {
    return (
      <EmptyState
        title={t.settings.staffEmpty}
        description={t.settings.staffEmptyNote}
        action={<AddStaff staffRole={staffRole} />}
      />
    );
  }

  const columns: Column<StaffPerson>[] = [
    {
      key: 'person',
      header: t.settings.staff,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={p.name} size="sm" />
          <span className="truncate font-semibold">{p.name}</span>
          {/* Точка здесь означает состояние, а не человека: цвет
              человека уже стоит в кружке, а значок говорит, стоит ли он
              на мойке прямо сейчас. */}
          {p.present && (
            <StatusBadge tone="success" dot>
              {t.owner.onShiftNow}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: 'percent',
      header: t.settings.percent,
      align: 'right',
      hideBelow: 'sm',
      className: 'text-muted-foreground',
      cell: (p) => `${p.percent}%`,
    },
    {
      key: 'count',
      header: unitForms(unitOne, t.locale).many,
      align: 'right',
      hideBelow: 'md',
      className: 'text-muted-foreground',
      cell: (p) => (p.count > 0 ? String(p.count) : '—'),
    },
    {
      key: 'earned',
      header: t.owner.payrollAccrued,
      align: 'right',
      /* Начислено и долг в одной ячейке: их читают вместе — «за месяц
         сто тридцать пять, из них не отдано шесть». */
      cell: (p) => (
        <span className="flex flex-col items-end">
          <span className="font-semibold">{money(p.earned)}</span>
          {p.due > 0 && (
            <span className="text-xs text-warning">
              {t.owner.toPay.toLocaleLowerCase(t.locale)} {money(p.due)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t.common.edit}</span>,
      align: 'right',
      width: '3rem',
      className: 'py-1.5',
      cell: (p) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={editLabel(p)}
          onClick={() => setOpen(p.id)}
        >
          <Pencil />
        </Button>
      ),
    },
  ];

  return (
    <>
      {crew.length > 0 ? (
        <DataTable
          columns={columns}
          rows={crew}
          rowKey={(p) => p.id}
          rowLabel={editLabel}
          onRowClick={(p) => setOpen(p.id)}
        />
      ) : (
        <EmptyState
          title={t.settings.staffEmpty}
          description={t.settings.staffEmptyNote}
          action={<AddStaff staffRole={staffRole} />}
        />
      )}

      {/* Владелец отдельной панелью, без столбцов сравнения. Карточка
          открывается той же кнопкой: имя правят там же, где у остальных. */}
      {owners.length > 0 && (
        <Panel title={t.roles.owner} padded={false}>
          <div className="flex flex-col divide-y divide-border">
            {owners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen(p.id)}
                aria-label={editLabel(p)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Person
                  name={p.name}
                  note={<span className="num">{formatPhone(p.phone)}</span>}
                  className="flex-1"
                  right={
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  }
                />
              </button>
            ))}
          </div>
        </Panel>
      )}

      <StaffSheet person={person} money={money} unitOne={unitOne} onClose={() => setOpen(null)} />
    </>
  );
}
