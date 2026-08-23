import { ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getUser } from '@/lib/queries';
import { listPoints, type Point } from '@/lib/accounts';
import { ACTIVE_NICHES } from '@/lib/niches';
import { PRICE } from '@/lib/plan';
import { formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { PersonAvatar } from '@/components/patterns/person';
import { StatusBadge } from '@/components/patterns/status-badge';
import { PointForm } from '@/components/point-form';
import { NewPointForm } from './new-point-form';

/**
 * Точки владельца.
 *
 * Сюда заходят с вопросом «что у меня где»: где кончается срок, где ждут
 * денег. Точка, где человек стоит сейчас, выделена и показывает запас
 * срока шкалой; остальные — строками, и нажимается вся строка целиком.
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
  const here = points.find((p) => p.id === session.tid);
  const others = points.filter((p) => p.id !== session.tid);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.points.title} />

      <PanelGrid>
        <Panel padded={false} className="lg:col-span-7">
          <div className="flex flex-col divide-y divide-border">
            {/* Текущая точка: подсвечена и со шкалой срока. Метка «вы
                здесь» — единственное лаймовое на странице. */}
            {here && (
              <div className="border-l-2 border-primary bg-primary-soft/40 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <PersonAvatar name={here.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{here.name}</div>
                    <div className="num mt-0.5 text-xs text-muted-foreground">
                      {roleOf(here, t)} ·{' '}
                      <span className={cn(!here.canRead && 'font-medium text-warning')}>{stateOf(here, t)}</span>
                    </div>
                  </div>
                  <StatusBadge tone="lime">{t.points.here}</StatusBadge>
                </div>
                <Gauge point={here} label={stateOf(here, t)} />
              </div>
            )}

            {others.map((point) => (
              <PointForm key={point.id} tid={point.id}>
                {/* Нажимается вся строка: кнопка внутри заставляла бы
                    целиться в полосу вместо того, чтобы попасть в саму
                    точку. */}
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <PersonAvatar name={point.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{point.name}</span>
                    <span className="num block truncate text-xs text-muted-foreground">
                      {roleOf(point, t)} ·{' '}
                      <span className={cn(!point.canRead && 'font-medium text-warning')}>
                        {stateOf(point, t)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </PointForm>
            ))}
          </div>
        </Panel>

        <Panel title={t.points.add} className="content-start lg:col-span-5">
          {/* Цена и отсутствие пробного срока — над кнопкой, обычным
              текстом. Не мелким шрифтом и не после: это условие сделки,
              а не сноска. */}
          <p className="mb-4 text-sm text-muted-foreground">
            {t.points.noTrial} {t.points.price(formatMoney(PRICE, 'AMD'))}
          </p>

          <NewPointForm
            niches={ACTIVE_NICHES.map((n) => ({ key: n.key, name: n.name }))}
            disabled={mine.length >= 10}
          />
        </Panel>
      </PanelGrid>
    </div>
  );
}

/**
 * Полный бак — месяц.
 *
 * Шкала показывает запас времени, а не долю оплаченного периода:
 * периоды бывают разной длины, и одна и та же полоска то значила бы
 * месяц, то полгода. Оплата вперёд на дольше просто упирает шкалу в
 * край. Сколько дней осталось и пускать ли внутрь, решает
 * `currentAccess`; числа здесь только про длину полоски.
 */
const FULL_TANK = 30;

/**
 * Шкала срока — только там, где ей есть что показывать: у закрытой
 * точки остаток нулевой, и пустая полоска под словами «ждёт оплаты»
 * повторяла бы их молча, второй раз.
 */
function Gauge({ point, label }: { point: Point; label: string }) {
  if (!point.canRead || point.daysLeft <= 0) return null;
  return (
    <Progress
      value={Math.min(point.daysLeft, FULL_TANK)}
      max={FULL_TANK}
      aria-label={label}
      className="mt-3 flex-nowrap"
    />
  );
}

function roleOf(point: Point, t: Dict): string {
  return point.role === 'owner' ? t.roles.owner : t.roles.staff;
}

/**
 * Состояние точки словами и цифрой — те же слова, что в приложении.
 * «30 дней» само по себе не говорит чего именно тридцать, а «оплачено»
 * без срока не отвечает на вопрос, ради которого сюда зашли.
 */
function stateOf(point: Point, t: Dict): string {
  switch (point.state) {
    case 'active':
      return point.daysLeft > 0 ? t.points.paidDays(point.daysLeft) : t.points.working;
    case 'trial':
      return t.points.trialDays(point.daysLeft);
    case 'unpaid':
      return t.points.needsPayment;
    case 'expired':
      return t.billing.expiredTitle;
    case 'blocked':
      return t.billing.blockedTitle;
    default:
      return point.canRead ? t.points.working : t.points.closed;
  }
}
