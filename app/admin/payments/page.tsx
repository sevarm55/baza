import { ensureDb } from '@/lib/db/ready';
import { allPayments, paymentTotals } from '@/lib/admin-billing';
import { formatMoney } from '@/lib/money';
import s from '../admin.module.css';
import shell from '../shell.module.css';

/**
 * Наши деньги.
 *
 * Страница отвечает на три вопроса, которые до сих пор жили в голове:
 * сколько получено в этом месяце, больше или меньше прошлого, и кто
 * когда платил.
 *
 * Валюта берётся из прайса, а не у клиента: платят нам в драмах
 * независимо от того, в чём считает свою выручку мойка.
 */
export default async function PaymentsPage() {
  await ensureDb();

  const [rows, totals] = await Promise.all([allPayments(), paymentTotals()]);
  const money = (n: number) => formatMoney(n, 'AMD');

  const diff = totals.month - totals.prevMonth;

  return (
    <>
      <div className={shell.pageHead}>
        <h1 className={shell.pageTitle}>Платежи</h1>
        <div className={shell.pageSub}>Всё, что получено за подписки</div>
      </div>

      <div className={s.summary}>
        <div className={s.sum}>
          <div className={s.sumLabel}>В этом месяце</div>
          <div className={s.sumValue} style={{ color: 'var(--color-good)' }}>
            {money(totals.month)}
          </div>
        </div>
        <div className={s.sum}>
          <div className={s.sumLabel}>В прошлом</div>
          <div className={s.sumValue}>{money(totals.prevMonth)}</div>
        </div>
        <div className={s.sum}>
          <div className={s.sumLabel}>Разница</div>
          <div
            className={s.sumValue}
            style={{ color: diff >= 0 ? 'var(--color-good)' : 'var(--color-warn)' }}
          >
            {diff >= 0 ? '+' : '−'}
            {money(Math.abs(diff))}
          </div>
        </div>
        <div className={s.sum}>
          <div className={s.sumLabel}>За всё время</div>
          <div className={s.sumValue}>{money(totals.total)}</div>
        </div>
      </div>

      <div className={s.rows}>
        {rows.length === 0 ? (
          <div className={s.empty}>Платежей пока нет</div>
        ) : (
          rows.map((p) => (
            <article key={p.id} className={s.row}>
              <div className={s.rowTop}>
                <div className={s.name}>
                  <span className="truncate">{p.tenantName}</span>
                </div>
                <span className={s.sumValue} style={{ fontSize: 17 }}>
                  {money(p.amount)}
                </span>
              </div>
              <div className={s.meta}>
                {date(p.at)} · {p.months} мес
                {p.adminName ? ` · принял ${p.adminName}` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}

/** Дата без Intl: он расходится между сервером и браузером. */
function date(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
