import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/admin';
import { ensureDb } from '@/lib/db/ready';
import {
  getFeed,
  getOwner,
  getPeriodStats,
  getTenant,
  listStaff,
  otherPointsOf,
  startOfDay,
  startOfDaysAgo,
} from '@/lib/queries';
import { paymentsOf } from '@/lib/admin-billing';
import { logTenantView } from '@/lib/admin-audit';
import { accessOf } from '@/lib/subscription';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { Person } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { TableShell, cellNum, headNum } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_LABEL, when, whenShort } from '../../format';

const STATE_SHORT: Record<ReturnType<typeof accessOf>['state'], string> = {
  active: 'оплачена',
  trial: 'триал',
  expired: 'срок вышел',
  blocked: 'отключена',
  unpaid: 'ждёт оплаты',
};

const head = 'h-9 px-4 text-xs text-muted-foreground';
const cell = 'px-4 py-2.5';

/**
 * Карточка клиента: его цифры нашими глазами.
 *
 * Клиент звонит и говорит «у меня не сходится». Раньше на это можно было
 * ответить только «пришлите скриншот»: своих чисел мы не видели, а видели
 * количество записей и дату регистрации.
 *
 * Страница намеренно только читает. Войти под владельцем было бы удобнее
 * ровно один раз и опасно каждый следующий: любая случайная кнопка
 * пишется в чужие книги от его имени, и потом ни он, ни мы не разберём,
 * откуда взялась запись. Здесь писать нечем.
 *
 * Каждый заход попадает в журнал: мы смотрим в чужую выручку, и на вопрос
 * «кто это открывал» должен быть ответ.
 */
export default async function TenantCard({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  const { id } = await params;
  const t = await getTenant(id);
  if (!t) notFound();

  await logTenantView(t.id, admin.id);

  const tz = t.timezone;
  const [today, week, month, staff, feed, payments, owner] = await Promise.all([
    getPeriodStats(t.id, startOfDay(tz)),
    getPeriodStats(t.id, startOfDaysAgo(tz, 6)),
    getPeriodStats(t.id, startOfDaysAgo(tz, 29)),
    listStaff(t.id),
    getFeed(t.id, startOfDaysAgo(tz, 29), 20),
    paymentsOf(t.id),
    getOwner(t.id),
  ]);

  const access = accessOf(t);
  const siblings = owner?.accountId ? await otherPointsOf(owner.accountId, t.id) : [];
  const money = (n: number) => formatMoney(n, t.currency, 'ru');
  const niche = NICHES[t.niche as NicheKey];

  const periods = [
    { label: 'Сегодня', st: today },
    { label: '7 дней', st: week },
    { label: '30 дней', st: month },
  ];

  /* «0 дн» у просрочки было бы неотличимо от «0 дн» у ждущего первой
     оплаты, а это разные разговоры: тут ещё ни разу не платили. */
  const subscription =
    access.state === 'blocked'
      ? { value: 'отключён', tone: 'muted' as const }
      : access.state === 'expired'
        ? { value: 'срок вышел', tone: 'destructive' as const }
        : access.state === 'unpaid'
          ? { value: 'ждёт оплаты', tone: 'warning' as const }
          : { value: `${access.daysLeft} дн`, tone: 'default' as const };

  return (
    <>
      <PageHeader
        className="mb-0"
        back={{ href: '/admin', label: 'Клиенты' }}
        title={`${niche?.icon ?? ''} ${t.name}`.trim()}
        description={
          <>
            {owner?.name ?? '—'} ·{' '}
            {owner?.phone ? (
              <a
                href={`tel:${owner.phone}`}
                className="num underline-offset-4 hover:text-foreground hover:underline"
              >
                {formatPhone(owner.phone)}
              </a>
            ) : (
              '—'
            )}{' '}
            · {tz} · только чтение
          </>
        }
      />

      {t.adminNote && (
        <p role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          {t.adminNote}
        </p>
      )}

      {/* Остальные мойки того же человека. Разговор почти всегда про все
          сразу: «продлите мне» без уточнения какую. */}
      {siblings.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ещё {siblings.length === 1 ? 'точка' : 'точки'} этого владельца:{' '}
          {siblings.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link
                href={`/admin/t/${p.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {p.name}
              </Link>{' '}
              · {STATE_SHORT[accessOf(p).state]}
            </span>
          ))}
        </p>
      )}

      <MetricStrip columns={4}>
        <Metric
          label="Подписка"
          value={subscription.value}
          tone={subscription.tone}
          hint={access.canRead ? STATE_LABEL[access.state].toLowerCase() : undefined}
        />
        {periods.map((p) => (
          <Metric key={p.label} label={p.label} value={money(p.st.revenue)} />
        ))}
      </MetricStrip>

      <PanelGrid>
        <Panel className="lg:col-span-7" title="Как считается">
          <DetailList>
            {periods.map((p) => (
              <DetailRow
                key={p.label}
                label={p.label}
                value={
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="num font-semibold">{money(p.st.revenue)}</span>
                    <span className="num text-xs font-normal text-muted-foreground">
                      {p.st.count} машин · средний чек {money(p.st.avgCheck)} · наличными{' '}
                      {money(p.st.cash)} · зарплата {money(p.st.payroll)}
                      {p.st.passesSold > 0 && ` · абонементов ${p.st.passesSold}`}
                    </span>
                  </span>
                }
              />
            ))}
          </DetailList>
        </Panel>

        <Panel className="lg:col-span-5" title="Сотрудники за 30 дней" padded={false}>
          {month.byStaff.length === 0 ? (
            <EmptyState compact title="За месяц никто ничего не записал" />
          ) : (
            <ul className="divide-y divide-border">
              {month.byStaff.map((p) => (
                <li key={p.staffId ?? p.name ?? 'без имени'} className="px-4 py-2.5">
                  <Person
                    name={p.name ?? 'без имени'}
                    size="sm"
                    note={
                      <span className="num">
                        {p.count} машин · {p.percent ?? 0}% · начислено {money(p.earned)}
                      </span>
                    }
                    right={<span className="num text-sm font-semibold">{money(p.revenue)}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {feed.length === 0 ? (
          <Panel className="lg:col-span-8" title="Записи, последние 20" padded={false}>
            <EmptyState compact title="За месяц записей нет" />
          </Panel>
        ) : (
          <TableShell className="lg:col-span-8" title="Записи, последние 20">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={head}>Когда</TableHead>
                  <TableHead className={head}>Услуга</TableHead>
                  <TableHead className={head}>Кто</TableHead>
                  <TableHead className={head}>Клиент</TableHead>
                  <TableHead className={`${head} ${headNum}`}>Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feed.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className={`${cell} num text-muted-foreground`}>
                      {whenShort(o.createdAt)}
                    </TableCell>
                    <TableCell className={`${cell} font-medium`}>{o.serviceName}</TableCell>
                    <TableCell className={`${cell} text-muted-foreground`}>{o.staffName ?? '—'}</TableCell>
                    <TableCell className={`${cell} num text-muted-foreground`}>{o.clientKey ?? ''}</TableCell>
                    <TableCell className={`${cell} font-semibold ${cellNum}`}>
                      {o.payment === 'pass' ? (
                        <span className="font-normal text-muted-foreground">абонемент</span>
                      ) : (
                        money(o.price)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        )}

        <Panel className="lg:col-span-4" title="Что нам платили" padded={false}>
          {payments.length === 0 ? (
            <EmptyState compact title="Ещё ни разу не платили" />
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p.months} мес{p.note ? ` · ${p.note}` : ''}
                    </span>
                    <span className="num block text-xs text-muted-foreground">{when(p.at)}</span>
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">
                    {formatMoney(p.amount, 'AMD')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PanelGrid>

      <p className="num text-xs text-muted-foreground">
        Всего сотрудников: {staff.length}. Валюта: {t.currency}.
      </p>
    </>
  );
}
