import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf, billingEnabled, type Access } from '@/lib/subscription';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import { PageHeader, SectionHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TenantActions } from './tenant-actions';
import { STATE_LABEL, STATE_TONE, date, plural } from './format';

export default async function AdminPage() {
  await ensureDb();

  const tenants = await listTenantsForAdmin();
  // здесь показываем НАСТОЯЩЕЕ состояние подписки, а не то, что видит
  // клиент: при выключенном биллинге иначе все были бы «оплачено»,
  // и панель перестала бы что-либо сообщать
  const rows = tenants.map((t) => ({ ...t, access: accessOf(t) }));

  const count = (state: Access['state']) => rows.filter((r) => r.access.state === state).length;

  /* Точки одного человека — один клиент, а не несколько. Группируем по
     владельцу, сохраняя порядок первого появления: список отсортирован
     по дате создания, и группа встаёт туда, где стоит самая новая её
     точка.

     Ключ — accountId, а не телефон: телефон это копия, которая однажды
     исчезнет. Строки без владельца (такого быть не должно) остаются
     каждая сама по себе, иначе они слиплись бы в одну ложную группу. */
  const groups: { key: string; owner: string | null; phone: string | null; points: typeof rows }[] =
    [];
  const groupBy = new Map<string, (typeof groups)[number]>();
  for (const row of rows) {
    const key = row.ownerAccountId ?? `сам-по-себе:${row.id}`;
    let group = groupBy.get(key);
    if (!group) {
      group = { key, owner: row.ownerName, phone: row.ownerPhone, points: [] };
      groupBy.set(key, group);
      groups.push(group);
    }
    group.points.push(row);
  }

  const owners = groups.length;

  /* Ноль в плитке состояния тихий: цвет несёт смысл, только когда есть
     кого считать. */
  const tile = (state: Access['state'], tone: 'success' | 'warning' | 'primary' | 'destructive') => {
    const n = count(state);
    return <Metric label={STATE_LABEL[state]} value={String(n)} tone={n > 0 ? tone : 'muted'} />;
  };

  return (
    <>
      <PageHeader
        className="mb-0"
        title="Клиенты"
        description={
          /* Владельцев и точек порознь: считай мы только точки, вторая
             мойка старого клиента читалась бы как новый клиент, и рост
             выручки перестал бы отличаться от роста базы. */
          `${owners} ${plural(owners, 'владелец', 'владельца', 'владельцев')} · ${rows.length} ${plural(rows.length, 'точка', 'точки', 'точек')} · продление записывает платёж`
        }
      />

      {!billingEnabled() && (
        <p
          role="status"
          className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
        >
          Оплата выключена: сроки считаются, но никого не блокируют. Включается переменной{' '}
          <code className="num">BILLING_ENABLED=1</code>.
        </p>
      )}

      <MetricStrip columns={4}>
        <Metric label="Владельцев" value={String(owners)} />
        <Metric label="Точек" value={String(rows.length)} />
        {tile('active', 'success')}
        {/* Ждущие первой оплаты — своя плитка, иначе они не попадают ни
            в один счётчик и плитки перестают складываться в «Точек».
            Это первое, что начинает врать. */}
        {tile('unpaid', 'warning')}
      </MetricStrip>
      <MetricStrip columns={3}>
        {tile('trial', 'primary')}
        {tile('expired', 'warning')}
        {tile('blocked', 'destructive')}
      </MetricStrip>

      {rows.length === 0 ? (
        <EmptyState title="Пока никто не зарегистрировался" />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const many = group.points.length > 1;
            const paid = group.points.filter((p) => p.access.canRead).length;

            const cards = group.points.map((t) => {
              const state = t.access.state;
              const niche = NICHES[t.niche as NicheKey];
              const idleDays = t.idleDays;

              return (
                <Panel key={t.id} as="article">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* имя — вход в карточку: «посмотреть его цифры» это
                          первое, чего хочется во время звонка клиента */}
                      <Link
                        href={`/admin/t/${t.id}`}
                        className="min-w-0 truncate font-semibold underline-offset-4 hover:underline"
                      >
                        {niche?.icon} {t.name}
                      </Link>
                      <StatusBadge tone={STATE_TONE[state]}>
                        {STATE_LABEL[state]}
                        {t.access.daysLeft > 0 && ` · ${t.access.daysLeft} дн`}
                      </StatusBadge>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {t.ownerName ?? '—'} ·{' '}
                      <span className="num">{t.ownerPhone ? formatPhone(t.ownerPhone) : '—'}</span> ·
                      зарегистрирован <span className="num">{date(t.createdAt)}</span>
                    </div>

                    <div className="num text-sm">
                      {t.orderCount === 0 ? (
                        /* Зарегистрировался и не работает — сюда звонить,
                           а не ждать оплаты. */
                        <span className="text-warning">ни одной записи</span>
                      ) : (
                        <>
                          {t.orderCount} {plural(t.orderCount, 'запись', 'записи', 'записей')} ·{' '}
                          {formatMoney(t.revenue, t.currency)} · {t.staffCount}{' '}
                          {plural(t.staffCount, 'сотрудник', 'сотрудника', 'сотрудников')} ·{' '}
                          {idleDays === 0
                            ? 'работали сегодня'
                            : idleDays === null
                              ? '—'
                              : idleDays > 7
                                ? `тишина ${idleDays} дн`
                                : `последняя запись ${idleDays} дн назад`}
                        </>
                      )}
                    </div>

                    <TenantActions
                      tenantId={t.id}
                      name={t.name}
                      blocked={state === 'blocked'}
                      note={t.adminNote}
                    />
                  </div>
                </Panel>
              );
            });

            /* У кого одна точка — ровно те же карточки, что и были: ни
               заголовка, ни рамки, ни отступа. Девяносто пять клиентов
               из ста не должны заметить, что группировка вообще
               появилась. */
            if (!many) return cards;

            return (
              <section key={group.key} className="flex flex-col gap-3">
                <SectionHeader
                  className="mb-0"
                  title={group.owner ?? '—'}
                  description={`${group.points.length} ${plural(group.points.length, 'точка', 'точки', 'точек')} · оплачено: ${paid}`}
                />
                {cards}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
