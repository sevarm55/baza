import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getUser } from '@/lib/queries';
import { listPoints } from '@/lib/accounts';
import { ACTIVE_NICHES } from '@/lib/niches';
import { PRICE } from '@/lib/plan';
import { formatMoney } from '@/lib/money';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { NewPointForm } from './new-point-form';
import { getDict } from '@/lib/i18n/server';

/**
 * Точки владельца.
 *
 * Живёт в настройках, а не отдельной вкладкой: вкладок должно быть
 * столько, сколько экранов открывают каждый день, а точку заводят раз в
 * год. Восьмая вкладка ради этого стоила бы места у семи ежедневных.
 *
 * Про то, что бесплатно не будет, написано ДО кнопки. Узнать это после
 * нажатия — значит узнать, когда уже нажал.
 */
export default async function PointsPage() {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const me = await getUser(session.tid, session.uid);
  if (!me?.accountId) redirect('/session-ended');

  const points = await listPoints(me.accountId);
  const mine = points.filter((p) => p.role === 'owner');

  return (
    <>
      {/* Точки открывают из настроек, в полосе вкладок их нет —
          значит на телефоне назвать раздел больше нечему. */}
      <PageHead title={t.points.title} standalone />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <Panel title={t.points.title} count={points.length} className="lg:col-span-7">
          <div className="grid gap-0">
            {points.map((point, i) => (
              <div
                key={point.id}
                className={`flex items-center gap-2.5 py-2.5 ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    point.canRead ? 'bg-good' : 'bg-warn'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{point.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {point.role === 'owner' ? t.roles.owner : t.roles.staff}
                    {point.id === session.tid ? ` · ${t.points.here}` : ''}
                  </span>
                </span>
                {!point.canRead && (
                  <span className="shrink-0 text-[12px] text-muted">{t.points.needsPayment}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t.points.add} className="content-start lg:col-span-5">
          {/* Цена и отсутствие пробного срока — над кнопкой, обычным
              текстом. Не мелким шрифтом и не после: это условие сделки,
              а не сноска. */}
          <p className="note mb-3">
            {t.points.noTrial} {t.points.price(formatMoney(PRICE, 'AMD'))}
          </p>

          <NewPointForm
            niches={ACTIVE_NICHES.map((n) => ({ key: n.key, name: n.name, icon: n.icon }))}
            disabled={mine.length >= 10}
          />
        </Panel>
      </div>
    </>
  );
}
