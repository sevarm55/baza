import Link from "next/link";

import {
  MobileCard,
  MobileDelta,
  MobileEmpty,
  MobileReading,
  MobileSection,
  MobileSplitBar,
  MobileSplitLegend,
  MobileStatRow,
} from "@/components/mobile";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { unitCount, unitWord } from "@/lib/i18n/terms";
import { cn } from "@/lib/utils";
import type { CrewMember, FlowPoint, MixSlice } from "./model";
import { Attention, type Signal } from "./attention";
import { FlowChartMobile } from "./flow-chart-mobile";

/**
 * Сводка владельца на телефоне — то же табло, что в приложении.
 *
 * Экран отвечает на шесть вопросов в том порядке, в каком их задают:
 * сколько мне осталось → сколько принесли → сколько ушло людям и на
 * расходы → сколько машин → кто работает → что было последним. Всё, что
 * не отвечает ни на один из них, отсюда убрано.
 *
 * Главное число — прибыль, а не выручка: выручку владелец и так
 * примерно помнит, она равна числу машин на средний чек. Прибыль не
 * помнит никто, в ней сидят проценты работников и доля аренды за день.
 *
 * Строка вычитания под числом — единственное место экрана, которое
 * объясняет, ОТКУДА оно взялось. Полоса отвечает на вопрос, которого
 * нет у колонок цифр: какой долей. Из каждых двадцати двух тысяч
 * владельцу осталось четыре, и это видно длиной куска, без чтения.
 *
 * Графика в сегодняшнем дне нет намеренно. Он отвечал на вопрос «как
 * шёл день», а этот вопрос владелец мойки себе не задаёт: у него за
 * день пять машин, и «как шло» видно по журналу построчно. За месяц
 * график остаётся: там тридцать точек, и форма месяца — настоящий
 * ответ, которого больше нигде нет.
 */
export async function TodayMobile({
  isToday,
  dayLabel,
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
}: {
  isToday: boolean;
  dayLabel: string;
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
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Период без единой записи — отдельное состояние, а не нулевое табло.
     Ноль выручки, пустая полоса и график без точек выглядят как данные,
     которые надо изучать; изучать тут нечего. */
  if (count === 0 && costsTotal === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="px-1 text-[12.5px] font-semibold text-m-muted">
          {dayLabel}
        </p>
        <MobileEmpty
          title={isToday ? t.owner.emptyToday : t.today.noRecords}
          note={isToday ? t.today.emptyNote : undefined}
        />
      </div>
    );
  }

  /* Три краски, а не серые оттенки: грейп у доли владельца — это марка,
     и главный кусок полосы должен быть ею; лаванда у зарплат, кобальт у
     расходов — те же цвета стоят под этими словами на всех экранах.

     В минус полоса не уходит: отрицательного куска не бывает. Когда
     день ушёл в убыток, владельцу не осталось ничего, и полоса честно
     состоит из одних расходов — знак минуса уже стоит в числе над ней. */
  const parts = [
    {
      key: "mine",
      label: t.common.you,
      color: "var(--primary)",
      amount: Math.max(0, profit),
    },
    {
      key: "staff",
      label: t.owner.payrollAccrued,
      color: "var(--m-lavender-ink)",
      amount: payroll,
    },
    {
      key: "costs",
      label: t.expenses.title,
      color: "var(--m-sand-ink)",
      amount: costsTotal,
    },
  ].filter((p) => p.amount > 0);

  /* Молчим, когда сравнивать не с чем или разница меньше сотни драмов:
     «+217 %» от трёх помывок — не новость. */
  const showDelta = hasBase && Math.abs(diff) >= 100;

  return (
    <div className="flex flex-col gap-3">
      <MobileReading
        meta={
          <>
            <span className="num truncate text-[12.5px] font-semibold text-m-muted">
              {dayLabel}
            </span>
            <CrewChip crew={crew} onShiftLabel={t.owner.onShift} />
          </>
        }
        label={profit >= 0 ? t.owner.profit : t.owner.inTheRed}
        tone={profit < 0 ? "bad" : profit > 0 ? "good" : "default"}
        /* Минус настоящий, U+2212: дефис на таком кегле читается точкой. */
        value={`${profit < 0 ? "−" : ""}${money(Math.abs(profit))}`}
        under={
          showDelta ? (
            <MobileDelta
              up={diff > 0}
              diff={`${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
              label={isToday ? t.owner.vsLastWeek : t.owner.vsPrev}
            />
          ) : undefined
        }
      >
        {parts.length > 0 && (
          <div className="mt-4 flex max-w-[380px] flex-col gap-2">
            {/* Сколько всего пришло. Без этой строки полоса показывала бы
                доли неизвестно от чего: число называет остаток, а целое,
                из которого он вышел, не звучало нигде. */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11.5px] text-m-muted">
                {t.owner.revenue}
              </span>
              <span className="num text-[13px] font-bold text-m-ink">
                {money(revenue)}
              </span>
            </div>
            <MobileSplitBar parts={parts} height={12} />
            <MobileSplitLegend
              parts={parts.map((p) => ({ ...p, value: money(p.amount) }))}
            />
          </div>
        )}
      </MobileReading>

      {signals.length > 0 && <Attention signals={signals} />}

      {isToday ? (
        <MobileStatRow
          items={[
            { key: "count", label: t.owner.served, value: String(count) },
            {
              key: "crew",
              label: t.owner.onShift,
              value: String(presentCount),
            },
          ]}
        />
      ) : (
        <>
          {flow && (
            <MobileCard radius="box" className="gap-3">
              <span className="text-[13px] font-semibold text-m-muted">
                {t.today.flowPeriod}
              </span>
              <FlowChartMobile points={flow} currency={currency} />
            </MobileCard>
          )}
          <MobileStatRow
            items={[
              {
                key: "count",
                label: t.owner.served,
                value: `${count} ${unitWord(count, unitOne, t.locale)}`.trim(),
              },
              { key: "avg", label: t.owner.avgCheck, value: money(avgCheck) },
            ]}
          />
          {mix.length > 0 && (
            <PaymentMixMobile
              mix={mix}
              money={money}
              title={t.today.paidWith}
            />
          )}
        </>
      )}

      {crew.length > 0 && (
        <MobileSection
          title={isToday ? t.today.nowWorking : t.settings.staff}
          count={crew.length}
          action={
            <Link
              href="/owner/staff"
              className="m-press text-[13px] font-semibold text-primary"
            >
              {t.owner.allClients}
            </Link>
          }
        >
          {/* Лента вбок, а не список строк: на мойке людей двое, у
              автосервиса бывает шестеро, и вертикальный столбец из шести
              отодвинул бы журнал за нижний край. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-2.5">
              {crew.map((person) => (
                <CrewTile
                  key={person.staffId ?? person.name}
                  person={person}
                  money={money}
                  units={unitCount(person.count, unitOne, t.locale)}
                />
              ))}
            </div>
          </div>
        </MobileSection>
      )}
    </div>
  );
}

/**
 * Кто сейчас на площадке — тёмной плашкой рядом с датой.
 *
 * Это не то же самое, что «работал сегодня»: человек мог встать час
 * назад и ещё ничего не намыть — по записям его не видно вовсе, а на
 * мойке он стоит.
 *
 * Плашка графитовая, и это не украшение. Лаймовая точка «сейчас на
 * смене» по светлому полотну даёт контраст 1.06 — её там просто нет.
 * Собственный тёмный фон — единственный способ пустить фирменный лайм в
 * верх экрана; заодно плашка сама читается органом управления.
 */
function CrewChip({
  crew,
  onShiftLabel,
}: {
  crew: CrewMember[];
  onShiftLabel: string;
}) {
  const present = crew.filter((p) => p.present);
  if (present.length === 0) return null;

  return (
    <Link
      href="/owner/staff"
      aria-label={`${onShiftLabel}: ${present.map((p) => p.name).join(", ")}`}
      className="m-press ml-auto flex min-w-0 items-center gap-1.5 rounded-m-pill bg-m-slate px-2.5 py-1.5"
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-lime"
        style={{ boxShadow: "0 0 4px var(--lime)" }}
      />
      <span className="truncate text-[12.5px] font-semibold text-white">
        {present.map((p) => p.name).join(", ")}
      </span>
    </Link>
  );
}

/**
 * Карточка человека: лицо и заработок одним предметом.
 *
 * Сумма здесь — заработок человека, а не выручка, которую он принёс:
 * приход уже назван строкой вычитания наверху, и повторять его именами
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
    <div className="flex h-[72px] w-[152px] shrink-0 items-center gap-2.5 rounded-m-tile border border-m-hair bg-m-surface px-3">
      <span className="relative inline-flex shrink-0" aria-hidden>
        <span
          className="flex size-[38px] items-center justify-center rounded-full text-[15px] font-bold text-white"
          style={{
            background: person.present ? person.color : "var(--m-inset)",
          }}
        >
          {person.name.slice(0, 1).toUpperCase()}
        </span>
        {person.present && (
          <span className="absolute -right-px -bottom-px size-[11px] rounded-full border-2 border-m-surface bg-m-good" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[13.5px] leading-tight font-semibold",
            person.present ? "text-m-ink" : "text-m-muted",
          )}
        >
          {person.name}
        </span>
        <span className="num truncate text-[15px] leading-tight font-bold text-m-ink">
          {money(person.earned)}
        </span>
        <span className="num truncate text-[10.5px] leading-tight text-m-muted">
          {units}
        </span>
      </span>
    </div>
  );
}

/**
 * Чем платили.
 *
 * Полоса одна на все способы, а не по одной под каждым: три полосы
 * разной длины друг под другом сравниваются плохо — глаз меряет их от
 * общего левого края, а доля читается от целого. Здесь целое и есть
 * полоса.
 */
function PaymentMixMobile({
  mix,
  money,
  title,
}: {
  mix: MixSlice[];
  money: (n: number) => string;
  title: string;
}) {
  return (
    <MobileCard radius="box" className="gap-3">
      <span className="text-[13.5px] font-semibold text-m-ink">{title}</span>
      <MobileSplitBar
        parts={mix.map((m) => ({
          key: m.key,
          color: m.color,
          amount: m.value,
        }))}
        height={10}
      />
      <div className="flex flex-col gap-2">
        {mix.map((m) => (
          <div key={m.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: m.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-m-ink">
              {m.label}
            </span>
            <span className="num shrink-0 text-[13.5px] font-semibold text-m-ink">
              {money(m.value)}
            </span>
            <span className="num w-9 shrink-0 text-right text-[12px] text-m-muted">
              {m.share}%
            </span>
          </div>
        ))}
      </div>
    </MobileCard>
  );
}
