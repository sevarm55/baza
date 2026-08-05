import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf } from '@/lib/subscription';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import s from '../admin.module.css';
import shell from '../shell.module.css';

/**
 * Кому звонить сегодня.
 *
 * Список клиентов растёт, и найти в нём тех, с кем прямо сейчас что-то
 * не так, становится работой. Здесь они собраны и объяснено, почему
 * каждый попал: продажа делается не «вообще», а в конкретный день —
 * когда кончается срок или когда человек перестал работать.
 *
 * Порядок не по алфавиту и не по дате, а по срочности: сверху те, у кого
 * доступ уже закрыт, потом те, у кого он кончается завтра.
 */
type Reason = { text: string; rank: number };

export default async function AttentionPage() {
  await ensureDb();

  const tenants = await listTenantsForAdmin();

  const rows = tenants
    .map((t) => {
      const access = accessOf(t);
      const reason = reasonFor(access.state, access.daysLeft, t.orderCount, t.idleDays);
      return reason ? { t, access, reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.reason.rank - b.reason.rank);

  return (
    <>
      <div className={shell.pageHead}>
        <h1 className={shell.pageTitle}>Внимание</h1>
        <div className={shell.pageSub}>Кому имеет смысл позвонить сегодня</div>
      </div>

      <div className={s.rows}>
        {rows.length === 0 ? (
          <div className={s.empty}>Всё спокойно: у всех оплачено и все работают</div>
        ) : (
          rows.map(({ t, reason }) => {
            const niche = NICHES[t.niche as NicheKey];
            return (
              <article key={t.id} className={s.row}>
                <div className={s.rowTop}>
                  <div className={s.name}>
                    <Link href={`/admin/t/${t.id}`} className={`${s.open} truncate`}>
                      {niche?.icon} {t.name}
                    </Link>
                  </div>
                  <span className={`${s.badge} ${s.badgeExpired}`}>{reason.text}</span>
                </div>
                <div className={s.meta}>
                  {t.ownerName ?? '—'} ·{' '}
                  {t.ownerPhone ? (
                    <a href={`tel:${t.ownerPhone}`}>{formatPhone(t.ownerPhone)}</a>
                  ) : (
                    '—'
                  )}
                </div>
                {t.adminNote && <div className={s.usage}>{t.adminNote}</div>}
              </article>
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * Почему клиент здесь.
 *
 * «Ни одной записи» стоит выше кончающегося триала: человек, который
 * зарегистрировался и не начал, отвалится молча и навсегда, а тому, у
 * кого завтра кончается срок, можно позвонить и завтра.
 */
function reasonFor(
  state: string,
  daysLeft: number,
  orders: number,
  idle: number | null,
): Reason | null {
  if (state === 'blocked') return { text: 'отключён', rank: 0 };
  if (state === 'expired') return { text: 'срок вышел', rank: 1 };
  if (orders === 0) return { text: 'ни одной записи', rank: 2 };
  if (daysLeft <= 3) return { text: `осталось ${daysLeft} дн`, rank: 3 };
  if (idle !== null && idle > 7) return { text: `тишина ${idle} дн`, rank: 4 };
  return null;
}
