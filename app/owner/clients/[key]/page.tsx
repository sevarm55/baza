import { notFound, redirect } from 'next/navigation';
import { CircleAlert, MessageSquare, Phone } from 'lucide-react';
import { requireOwner } from '@/lib/auth';
import { getClientHistory, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { formatPhone } from '@/lib/phone';
import { dayMonth, hhmm } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { PersonDot } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { TableShell, cellNum, headNum } from '@/components/patterns/table';
import { DesktopOnly, MobileDataList, MobileDataRow, MobileOnly } from '@/components/mobile';

/**
 * История одной машины — отдельной страницей.
 *
 * Внутри списка ту же историю показывает лист справа: он не уводит со
 * страницы и не теряет набранный поиск. Эта страница — путь снаружи:
 * на неё ссылаются, её открывают из ленты и из адреса.
 *
 * Обе считают одно и то же одной функцией и отвечают одними и теми же
 * словами. Отменённых записей здесь нет: клиент за них не платил, и в
 * его итоге их нет.
 */
export default async function ClientPage({ params }: { params: Promise<{ key: string }> }) {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит; своё название владельца
     проходит насквозь (см. terms.ts). В базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const { key } = await params;
  const found = await getClientHistory(tenant.id, decodeURIComponent(key));
  if (!found) notFound();

  const { client } = found;
  const orders = found.orders.map((o) => ({
    ...o,
    serviceName: serviceNameTerm(o.serviceName, t.locale),
  }));
  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const days = client.daysSince;
  const avg = client.visits > 0 ? Math.round(client.total / client.visits) : 0;
  const lost = days > LOST_AFTER_DAYS;
  const last = days === 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(days);
  const contact = contactLine(client.name, client.phone);

  const longDay = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tenant.timezone,
  });

  const service = topOf(orders.map((o) => o.serviceName));
  /* Кто чаще мыл эту машину: по участникам, а не по авторам записей. */
  const staff = topOf(
    orders.flatMap((o) =>
      o.crew.length > 0
        ? o.crew.map((p) => p.name).filter((n): n is string => Boolean(n))
        : o.staffName
          ? [o.staffName]
          : [],
    ),
  );
  const payment = topOf(orders.map((o) => paymentLabel(o.payment, t)));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        /* Заголовок здесь — данные, а не имя раздела: в шапке телефона
           стоит «Клиенты», и без номера было бы непонятно, чья это
           карточка. */
        mobileTitle
        back={{ href: '/owner/clients', label: t.owner.tabClients }}
        title={<span className="num">{client.key}</span>}
        description={contact || undefined}
        actions={
          client.phone ? (
            <>
              <Button variant="outline" nativeButton={false} render={<a href={`tel:${client.phone}`} />}>
                <Phone data-icon="inline-start" aria-hidden />
                {t.owner.clientCall}
              </Button>
              <Button variant="outline" nativeButton={false} render={<a href={`sms:${client.phone}`} />}>
                <MessageSquare data-icon="inline-start" aria-hidden />
                {t.owner.clientWrite}
              </Button>
            </>
          ) : undefined
        }
      />

      <MetricStrip columns={3}>
        <Metric size="lg" label={t.owner.clientsTotalSpent} value={money(client.total)} />
        <Metric
          label={t.owner.visits}
          value={String(client.visits)}
          hint={`${t.owner.lastVisitPrefix} ${last}`}
        />
        <Metric label={t.owner.clientAvg} value={money(avg)} />
      </MetricStrip>

      {/* Пропавшему — строкой у показаний, а не плашкой во всю ширину:
          это повод позвонить, а не тревога. */}
      {lost && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning-soft-foreground"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.owner.clientLostHint}
        </p>
      )}

      <PanelGrid>
        {orders.length > 0 && (
          <Panel title={t.owner.clientHabits} className="lg:col-span-4">
            <DetailList>
              <DetailRow label={t.owner.clientFirstVisit} value={longDay.format(client.firstSeenAt)} mono />
              {service && (
                <DetailRow label={t.owner.clientOftenTakes} value={<span className="truncate">{service}</span>} />
              )}
              {payment && <DetailRow label={t.owner.clientOftenPays} value={payment} />}
              {staff && (
                <DetailRow label={t.owner.clientOftenServed} value={<span className="truncate">{staff}</span>} />
              )}
            </DetailList>
          </Panel>
        )}

        <TableShell
          className={orders.length > 0 ? 'lg:col-span-8' : 'lg:col-span-12'}
          title={
            <span className="flex items-center gap-2">
              {t.owner.clientHistory}
              {orders.length > 0 && (
                <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {orders.length}
                </span>
              )}
            </span>
          }
        >
          {orders.length === 0 ? (
            <EmptyState compact title={t.common.empty} />
          ) : (
            <>
            {/* На телефоне визиты строками: услуга и кто мыл слева, цена
                и когда — справа. Пять колонок на трёхстах шестидесяти
                точках сжались бы до нечитаемого. */}
            <MobileOnly className="px-4 pb-1">
              <MobileDataList>
                {orders.map((o) => (
                  <MobileDataRow
                    key={o.id}
                    title={
                      <span className="truncate text-[15.5px] font-semibold text-m-ink">
                        {o.serviceName}
                      </span>
                    }
                    note={`${crewNames(o)} · ${paymentLabel(o.payment, t).toLocaleLowerCase(t.locale)}`}
                    extra={`${dayMonth(o.createdAt, tenant.timezone)} · ${hhmm(o.createdAt, tenant.timezone)}`}
                    value={
                      <span className="flex items-baseline justify-end gap-1.5">
                        {o.listPrice !== null && o.listPrice > o.price && (
                          <span className="num text-[12px] font-normal text-m-muted line-through">
                            {money(o.listPrice)}
                          </span>
                        )}
                        {money(o.price)}
                      </span>
                    }
                  />
                ))}
              </MobileDataList>
            </MobileOnly>

            <DesktopOnly>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 px-4 text-xs text-muted-foreground">{t.owner.colService}</TableHead>
                  <TableHead className="h-9 px-4 text-xs text-muted-foreground">{tenant.staffRole}</TableHead>
                  <TableHead className="hidden h-9 px-4 text-xs text-muted-foreground sm:table-cell">
                    {t.owner.colPayment}
                  </TableHead>
                  <TableHead className={`h-9 px-4 text-xs text-muted-foreground ${headNum}`}>
                    {t.owner.colPrice}
                  </TableHead>
                  <TableHead className={`h-9 px-4 text-xs text-muted-foreground ${headNum}`}>
                    {t.owner.colTime}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="px-4 py-2.5 font-medium">{o.serviceName}</TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <PersonDot name={o.crew[0]?.name ?? o.staffName} />
                        <span className="truncate">{crewNames(o)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden px-4 py-2.5 sm:table-cell">
                      <Badge variant="muted">{paymentLabel(o.payment, t)}</Badge>
                    </TableCell>
                    <TableCell className={`px-4 py-2.5 font-semibold ${cellNum}`}>
                      {o.listPrice !== null && o.listPrice > o.price && (
                        <span className="mr-1.5 font-normal text-muted-foreground line-through">
                          {money(o.listPrice)}
                        </span>
                      )}
                      {money(o.price)}
                    </TableCell>
                    <TableCell className={`px-4 py-2.5 text-muted-foreground ${cellNum}`}>
                      {dayMonth(o.createdAt, tenant.timezone)} · {hhmm(o.createdAt, tenant.timezone)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </DesktopOnly>
            </>
          )}
        </TableShell>
      </PanelGrid>
    </div>
  );
}

/**
 * Что встречается чаще всего. Пусто, когда выбирать не из чего.
 */
function topOf(values: string[]): string | null {
  if (values.length < 2) return null;

  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);

  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? null;
}

function contactLine(name: string | null, phone: string | null): string {
  return [name, phone ? formatPhone(phone) : null].filter(Boolean).join(' · ');
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

/**
 * Кто мыл — одной строкой. Все участники, а не автор записи.
 */
function crewNames(order: { crew: { name: string | null }[]; staffName: string | null }): string {
  const names = order.crew.map((p) => p.name).filter((n): n is string => Boolean(n));
  if (names.length > 0) return names.join(' · ');
  return order.staffName ?? '—';
}
