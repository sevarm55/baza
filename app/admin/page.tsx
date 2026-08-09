import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf, billingEnabled, type Access } from '@/lib/subscription';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import { TenantActions } from './tenant-actions';
import s from './admin.module.css';
import shell from './shell.module.css';

/* Русские числительные: «2 владельцев» читается как ошибка, а админку
   каждый день смотрит человек. Формы для 1 / 2-4 / 5+. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const STATE_LABEL: Record<Access['state'], string> = {
  active: 'Оплачено',
  trial: 'Триал',
  expired: 'Просрочено',
  blocked: 'Отключён',
  // заведена владельцем и ждёт первой оплаты: пробный срок уже израсходован
  unpaid: 'Ждёт оплаты',
};

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

  return (
    <>
      <div className={shell.pageHead}>
        <h1 className={shell.pageTitle}>Клиенты</h1>
        <div className={shell.pageSub}>
          {/* Владельцев и точек порознь: считай мы только точки, вторая
              мойка старого клиента читалась бы как новый клиент, и рост
              выручки перестал бы отличаться от роста базы. */}
          {owners} {plural(owners, 'владелец', 'владельца', 'владельцев')} · {rows.length}{' '}
          {plural(rows.length, 'точка', 'точки', 'точек')} · продление записывает платёж
        </div>
      </div>

        {!billingEnabled() && (
          <div className={s.billingOff}>
            Оплата выключена: сроки считаются, но никого не блокируют.
            Включается переменной <code>BILLING_ENABLED=1</code>.
          </div>
        )}

        <div className={s.summary}>
          <div className={s.sum}>
            <div className={s.sumLabel}>Владельцев</div>
            <div className={s.sumValue}>{owners}</div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>Точек</div>
            <div className={s.sumValue}>{rows.length}</div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>Оплачено</div>
            <div className={s.sumValue} style={{ color: 'var(--color-good)' }}>
              {count('active')}
            </div>
          </div>
          <div className={s.sum}>
            {/* Ждущие первой оплаты — своя плитка, иначе они не попадают
                ни в один счётчик и плитки перестают складываться в
                «Всего». Это первое, что начинает врать. */}
            <div className={s.sumLabel}>Ждёт оплаты</div>
            <div className={s.sumValue} style={{ color: 'var(--color-warn)' }}>
              {count('unpaid')}
            </div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>Триал</div>
            <div className={s.sumValue} style={{ color: 'var(--color-accent)' }}>
              {count('trial')}
            </div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>Просрочено</div>
            <div className={s.sumValue} style={{ color: 'var(--color-warn)' }}>
              {count('expired')}
            </div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>Отключено</div>
            <div className={s.sumValue} style={{ color: 'var(--color-bad)' }}>
              {count('blocked')}
            </div>
          </div>
        </div>

        <div className={s.rows}>
          {rows.length === 0 && <div className={s.empty}>Пока никто не зарегистрировался</div>}

          {groups.map((group) => {
            const many = group.points.length > 1;
            const paid = group.points.filter((p) => p.access.canRead).length;

            const cards = group.points.map((t) => {
            const state = t.access.state;
            const niche = NICHES[t.niche as NicheKey];
            const idleDays = t.idleDays;

            return (
              <article key={t.id} className={s.row}>
                <div className={s.rowTop}>
                  <div className={s.name}>
                    <span className={`${s.dot} ${s[dotClass(state)]}`} />
                    {/* имя — вход в карточку: «посмотреть его цифры» это
                        первое, чего хочется во время звонка клиента */}
                    <Link href={`/admin/t/${t.id}`} className={`${s.open} truncate`}>
                      {niche?.icon} {t.name}
                    </Link>
                  </div>
                  <span className={`${s.badge} ${s[badgeClass(state)]}`}>
                    {STATE_LABEL[state]}
                    {t.access.daysLeft > 0 && ` · ${t.access.daysLeft} дн`}
                  </span>
                </div>

                <div className={s.meta}>
                  {t.ownerName ?? '—'} · {t.ownerPhone ? formatPhone(t.ownerPhone) : '—'} ·
                  зарегистрирован {date(t.createdAt)}
                </div>

                <div className={s.usage}>
                  {t.orderCount === 0 ? (
                    /* Зарегистрировался и не работает — сюда звонить,
                       а не ждать оплаты. */
                    <span className={s.idle}>ни одной записи</span>
                  ) : (
                    <>
                      {t.orderCount} записей · {formatMoney(t.revenue, t.currency)} ·{' '}
                      {t.staffCount} сотрудников ·{' '}
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
              </article>
            );
            });

            /* У кого одна точка — ровно те же карточки, что и были: ни
               заголовка, ни рамки, ни отступа. Девяносто пять клиентов
               из ста не должны заметить, что группировка вообще
               появилась. */
            if (!many) return cards;

            return (
              <div key={group.key} className={s.group}>
                <div className={s.groupHead}>
                  {group.owner ?? '—'} · {group.points.length}{' '}
                  {plural(group.points.length, 'точка', 'точки', 'точек')} · оплачено: {paid}
                </div>
                {cards}
              </div>
            );
          })}
      </div>
    </>
  );
}

function dotClass(state: Access['state']) {
  return (
    {
      active: 'dotActive',
      trial: 'dotTrial',
      expired: 'dotExpired',
      blocked: 'dotBlocked',
      unpaid: 'dotUnpaid',
    } as const
  )[state];
}

function badgeClass(state: Access['state']) {
  return (
    {
      active: 'badgeActive',
      trial: 'badgeTrial',
      expired: 'badgeExpired',
      blocked: 'badgeBlocked',
      unpaid: 'badgeUnpaid',
    } as const
  )[state];
}

/** Дата без Intl: он расходится между сервером и браузером. */
function date(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
