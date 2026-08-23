'use client';

import { ChevronDown } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import { EmptyState } from '@/components/patterns/states';
import { PersonDot } from '@/components/patterns/person';
import { Segmented } from '@/components/patterns/segmented';
import { TableShell } from '@/components/patterns/table';
import { SearchInput } from '@/components/patterns/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { staffCount, unitCount } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { OrderActions } from './order-actions';
import type { Op, OpWorker } from './model';

/**
 * Журнал записей периода: что именно было.
 *
 * Таблица отвечает «что», а не «сколько всего»: итог внизу считается
 * по видимым строкам, чтобы после фильтра по способу оплаты сумма
 * совпадала с тем, что на экране. Строка раскрывается и показывает,
 * кому сколько досталось и что осталось бизнесу.
 */
export function Journal({
  ops,
  currency,
  unitOne,
  staffRole,
  clientIdLabel,
  title,
  note,
  empty,
  methods,
  staff,
  teamPercent,
}: {
  ops: Op[];
  currency: string;
  unitOne: string;
  staffRole: string;
  clientIdLabel: string;
  title: string;
  note: string;
  empty: { title: string; note?: string };
  methods: { key: string; label: string }[];
  staff: { id: string; name: string }[];
  teamPercent: number | null;
}) {
  const t = useT();
  const [method, setMethod] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Управление появляется, когда ему есть чем управлять: у четырёх
     машин с одними наличными полоса фильтров ничего не меняет. */
  const filterable = ops.length > 8 && methods.length > 1;
  const searchable = ops.length > 12;

  const shown = useMemo(() => {
    const needle = query.trim().replace(/[\s-]+/g, '').toUpperCase();
    return ops.filter(
      (o) =>
        (method === 'all' || o.payment === method) &&
        (needle === '' || (o.clientKey ?? '').replace(/[\s-]+/g, '').toUpperCase().includes(needle)),
    );
  }, [ops, method, query]);

  const totals = shown.reduce(
    (acc, o) => ({
      price: acc.price + o.price,
      share: acc.share + o.share,
      yours: acc.yours + o.yours,
    }),
    { price: 0, share: 0, yours: 0 },
  );

  const tools =
    searchable || filterable ? (
      <div className="flex flex-wrap items-center gap-2">
        {filterable && (
          <Segmented
            size="sm"
            current={method}
            onSelect={setMethod}
            label={t.owner.colPayment}
            items={[{ key: 'all', label: t.today.all }, ...methods]}
          />
        )}
        {searchable && (
          <SearchInput
            numeric
            value={query}
            onChange={setQuery}
            placeholder={t.owner.clientsSearch}
            className="h-8 sm:w-52"
          />
        )}
      </div>
    ) : undefined;

  return (
    <TableShell
      title={
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {title}
            {ops.length > 0 && (
              <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {ops.length}
              </span>
            )}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{note}</span>
        </span>
      }
      actions={tools}
    >
      {ops.length === 0 ? (
        <EmptyState compact title={empty.title} description={empty.note} />
      ) : shown.length === 0 ? (
        <EmptyState compact title={t.owner.clientsNotFound} />
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="hidden h-9 w-16 px-4 text-xs text-muted-foreground sm:table-cell">{t.owner.colTime}</TableHead>
              <TableHead className="h-9 w-24 px-3 text-xs text-muted-foreground sm:w-28 sm:px-4">{clientIdLabel}</TableHead>
              <TableHead className="h-9 px-4 text-xs text-muted-foreground">{staffRole}</TableHead>
              <TableHead className="hidden h-9 px-4 text-xs text-muted-foreground md:table-cell">
                {t.owner.colService}
              </TableHead>
              <TableHead className="hidden h-9 w-28 px-4 text-xs text-muted-foreground xl:table-cell">
                {t.owner.colPayment}
              </TableHead>
              <TableHead className="h-9 w-24 px-3 text-right text-xs text-muted-foreground sm:w-32 sm:px-4">{t.owner.colPrice}</TableHead>
              <TableHead className="hidden h-9 w-28 px-4 text-right text-xs text-muted-foreground xl:table-cell">
                {t.owner.colShare}
              </TableHead>
              <TableHead className="hidden h-9 w-28 px-4 text-right text-xs text-muted-foreground 2xl:table-cell">
                {t.today.toBusiness}
              </TableHead>
              <TableHead className="h-9 w-16 px-1 sm:w-20 sm:px-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((o) => (
              <Line
                key={o.id}
                op={o}
                money={money}
                staffRole={staffRole}
                staff={staff}
                teamPercent={teamPercent}
                open={open === o.id}
                onToggle={() => setOpen((was) => (was === o.id ? null : o.id))}
              />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="hidden sm:table-cell" />
              <TableCell colSpan={2} className="px-3 py-2.5 text-xs font-medium text-muted-foreground sm:px-4">
                {t.owner.feedTotal} · {unitCount(shown.length, unitOne, t.locale)}
              </TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell className="hidden xl:table-cell" />
              <TableCell className="num px-3 py-2.5 text-right text-sm font-semibold sm:px-4">
                {money(totals.price)}
              </TableCell>
              <TableCell className="num hidden px-4 py-2.5 text-right text-sm text-muted-foreground xl:table-cell">
                {money(totals.share)}
              </TableCell>
              <TableCell className="num hidden px-4 py-2.5 text-right text-sm 2xl:table-cell">
                {money(totals.yours)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </TableShell>
  );
}

function Line({
  op,
  money,
  staffRole,
  staff,
  teamPercent,
  open,
  onToggle,
}: {
  op: Op;
  money: (n: number) => string;
  staffRole: string;
  staff: { id: string; name: string }[];
  teamPercent: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const cut = op.price > 0 ? Math.round((op.share / op.price) * 100) : 0;
  const shared = op.crew.length > 1;

  return (
    <Fragment>
      <TableRow
        data-state={open ? 'selected' : undefined}
        className="cursor-pointer"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a, [role=menuitem]')) onToggle();
        }}
      >
        <TableCell className="num hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{op.time}</TableCell>
        <TableCell className="num truncate px-3 py-2.5 font-semibold sm:px-4">{op.clientKey ?? '—'}</TableCell>
        <TableCell className="px-4 py-2.5">
          <Crew crew={op.crew} />
        </TableCell>
        <TableCell className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
          <span className="block truncate" title={op.serviceName}>
            {op.serviceName}
          </span>
        </TableCell>
        <TableCell className="hidden px-4 py-2.5 xl:table-cell">
          <Badge variant="muted">{op.paymentLabel}</Badge>
        </TableCell>
        <TableCell className="num px-3 py-2.5 text-right font-semibold sm:px-4">
          {op.listPrice !== null && (
            <span className="mr-1.5 text-xs font-normal text-muted-foreground line-through">
              {money(op.listPrice)}
            </span>
          )}
          {money(op.price)}
        </TableCell>
        <TableCell className="num hidden px-4 py-2.5 text-right text-muted-foreground xl:table-cell">
          {op.share > 0 ? money(op.share) : '—'}
        </TableCell>
        <TableCell className="num hidden px-4 py-2.5 text-right 2xl:table-cell">{money(op.yours)}</TableCell>
        <TableCell className="px-1 py-1.5 sm:px-2">
          <span className="flex items-center justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={open}
              aria-label={`${op.clientKey ?? ''} · ${money(op.price)}`}
              onClick={onToggle}
            >
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
            </Button>
            <OrderActions
              orderId={op.id}
              clientKey={op.clientKey}
              crew={op.crew}
              staff={staff}
              teamPercent={teamPercent}
              detail={`${op.serviceName} · ${money(op.price)}`}
            />
          </span>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={9} className="px-4 py-3">
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-muted-foreground">
                {t.today.clientPaid} <b className="num text-foreground">{money(op.price)}</b>
                {shared && (
                  <>
                    {' · '}
                    {t.crew.title} · {staffCount(op.crew.length, staffRole, t.locale)} · {t.crew.pool}{' '}
                    <b className="num text-foreground">{money(op.share)}</b>
                  </>
                )}
              </div>

              {/* Полоса долей: сегмент на каждого участника и остаток
                  бизнеса. */}
              <div className="flex h-1.5 w-full max-w-xl overflow-hidden rounded-sm bg-muted" aria-hidden>
                {op.crew.map((p, i) => (
                  <span
                    key={p.staffId ?? `noname-${i}`}
                    style={{ width: `${op.price > 0 ? (p.earned / op.price) * 100 : 0}%`, background: p.color }}
                  />
                ))}
                <span style={{ width: `${100 - cut}%`, background: 'var(--chart-2)' }} />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {op.crew.map((p, i) => (
                  <span key={p.staffId ?? `noname-${i}`} className="inline-flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    {p.name ?? '—'}
                    <b className="num">{money(p.earned)}</b>
                    {!shared && op.percent > 0 && (
                      <span className="num text-muted-foreground">{op.percent}%</span>
                    )}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: 'var(--chart-2)' }} aria-hidden />
                  {t.today.toBusiness}
                  <b className="num">{money(op.yours)}</b>
                </span>
              </div>

              {shared && op.authorName && (
                <div className="text-muted-foreground">
                  {t.crew.author} {op.authorName}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

/** Все, кто мыл: точка цвета человека и имя; у бригады имена через точку. */
function Crew({ crew }: { crew: OpWorker[] }) {
  if (crew.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-0.5">
        {crew.map((p, i) => (
          <PersonDot key={p.staffId ?? `noname-${i}`} name={p.name} />
        ))}
      </span>
      <span className="truncate" title={crew.map((p) => p.name ?? '—').join(' · ')}>
        {crew.map((p) => p.name ?? '—').join(' · ')}
      </span>
    </span>
  );
}
