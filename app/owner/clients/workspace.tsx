'use client';

import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/patterns/data-table';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { ResetFilters, SearchInput, Toolbar } from '@/components/patterns/toolbar';
import { compactClientKey } from '@/lib/client-key';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { ClientSheet } from './client-sheet';
import type { ClientGroup, ClientRow, ClientSort } from './model';

/**
 * Клиентская база: кто это, кто возвращается и что с этим делать.
 *
 * Клиентский компонент из-за поиска. Отбор через адрес перезагружал бы
 * страницу на каждой букве, а клиентов на мойке сотни, но не сотни
 * тысяч: они уже все здесь, и фильтровать их на месте дешевле, чем
 * спрашивать сервер.
 *
 * Отбор и порядок — две разные вещи. Порядок отвечает «кто наверху»,
 * отбор — «кого показывать». Здесь это группы в переключателе и порядок
 * в выпадающем списке рядом с поиском.
 *
 * Группы не выдуманы: «новый» — один визит, «свой» — больше одного,
 * «пропал» — та же граница, по которой загорается колокольчик.
 */
export function ClientsWorkspace({
  rows,
  lostAfter,
  currency,
  initialGroup = 'all',
}: {
  rows: ClientRow[];
  lostAfter: number;
  /* Валюта строкой, а не готовые суммы: карточка тоже считает деньги, а
     передать ей функцию через границу сервер-клиент нельзя. */
  currency: string;
  /** группа, открытая сразу: сюда приводит колокольчик и полоса показаний */
  initialGroup?: ClientGroup;
}) {
  const t = useT();

  /* Порядок строится внутри компонента, а не рядом с файлом: подписи
     берутся из словаря, а он у каждого языка свой. */
  const SORTS: { key: ClientSort; label: string }[] = [
    { key: 'recent', label: t.owner.sortRecent },
    { key: 'often', label: t.owner.sortOften },
    { key: 'richest', label: t.owner.sortRichest },
  ];
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ClientGroup>(initialGroup);
  const [sort, setSort] = useState<ClientSort>('recent');
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);

  const counts = {
    all: rows.length,
    fresh: rows.filter((c) => c.visits === 1).length,
    loyal: rows.filter((c) => c.visits > 1).length,
    lost: rows.filter((c) => c.days > lostAfter).length,
  };

  /* Пробелы, дефисы и регистр не в счёт: номер диктуют вслух и
     записывают как придётся. Приводим тем же `compactClientKey`, которым
     запись ложится в базу: правило одно, поэтому и функция одна. Ищем и
     по имени с телефоном: раз владелец их вписал, он будет искать
     человека так, как его помнит. */
  const found = useMemo(() => {
    const q = compactClientKey(query);
    const base = rows.filter((r) => {
      if (group === 'fresh' && r.visits !== 1) return false;
      if (group === 'loyal' && r.visits < 2) return false;
      if (group === 'lost' && r.days <= lostAfter) return false;
      if (!q) return true;
      return [r.key, r.name ?? '', r.phone ?? ''].some((v) => compactClientKey(v).includes(q));
    });

    const sorted = [...base];
    if (sort === 'recent') sorted.sort((a, b) => a.days - b.days);
    if (sort === 'often') sorted.sort((a, b) => b.visits - a.visits);
    if (sort === 'richest') sorted.sort((a, b) => b.total - a.total);
    return sorted;
  }, [rows, query, sort, group, lostAfter]);

  const activeFilters = (query ? 1 : 0) + (group !== 'all' ? 1 : 0);
  const openLabel = (c: ClientRow) => `${c.key} · ${t.owner.clientHistory}`;

  const columns: Column<ClientRow>[] = [
    {
      key: 'key',
      header: t.owner.tabClients,
      cell: (c) => {
        const contact = contactLine(c.name, c.phone);
        return (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="num truncate font-semibold">{c.key}</span>
              {c.visits > 1 && <StatusBadge tone="brand">{t.owner.clientLoyal}</StatusBadge>}
            </span>
            {contact && <span className="num truncate text-xs text-muted-foreground">{contact}</span>}
          </span>
        );
      },
    },
    {
      key: 'visits',
      header: t.owner.visits,
      align: 'right',
      hideBelow: 'sm',
      className: 'text-muted-foreground',
      sortValue: (c) => c.visits,
      cell: (c) => String(c.visits),
    },
    {
      key: 'avg',
      header: t.owner.clientAvg,
      align: 'right',
      hideBelow: 'md',
      className: 'text-muted-foreground',
      cell: (c) => money(c.avg),
    },
    {
      key: 'total',
      header: t.owner.clientsTotalSpent,
      align: 'right',
      className: 'font-semibold',
      sortValue: (c) => c.total,
      cell: (c) => money(c.total),
    },
    {
      key: 'last',
      header: t.owner.lastVisit,
      align: 'right',
      /* Сортировка по дням: меньше дней — свежее. */
      sortValue: (c) => c.days,
      /* «վերջինը՝» обязательно: без него «3 օր առաջ» рядом с числом
         визитов читается чем угодно. Пропавший — тоном тревоги. */
      cell: (c) => (
        <span
          className={cn(
            'whitespace-nowrap',
            c.days > lostAfter ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
        >
          {t.owner.lastVisitPrefix} {c.last}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t.owner.clientHistory}</span>,
      align: 'right',
      width: '3rem',
      className: 'py-1.5',
      cell: (c) => (
        <Button variant="ghost" size="icon-sm" aria-label={openLabel(c)} onClick={() => setOpen(c.key)}>
          <History />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        end={
          <ResetFilters
            count={activeFilters}
            onReset={() => {
              setQuery('');
              setGroup('all');
            }}
          />
        }
      >
        <SearchInput numeric value={query} onChange={setQuery} placeholder={t.owner.clientsSearch} />

        <Segmented
          current={group}
          onSelect={(key) => setGroup(key as ClientGroup)}
          label={t.owner.tabClients}
          items={[
            { key: 'all', label: t.owner.allClients, count: counts.all },
            { key: 'loyal', label: t.owner.clientsLoyal, count: counts.loyal },
            { key: 'fresh', label: t.owner.clientsFresh, count: counts.fresh },
            { key: 'lost', label: t.owner.clientsLost, count: counts.lost },
          ]}
        />

        {/* Порядок рядом с поиском, а не отдельной полосой: обе настройки
            относятся к одному списку и меняются вместе. */}
        <Select
          value={sort}
          onValueChange={(value) => {
            if (value) setSort(value as ClientSort);
          }}
          items={SORTS.map((s) => ({ value: s.key, label: s.label }))}
        >
          <SelectTrigger aria-label={t.owner.sortRecent}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      {found.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? t.owner.clientsEmpty
              : query
                ? t.owner.clientsNotFound
                : t.common.noResults
          }
          description={rows.length === 0 ? t.owner.clientsEmptyNote : undefined}
        />
      ) : (
        /* Ключом стоит порядок из списка: смена порядка сбрасывает
           сортировку по заголовку, иначе два порядка спорили бы, чей
           верх. */
        <DataTable
          key={sort}
          columns={columns}
          rows={found}
          rowKey={(c) => c.id}
          rowLabel={openLabel}
          onRowClick={(c) => setOpen(c.key)}
        />
      )}

      <ClientSheet plate={open} onClose={() => setOpen(null)} money={money} lostAfter={lostAfter} />
    </div>
  );
}

/**
 * «Արամ · +374 77 445 566» — то, что владелец вписал сам.
 *
 * При записи машины телефон не спрашивают. Контакты появляются позже,
 * из карточки, и раз уж владелец их вписал, он этого человека так и
 * ищет: имя помнится лучше, чем шесть символов номера.
 */
function contactLine(name: string | null, phone: string | null): string {
  return [name, phone ? formatPhone(phone) : null].filter(Boolean).join(' · ');
}
