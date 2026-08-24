'use client';

import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DesktopOnly, MobileOnly } from '@/components/mobile';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { EmptyState } from '@/components/patterns/states';
import { PersonDot } from '@/components/patterns/person';
import { Segmented } from '@/components/patterns/segmented';
import { TableShell } from '@/components/patterns/table';
import { SearchInput } from '@/components/patterns/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { unitCount } from '@/lib/i18n/terms';
import { OrderActions } from './order-actions';
import { JournalMobile } from './journal-mobile';
import type { Op, OpWorker } from './model';

/**
 * Журнал записей периода: что именно было.
 *
 * Таблица отвечает «что», а не «сколько всего»: итог внизу считается
 * по видимым строкам, чтобы после фильтра по способу оплаты сумма
 * совпадала с тем, что на экране. Нажатие на строку открывает окно
 * записи: кому сколько досталось и что осталось бизнесу.
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
  /* Запись в окне держится отдельно от признака «окно открыто»: при
     закрытии содержимое остаётся на месте до конца анимации. */
  const [detail, setDetail] = useState<Op | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
    <>
      {/* На телефоне журнал становится списком строк: шесть колонок на
          трёхстах шестидесяти точках либо едут вбок, либо сжимаются до
          нечитаемого. Данные и правила фильтра общие, своё у каждого
          представления только то, чем по нему попадают. */}
      <MobileOnly>
        <JournalMobile
          ops={ops}
          methods={methods}
          currency={currency}
          unitOne={unitOne}
          staffRole={staffRole}
          clientIdLabel={clientIdLabel}
          teamPercent={teamPercent}
          staff={staff}
          title={title}
          note={note}
          empty={empty}
        />
      </MobileOnly>

      <DesktopOnly>
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
                staff={staff}
                teamPercent={teamPercent}
                selected={detailOpen && detail?.id === o.id}
                onOpen={() => {
                  setDetail(o);
                  setDetailOpen(true);
                }}
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

      {detail && (
        <OpDetails op={detail} open={detailOpen} money={money} onClose={() => setDetailOpen(false)} />
      )}
    </TableShell>
      </DesktopOnly>
    </>
  );
}

function Line({
  op,
  money,
  staff,
  teamPercent,
  selected,
  onOpen,
}: {
  op: Op;
  money: (n: number) => string;
  staff: { id: string; name: string }[];
  teamPercent: number | null;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className="cursor-pointer"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a, [role=menuitem]')) onOpen();
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
            aria-haspopup="dialog"
            aria-label={`${op.clientKey ?? ''} · ${money(op.price)}`}
            onClick={onOpen}
          >
            <ChevronRight aria-hidden />
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
  );
}

/**
 * Окно записи: то, что раньше раскрывалось строкой внутри таблицы.
 *
 * Окно вмещает всё и на телефоне, где половина колонок скрыта: время,
 * услугу, способ оплаты, цену со скидкой и делёж между людьми и
 * бизнесом. Полоса долей та же, что была в раскрытии.
 */
function OpDetails({
  op,
  open,
  money,
  onClose,
}: {
  op: Op;
  open: boolean;
  money: (n: number) => string;
  onClose: () => void;
}) {
  const t = useT();
  const cut = op.price > 0 ? Math.round((op.share / op.price) * 100) : 0;
  const shared = op.crew.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2">
            {op.clientKey ? <span className="num">{op.clientKey}</span> : <span>{op.serviceName}</span>}
            <span className="num text-sm font-normal text-muted-foreground">{op.time}</span>
          </DialogTitle>
          <DialogDescription>
            {op.clientKey ? `${op.serviceName} · ${op.paymentLabel}` : op.paymentLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <div className="text-xs text-muted-foreground">{t.today.clientPaid}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-2xl font-semibold">{money(op.price)}</span>
              {op.listPrice !== null && (
                <span className="num text-sm text-muted-foreground line-through">{money(op.listPrice)}</span>
              )}
            </div>
          </div>

          {/* Полоса долей: сегмент на каждого участника и остаток
              бизнеса. */}
          <div className="flex h-2 w-full overflow-hidden rounded-sm bg-muted" aria-hidden>
            {op.crew.map((p, i) => (
              <span
                key={p.staffId ?? `noname-${i}`}
                style={{ width: `${op.price > 0 ? (p.earned / op.price) * 100 : 0}%`, background: p.color }}
              />
            ))}
            <span style={{ width: `${100 - cut}%`, background: 'var(--chart-2)' }} />
          </div>

          <DetailList>
            {op.crew.map((p, i) => (
              <DetailRow
                key={p.staffId ?? `noname-${i}`}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    {p.name ?? '—'}
                  </span>
                }
                value={
                  <>
                    {money(p.earned)}
                    {!shared && op.percent > 0 && (
                      <span className="ml-1.5 font-normal text-muted-foreground">{op.percent}%</span>
                    )}
                  </>
                }
                mono
              />
            ))}
            <DetailRow
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: 'var(--chart-2)' }} aria-hidden />
                  {t.today.toBusiness}
                </span>
              }
              value={money(op.yours)}
              mono
            />
            {shared && <DetailRow label={t.crew.pool} value={money(op.share)} mono />}
            {shared && op.authorName && <DetailRow label={t.crew.author} value={op.authorName} />}
          </DetailList>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
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
