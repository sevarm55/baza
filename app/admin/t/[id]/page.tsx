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
import s from '../../admin.module.css';
import shell from '../../shell.module.css';

const STATE_SHORT: Record<ReturnType<typeof accessOf>['state'], string> = {
  active: 'оплачена',
  trial: 'триал',
  expired: 'срок вышел',
  blocked: 'отключена',
  unpaid: 'ждёт оплаты',
};

/**
 * Карточка клиента: его цифры нашими глазами.
 *
 * Клиент звонит и говорит «у меня не сходится». Раньше на это можно было
 * ответить только «пришлите скриншот»: своих чисел мы не видели, а видели
 * количество записей и дату регистрации.
 *
 * Страница намеренно только читает. Войти под владельцем было бы удобнее
 * ровно один раз — и опасно каждый следующий: любая случайная кнопка
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
  const money = (n: number) => formatMoney(n, t.currency);
  const niche = NICHES[t.niche as NicheKey];

  const periods = [
    { label: 'Сегодня', st: today },
    { label: '7 дней', st: week },
    { label: '30 дней', st: month },
  ];

  return (
    <>
      <div className={shell.pageHead}>
        <Link href="/admin" className={shell.back}>
          ← Клиенты
        </Link>
        <h1 className={shell.pageTitle}>
          {niche?.icon} {t.name}
        </h1>
        <div className={shell.pageSub}>
          {owner?.name ?? '—'} ·{' '}
          {owner?.phone ? <a href={`tel:${owner.phone}`}>{formatPhone(owner.phone)}</a> : '—'} ·{' '}
          {tz} · только чтение
        </div>
      </div>

      {t.adminNote && <div className={s.billingOff}>{t.adminNote}</div>}

      {/* Остальные мойки того же человека. Разговор почти всегда про все
          сразу — «продлите мне» без уточнения какую. */}
      {siblings.length > 0 && (
        <div className={s.billingOff}>
          Ещё {siblings.length === 1 ? 'точка' : 'точки'} этого владельца:{' '}
          {siblings.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link href={`/admin/t/${p.id}`}>{p.name}</Link> — {STATE_SHORT[accessOf(p).state]}
            </span>
          ))}
        </div>
      )}

      <div className={s.summary}>
        <div className={s.sum}>
          <div className={s.sumLabel}>Подписка</div>
          <div className={s.sumValue} style={{ fontSize: 20 }}>
            {access.state === 'blocked'
              ? 'отключён'
              : access.state === 'expired'
                ? 'срок вышел'
                : /* «0 дн» здесь было бы неотличимо от просрочки, а это
                     разные разговоры: тут ещё ни разу не платили. */
                  access.state === 'unpaid'
                  ? 'ждёт оплаты'
                  : `${access.daysLeft} дн`}
          </div>
        </div>
        {periods.map((p) => (
          <div key={p.label} className={s.sum}>
            <div className={s.sumLabel}>{p.label}</div>
            <div className={s.sumValue} style={{ color: 'var(--color-good)' }}>
              {money(p.st.revenue)}
            </div>
          </div>
        ))}
      </div>

      <h2 className={shell.sectionTitle}>Как считается</h2>
      <div className={s.rows}>
        {periods.map((p) => (
          <article key={p.label} className={s.row}>
            <div className={s.rowTop}>
              <div className={s.name}>
                <span className="truncate">{p.label}</span>
              </div>
              <span className={s.sumValue} style={{ fontSize: 17 }}>
                {money(p.st.revenue)}
              </span>
            </div>
            <div className={s.meta}>
              {p.st.count} машин · средний чек {money(p.st.avgCheck)} · наличными{' '}
              {money(p.st.cash)} · зарплата {money(p.st.payroll)}
              {p.st.passesSold > 0 && ` · абонементов ${p.st.passesSold}`}
            </div>
          </article>
        ))}
      </div>

      <h2 className={shell.sectionTitle}>Сотрудники за 30 дней</h2>
      <div className={s.rows}>
        {month.byStaff.length === 0 ? (
          <div className={s.empty}>За месяц никто ничего не записал</div>
        ) : (
          month.byStaff.map((p) => (
            <article key={p.staffId ?? p.name} className={s.row}>
              <div className={s.rowTop}>
                <div className={s.name}>
                  <span className="truncate">{p.name ?? 'без имени'}</span>
                </div>
                <span className={s.sumValue} style={{ fontSize: 17 }}>
                  {money(p.revenue)}
                </span>
              </div>
              <div className={s.meta}>
                {p.count} машин · {p.percent ?? 0}% · начислено {money(p.earned)}
              </div>
            </article>
          ))
        )}
      </div>

      <h2 className={shell.sectionTitle}>Записи, последние 20</h2>
      <div className={s.rows}>
        {feed.length === 0 ? (
          <div className={s.empty}>За месяц записей нет</div>
        ) : (
          feed.map((o) => (
            <article key={o.id} className={s.row}>
              <div className={s.rowTop}>
                <div className={s.name}>
                  <span className="truncate">{o.serviceName}</span>
                </div>
                <span className={s.sumValue} style={{ fontSize: 17 }}>
                  {o.payment === 'pass' ? 'абонемент' : money(o.price)}
                </span>
              </div>
              <div className={s.meta}>
                {when(o.createdAt)} · {o.staffName ?? '—'}
                {o.clientKey ? ` · ${o.clientKey}` : ''}
              </div>
            </article>
          ))
        )}
      </div>

      <h2 className={shell.sectionTitle}>Что нам платили</h2>
      <div className={s.rows}>
        {payments.length === 0 ? (
          <div className={s.empty}>Ещё ни разу не платили</div>
        ) : (
          payments.map((p) => (
            <article key={p.id} className={s.row}>
              <div className={s.rowTop}>
                <div className={s.name}>
                  <span className="truncate">
                    {p.months} мес{p.note ? ` · ${p.note}` : ''}
                  </span>
                </div>
                <span className={s.sumValue} style={{ fontSize: 17 }}>
                  {formatMoney(p.amount, 'AMD')}
                </span>
              </div>
              <div className={s.meta}>{when(p.at)}</div>
            </article>
          ))
        )}
      </div>

      <div className={s.meta} style={{ marginTop: 24 }}>
        Всего сотрудников: {staff.length}. Валюта: {t.currency}.
      </div>
    </>
  );
}

/** Дата без Intl: он расходится между сервером и браузером. */
function when(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
