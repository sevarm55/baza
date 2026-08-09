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

  const flagged = tenants
    .map((t) => {
      const access = accessOf(t);
      const reason = reasonFor(access.state, access.daysLeft, t.orderCount, t.idleDays);
      return reason ? { t, access, reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  /* Один звонок на человека, а не на точку. У владельца трёх моек
     кончился срок на всех трёх — это одна причина позвонить, а не три
     строки, которые вытеснят из списка остальных клиентов.

     Оставляем самую срочную причину и приписываем, сколько точек она
     задела: с этого разговор и начнётся. */
  const byOwner = new Map<string, { row: (typeof flagged)[number]; also: number }>();
  for (const item of flagged) {
    const key = item.t.ownerAccountId ?? `сам-по-себе:${item.t.id}`;
    const seen = byOwner.get(key);
    if (!seen) {
      byOwner.set(key, { row: item, also: 0 });
    } else {
      seen.also += 1;
      if (item.reason.rank < seen.row.reason.rank) {
        // более срочная причина вытесняет прежнюю, но счёт точек копится
        byOwner.set(key, { row: item, also: seen.also });
      }
    }
  }

  const rows = [...byOwner.values()].sort((a, b) => a.row.reason.rank - b.row.reason.rank);

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
          rows.map(({ row: { t, reason }, also }) => {
            const niche = NICHES[t.niche as NicheKey];
            return (
              <article key={t.id} className={s.row}>
                <div className={s.rowTop}>
                  <div className={s.name}>
                    <Link href={`/admin/t/${t.id}`} className={`${s.open} truncate`}>
                      {niche?.icon} {t.name}
                    </Link>
                  </div>
                  <span className={`${s.badge} ${s.badgeExpired}`}>
                    {reason.text}
                    {also > 0 && ` · ещё ${also}`}
                  </span>
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
  /* Выше просрочки: человек только что завёл вторую точку и прямо сейчас
     сидит перед стеной «начнём после оплаты». Он ждёт нашего звонка, а
     не мы его. У просрочки такой срочности нет — там работали месяцами. */
  if (state === 'unpaid') return { text: 'ждёт оплаты', rank: 1 };
  if (state === 'expired') return { text: 'срок вышел', rank: 2 };
  if (orders === 0) return { text: 'ни одной записи', rank: 3 };
  if (daysLeft <= 3) return { text: `осталось ${daysLeft} дн`, rank: 4 };
  if (idle !== null && idle > 7) return { text: `тишина ${idle} дн`, rank: 5 };
  return null;
}
