import { ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getUser } from '@/lib/queries';
import { listPoints, type Point } from '@/lib/accounts';
import { ACTIVE_NICHES } from '@/lib/niches';
import { PRICE } from '@/lib/plan';
import { formatMoney } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { Panel, PersonTile } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { PointForm } from '@/components/point-form';
import { NewPointForm } from './new-point-form';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n/hy';

/**
 * Точки владельца.
 *
 * Живёт в настройках, а не отдельной вкладкой: вкладок должно быть
 * столько, сколько экранов открывают каждый день, а точку заводят раз в
 * год. Восьмая вкладка ради этого стоила бы места у семи ежедневных.
 *
 * Композиция та же, что на этом экране в приложении: точка, где человек
 * стоит сейчас, — крупной плиткой со шкалой срока, остальные плитками
 * поменьше под ней, и нажимается вся плитка целиком. Список одинаковых
 * строк, который был здесь раньше, отвечал только «какие у меня есть»,
 * а сюда заходят с вопросом «что у меня где»: где кончается срок, где
 * ждут денег.
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
    <>
      {/* Точки открывают из настроек, в полосе вкладок их нет —
          значит на телефоне назвать раздел больше нечему. */}
      <PageHead title={t.points.title} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        {/* Без прибора-подложки и без второго заголовка: раздел уже назван
            сверху страницы, и «Мои филиалы» дважды подряд читается как
            сбой, а не как заголовок списка. */}
        <div className="lg:col-span-7">
          <div className="flex flex-col gap-[var(--seam)]">
            {here && (
              <PersonTile color={personColor(here.name)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[22px] leading-tight font-bold">{here.name}</div>
                    <div className="mt-1 text-[13px] opacity-70">{roleOf(here, t)}</div>
                  </div>
                  {/* Метка «вы здесь» — горящая точка и слово рядом.
                      Круглым в продукте остался только настоящий признак
                      состояния, и здесь он значит ровно это. */}
                  <span className="flex shrink-0 items-center gap-1.5 pt-1.5 text-[12px] font-semibold opacity-90">
                    <span
                      className="size-[7px] rounded-full"
                      style={{ background: 'var(--tone-lime)' }}
                      aria-hidden
                    />
                    {t.points.here}
                  </span>
                </div>

                <div
                  className="num mt-5 text-[15px] font-semibold"
                  style={here.canRead ? { opacity: 0.9 } : { color: 'var(--warn-on-dark)' }}
                >
                  {stateOf(here, t)}
                </div>

                <Gauge point={here} />
              </PersonTile>
            )}

            {others.map((point) => (
              <PointForm key={point.id} tid={point.id}>
                {/* Нажимается вся плитка: кнопка внутри карточки
                    заставляла целиться в полосу вместо того, чтобы
                    попасть в саму точку. */}
                <button
                  type="submit"
                  className="block w-full cursor-pointer text-left transition-opacity hover:opacity-95"
                >
                  <PersonTile color={personColor(point.name)} compact>
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-bold">{point.name}</span>
                        <span className="num block truncate text-[12.5px]">
                          <span className="opacity-75">{roleOf(point, t)} · </span>
                          <span style={point.canRead ? { opacity: 0.75 } : { color: 'var(--warn-on-dark)' }}>
                            {stateOf(point, t)}
                          </span>
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 opacity-55" aria-hidden />
                    </div>
                  </PersonTile>
                </button>
              </PointForm>
            ))}
          </div>
        </div>

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

/**
 * Полный бак — месяц.
 *
 * Шкала показывает запас времени, а не долю оплаченного периода:
 * периоды бывают разной длины, и одна и та же полоска то значила бы
 * месяц, то полгода. Оплата вперёд на дольше просто упирает шкалу в
 * край — это правда, запаса действительно много.
 *
 * Числа здесь только про длину полоски: сколько дней осталось и пускать
 * ли внутрь, решает `currentAccess`.
 */
const FULL_TANK = 30;

/**
 * Шкала срока — только там, где ей есть что показывать.
 *
 * У закрытой точки остаток нулевой, и пустая полоска под словами «ждёт
 * оплаты» повторяла бы их молча, второй раз.
 *
 * Полоска белая всегда. Янтарный «осталось мало» здесь пробовался и не
 * работает: цвет плитки берётся из имени точки, и на янтарной мойке
 * тревожная полоска исчезала в собственном фоне. Длина и есть сигнал.
 */
function Gauge({ point }: { point: Point }) {
  if (!point.canRead || point.daysLeft <= 0) return null;

  const part = Math.min(1, point.daysLeft / FULL_TANK);

  return (
    <div className="mt-2.5 h-[5px] w-full rounded-[3px] bg-white/20" aria-hidden>
      <div
        className="h-full rounded-[3px]"
        style={{
          // минимум, чтобы последний день оставался виден
          width: `${Math.max(4, part * 100)}%`,
          background: 'rgba(255,255,255,0.9)',
        }}
      />
    </div>
  );
}

function roleOf(point: Point, t: Dict): string {
  return point.role === 'owner' ? t.roles.owner : t.roles.staff;
}

/**
 * Состояние точки словами и цифрой — те же слова, что в приложении.
 *
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
