import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { listTenantsForAdmin } from '@/lib/queries';
import { accessOf } from '@/lib/subscription';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge, type StatusTone } from '@/components/patterns/status-badge';

/**
 * Кому звонить сегодня.
 *
 * Список клиентов растёт, и найти в нём тех, с кем прямо сейчас что-то
 * не так, становится работой. Здесь они собраны и объяснено, почему
 * каждый попал: продажа делается не «вообще», а в конкретный день,
 * когда кончается срок или когда человек перестал работать.
 *
 * Порядок не по алфавиту и не по дате, а по срочности: сверху те, у кого
 * доступ уже закрыт, потом те, у кого он кончается завтра.
 */
type Reason = { text: string; rank: number };

/* Тон значка по срочности: закрытый доступ серый (уже случилось),
   ожидание денег оранжевое, просрочка красная, «не начал» фирменный. */
const REASON_TONE: Record<number, StatusTone> = {
  0: 'neutral',
  1: 'warning',
  2: 'danger',
  3: 'brand',
  4: 'warning',
  5: 'neutral',
};

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
     кончился срок на всех трёх: это одна причина позвонить, а не три
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
      <PageHeader
        className="mb-0"
        title="Внимание"
        description="Кому имеет смысл позвонить сегодня"
      />

      {rows.length === 0 ? (
        <EmptyState title="Всё спокойно: у всех оплачено и все работают" />
      ) : (
        <Panel padded={false}>
          <ul className="divide-y divide-border">
            {rows.map(({ row: { t, reason }, also }) => {
              const niche = NICHES[t.niche as NicheKey];
              return (
                <li key={t.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/t/${t.id}`}
                      className="min-w-0 truncate font-semibold underline-offset-4 hover:underline"
                    >
                      {niche?.icon} {t.name}
                    </Link>
                    <StatusBadge tone={REASON_TONE[reason.rank] ?? 'neutral'}>
                      {reason.text}
                      {also > 0 && ` · ещё ${also}`}
                    </StatusBadge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.ownerName ?? '—'} ·{' '}
                    {t.ownerPhone ? (
                      <a
                        href={`tel:${t.ownerPhone}`}
                        className="num underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {formatPhone(t.ownerPhone)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                  {t.adminNote && <div className="text-xs text-muted-foreground">{t.adminNote}</div>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
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
     не мы его. У просрочки такой срочности нет: там работали месяцами. */
  if (state === 'unpaid') return { text: 'ждёт оплаты', rank: 1 };
  if (state === 'expired') return { text: 'срок вышел', rank: 2 };
  if (orders === 0) return { text: 'ни одной записи', rank: 3 };
  if (daysLeft <= 3) return { text: `осталось ${daysLeft} дн`, rank: 4 };
  if (idle !== null && idle > 7) return { text: `тишина ${idle} дн`, rank: 5 };
  return null;
}
