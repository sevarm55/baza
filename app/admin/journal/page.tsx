import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { adminJournal } from '@/lib/admin-audit';
import { formatMoney } from '@/lib/money';
import s from '../admin.module.css';
import shell from '../shell.module.css';

/**
 * Что мы делали с чужими бизнесами.
 *
 * Пока админ один, лента читается как дневник. Смысл появляется на
 * втором человеке и в разговоре с клиентом: продление, отключение и
 * заход в чужие цифры перестают быть словом против слова.
 */
const LABEL: Record<string, string> = {
  tenant_view: 'смотрел карточку',
  subscription_extend: 'продлил',
  tenant_block: 'отключил',
  tenant_unblock: 'включил обратно',
  tenant_note: 'изменил заметку',
};

export default async function JournalPage() {
  await ensureDb();

  const rows = await adminJournal();

  return (
    <>
      <div className={shell.pageHead}>
        <h1 className={shell.pageTitle}>Журнал</h1>
        <div className={shell.pageSub}>Наши действия с чужими бизнесами</div>
      </div>

      <div className={s.rows}>
        {rows.length === 0 ? (
          <div className={s.empty}>Пока ничего не делали</div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className={s.row}>
              <div className={s.rowTop}>
                <div className={s.name}>
                  <span className="truncate">
                    {r.adminName ?? 'кто-то'} {LABEL[r.action] ?? r.action}
                  </span>
                </div>
                <Link href={`/admin/t/${r.tenantId}`} className={s.sumLabel}>
                  {r.tenantName}
                </Link>
              </div>
              <div className={s.meta}>
                {when(r.at)}
                {detail(r.action, r.data)}
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}

/** У продления в аудите лежат месяцы и сумма — без них строка бессодержательна. */
function detail(action: string, data: unknown): string {
  if (action !== 'subscription_extend') return '';
  const d = data as { months?: number; amount?: number } | null;
  if (!d?.months) return '';
  const amount = typeof d.amount === 'number' ? ` за ${formatMoney(d.amount, 'AMD')}` : '';
  return ` · ${d.months} мес${amount}`;
}

/** Дата без Intl: он расходится между сервером и браузером. */
function when(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
