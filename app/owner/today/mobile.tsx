import Link from 'next/link';
import { Ban, Car, Coins, Percent, Receipt, Users, UserX, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';

import {
  MAvatar,
  MEmpty,
  MDelta,
  MGrid,
  MLink,
  MReading,
  MRing,
  MSection,
  MSplitBar,
  MStatTile,
  MTile,
  mSeries,
} from '@/components/mobile';
import { getDict } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/money';
import { unitCount, unitWord } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import type { CrewMember, FlowPoint, MixSlice } from './model';
import type { Signal } from './attention';
import { FlowChartMobile } from './flow-chart-mobile';

/**
 * Сводка владельца на телефоне.
 *
 * Экран отвечает на шесть вопросов в том порядке, в каком их задают:
 * сколько мне осталось → из чего это сложилось → сколько машин и по
 * какому чеку → кто работает → чем платили → что было последним. Всё,
 * что не отвечает ни на один из них, отсюда убрано.
 *
 * Главное число — прибыль, а не выручка: выручку владелец и так
 * примерно помнит, она равна числу машин на средний чек. Прибыль не
 * помнит никто, в ней сидят проценты работников и доля аренды за день.
 *
 * Полоса под числом отвечает на вопрос, которого нет у колонок цифр:
 * какой долей. Из каждых двадцати двух тысяч владельцу осталось четыре,
 * и это видно длиной куска, без чтения. Три ступени одного грейпа, а не
 * три разных цвета: полоса показывает доли одного целого, и радуга
 * заставляла бы искать, что значит синий.
 */
export async function TodayMobile({
  isToday,
  profit,
  revenue,
  payroll,
  costsTotal,
  count,
  avgCheck,
  diff,
  hasBase,
  crew,
  presentCount,
  mix,
  flow,
  signals,
  currency,
  unitOne,
  revenueHref,
  expensesHref,
}: {
  isToday: boolean;
  profit: number;
  revenue: number;
  payroll: number;
  costsTotal: number;
  count: number;
  avgCheck: number;
  diff: number;
  /** есть ли с чем сравнивать: у нового бизнеса прошлого отрезка нет */
  hasBase: boolean;
  crew: CrewMember[];
  presentCount: number;
  mix: MixSlice[];
  flow: FlowPoint[] | null;
  signals: Signal[];
  currency: string;
  unitOne: string;
  /** разбор выручки: день целиком или месяц по дням */
  revenueHref: string;
  /** список трат за тот же отрезок */
  expensesHref: string;
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Период без единой записи — отдельное состояние, а не нулевое табло.
     Ноль выручки, пустая полоса и график без точек выглядят как данные,
     которые надо изучать; изучать тут нечего. */
  if (count === 0 && costsTotal === 0) {
    return (
      <MEmpty
        icon={Car}
        title={isToday ? t.owner.emptyToday : t.today.noRecords}
        note={isToday ? t.today.emptyNote : undefined}
      />
    );
  }

  /* В минус полоса не уходит: отрицательного куска не бывает. Когда
     день ушёл в убыток, владельцу не осталось ничего, и полоса честно
     состоит из одних расходов — знак минуса уже стоит в числе над ней. */
  const parts = [
    {
      key: 'mine',
      label: t.common.you,
      color: 'var(--m-grape)',
      amount: Math.max(0, profit),
    },
    {
      key: 'staff',
      label: t.owner.payrollAccrued,
      color: 'var(--m-step-2)',
      amount: payroll,
    },
    {
      key: 'costs',
      label: t.expenses.title,
      color: 'var(--m-step-3)',
      amount: costsTotal,
    },
  ].filter((p) => p.amount > 0);

  /* Молчим, когда сравнивать не с чем или разница меньше сотни драмов:
     «+217 %» от трёх помывок — не новость. */
  const showDelta = hasBase && Math.abs(diff) >= 100;

  return (
    <div className="flex flex-col gap-5">
      <MReading
        label={profit >= 0 ? t.owner.profit : t.owner.inTheRed}
        tone={profit < 0 ? 'bad' : 'ink'}
        /* Минус настоящий, U+2212: дефис на таком кегле читается точкой. */
        value={`${profit < 0 ? '−' : ''}${money(Math.abs(profit))}`}
        under={
          showDelta ? (
            <MDelta
              up={diff > 0}
              diff={`${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}
              label={isToday ? t.owner.vsLastWeek : t.owner.vsPrev}
            />
          ) : undefined
        }
      >
        {parts.length > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            {/* Сколько всего пришло. Без этой строки полоса показывала бы
                доли неизвестно от чего: число называет остаток, а целое,
                из которого он вышел, не звучало нигде. */}
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] text-m-muted">{t.owner.revenue}</span>
              <span className="num text-[16px] font-bold text-m-ink">{money(revenue)}</span>
            </div>
            <MSplitBar parts={parts} />
          </div>
        )}
      </MReading>

      {signals.length > 0 && <AttentionMobile signals={signals} label={t.today.attention} />}

      {/* Плитки и есть легенда полосы: у зарплаты и расходов стоит точка
          цвета их куска. Отдельной легенды под полосой нет намеренно —
          она называла бы те же две суммы вторыми, а плитки, в отличие
          от неё, ведут туда, где с этими деньгами что-то делают. */}
      <MGrid>
        <MStatTile
          icon={Car}
          label={unitWord(count, unitOne, t.locale)}
          value={String(count)}
          note={`${t.owner.avgCheck} ${money(avgCheck)}`}
          href={revenueHref}
        />
        {isToday ? (
          <MStatTile
            icon={Users}
            label={t.owner.onShift}
            value={String(presentCount)}
            href="/owner/staff"
          />
        ) : (
          <MStatTile icon={Coins} label={t.owner.revenue} value={money(revenue)} href={revenueHref} />
        )}
        <MStatTile
          icon={Wallet}
          label={t.owner.payrollAccrued}
          value={money(payroll)}
          dot={payroll > 0 ? 'var(--m-step-2)' : undefined}
          href="/owner/payroll"
        />
        <MStatTile
          icon={Receipt}
          label={t.expenses.title}
          value={money(costsTotal)}
          dot={costsTotal > 0 ? 'var(--m-step-3)' : undefined}
          href={expensesHref}
        />
      </MGrid>

      {/* Графика в сегодняшнем дне нет намеренно. Он отвечал на вопрос
          «как шёл день», а этот вопрос владелец мойки себе не задаёт: у
          него за день пять машин, и «как шло» видно по журналу
          построчно. За месяц график остаётся: там тридцать точек, и
          форма месяца — настоящий ответ, которого больше нигде нет. */}
      {!isToday && flow && (
        <MSection title={t.today.flowPeriod}>
          <MTile radius="card" className="gap-3">
            <FlowChartMobile points={flow} currency={currency} />
          </MTile>
        </MSection>
      )}

      {crew.length > 0 && (
        <MSection
          title={isToday ? t.today.nowWorking : t.settings.staff}
          count={crew.length}
          action={<MLink href="/owner/staff">{t.owner.allClients}</MLink>}
        >
          {/* Лента вбок, а не список строк: на мойке людей двое, у
              автосервиса бывает шестеро, и вертикальный столбец из шести
              отодвинул бы журнал за нижний край. */}
          <div className="m-rail -mx-4 flex gap-2.5 px-4 pb-1">
            {crew.map((person) => (
              <CrewTile
                key={person.staffId ?? person.name}
                person={person}
                money={money}
                units={unitCount(person.count, unitOne, t.locale)}
              />
            ))}
          </div>
        </MSection>
      )}

      {!isToday && mix.length > 0 && (
        <MSection title={t.today.paidWith}>
          <MTile radius="card" className="items-center gap-4 py-5">
            <MRing
              parts={mix.map((m, i) => ({
                key: m.key,
                color: mSeries(i),
                amount: m.value,
              }))}
              total={money(revenue)}
              caption={t.owner.revenue}
            />
            {/* Легенда пилюлями: процент и подпись читаются рядом с
                куском, а не отыскиваются под кольцом строкой. */}
            <div className="flex flex-wrap justify-center gap-2">
              {mix.map((m, i) => (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-m-tile py-1.5 pr-3 pl-2.5 text-[13px] font-semibold text-m-ink"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: mSeries(i) }}
                  />
                  {m.label}
                  <span className="num text-m-muted">{m.share}%</span>
                </span>
              ))}
            </div>
          </MTile>
        </MSection>
      )}
    </div>
  );
}

const SIGNAL_ICON: Record<Signal['icon'], ComponentType<{ className?: string }>> = {
  discount: Percent,
  cancel: Ban,
  cash: Wallet,
  nobody: UserX,
};

/**
 * Что необычного сегодня: скидки, отмены, расхождение наличных, пустая
 * смена в рабочее время.
 *
 * Ряд фишек, и только когда есть что сказать: в обычный день владелец
 * его не видит вовсе. Тревожное лаймовое — это единственный случай,
 * когда лайм на сводке значит не «сейчас», а «посмотри сюда»; и он
 * работает ровно потому, что больше ничего лаймового на экране нет.
 */
function AttentionMobile({ signals, label }: { signals: Signal[]; label: string }) {
  return (
    <div className="m-rail -mx-4 flex gap-2 px-4" role="status" aria-label={label}>
      {signals.map((s) => {
        const Icon = SIGNAL_ICON[s.icon];
        return (
          <Link
            key={s.key}
            href={s.href}
            className={cn(
              'm-press inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold',
              s.tone === 'neutral' ? 'bg-m-tile text-m-ink' : 'bg-m-lime text-[#170b2b]',
            )}
          >
            <Icon aria-hidden className="size-[16px]" />
            <span className="num">{s.text}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Карточка человека: лицо и заработок одним предметом.
 *
 * Сумма здесь — заработок человека, а не выручка, которую он принёс:
 * приход уже назван строкой над полосой, и повторять его именами
 * значило бы показать одни и те же деньги дважды.
 */
function CrewTile({
  person,
  money,
  units,
}: {
  person: CrewMember;
  money: (n: number) => string;
  units: string;
}) {
  return (
    <MTile
      radius="tile"
      padded={false}
      className="h-[86px] w-[168px] shrink-0 justify-center gap-0 px-4"
    >
      <div className="flex items-center gap-2.5">
        <MAvatar
          name={person.name}
          color={person.present ? person.color : 'var(--m-tile-strong)'}
          size={36}
          present={person.present}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate text-[14px] leading-tight font-semibold',
              person.present ? 'text-m-ink' : 'text-m-muted',
            )}
          >
            {person.name}
          </span>
          <span className="num truncate text-[16px] leading-tight font-bold text-m-ink">
            {money(person.earned)}
          </span>
        </span>
      </div>
      <span className="num mt-1.5 truncate text-[11.5px] text-m-faint">{units}</span>
    </MTile>
  );
}
