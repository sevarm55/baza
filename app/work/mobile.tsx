import type { ReactNode } from 'react';

import { MobileCard, MobileStatRow } from '@/components/mobile';
import { getDict } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/money';
import { unitWord } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { CashRow } from './journal-mobile';
import { ShiftClock } from './shift-clock';

/**
 * Экран смены на телефоне — то же табло, что в приложении.
 *
 * Показание по оси экрана, строка фактов под ним, наличные отдельной
 * полосой, журнал строками. Экран открывают сорок раз за смену мокрыми
 * руками, поэтому три вещи, ради которых его открывают, не уезжают за
 * край никогда: переключатель смены закреплён сверху, кнопка записи —
 * снизу, заработок стоит между ними.
 *
 * Главное число — то, которое принадлежит смотрящему. У мойщика это его
 * доля, у владельца доли обычно нет вовсе: он получает всё, и главным
 * становится выручка смены. Показывать ему «твой заработок: 0 ֏» самым
 * крупным числом экрана значит показывать пустоту.
 *
 * Графика хода смены здесь нет намеренно. На своей смене человек и так
 * знает, как шёл день; линия отвечала бы на вопрос, которого у него не
 * возникает, и занимала место между заработком и фактами.
 */
export async function ShiftReadingMobile({
  greetingName,
  takesShare,
  earned,
  revenue,
  count,
  cash,
  state,
  openedAt,
  sinceLabel,
  rangeLabel,
  currency,
  unitOne,
}: {
  /** имя того, кто смотрит: единственное место, где продукт зовёт по имени */
  greetingName: string;
  takesShare: boolean;
  earned: number;
  revenue: number;
  count: number;
  cash: number;
  state: 'on' | 'done' | 'off';
  /** ISO начала открытой смены; пусто — смена не идёт */
  openedAt: string | null;
  /** «с 08:40» */
  sinceLabel: string | null;
  /** «08:40 — 17:20» у закрытой смены */
  rangeLabel: string | null;
  currency: string;
  unitOne: string;
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const value = takesShare ? earned : revenue;

  return (
    <div className="flex flex-col gap-2.5">
      <MobileCard radius="hero" padded={false} className="min-h-[154px] px-4 py-4">
        {/* Приветствие по времени суток — единственное место, где продукт
            обращается к человеку по имени. Стоит одну строку, а экран
            перестаёт быть казённым: мойщик открывает его сорок раз за
            смену, и каждый раз его встречала таблица. */}
        <p className="truncate text-[12px] font-semibold text-m-muted">
          {hello(t)}
          {greetingName ? `, ${greetingName}` : ''}
        </p>

        <p className="mt-3.5 text-[13px] font-medium text-m-muted">
          {takesShare ? t.work.earnedToday : t.work.shiftRevenue}
        </p>
        <p className="num mt-0.5 text-[clamp(30px,11vw,46px)] leading-[1.05] font-bold tracking-[-0.02em] text-m-ink">
          {money(value)}
        </p>

        {/* Состояние смены — строкой под цифрой, а не значком в углу.
            Значок отвечал только «да или нет», а спрашивают на этом
            экране другое: с которого часа и сколько уже. Три состояния,
            а не два: «ещё не вставал» и «отработал и закрылся» — это
            утро и вечер одного дня. */}
        <div className="mt-2.5 flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'size-[7px] shrink-0 rounded-full',
              state === 'on' ? 'bg-m-good' : 'border-[1.5px] border-m-muted',
            )}
          />
          <span
            className={cn(
              'num truncate text-[13px] font-semibold',
              state === 'on' ? 'text-m-good' : 'text-m-muted',
            )}
          >
            {state === 'on' && openedAt ? (
              <>
                {sinceLabel}
                <ShiftClock openedAt={openedAt} />
              </>
            ) : state === 'done' && rangeLabel ? (
              rangeLabel
            ) : (
              t.work.emptyOff
            )}
          </span>
        </div>
      </MobileCard>

      {/* Числа строкой на полотне, без коробок вокруг каждого. Подпись
          называет, ЧЬИ это деньги: «выручка смены» стояло и здесь, и в
          кабинете владельца, а рядом — заработок мойщика, и какое из
          двух похожих чисел твоё, приходилось решать.

          У кого доли нет — а это владелец, который моет сам, — вместо
          суммы работ стоят наличные: сумма работ у него уже написана
          главным числом выше, и повторять её второй раз значит показать
          одни и те же деньги дважды. */}
      <MobileStatRow
        items={[
          { key: 'count', label: unitWord(count, unitOne, t.locale), value: String(count) },
          takesShare
            ? { key: 'sum', label: t.work.worksTotal, value: money(revenue) }
            : { key: 'cash', label: t.payment.cash, value: money(cash) },
        ]}
      />

      {/* Наличные отдельной полосой: это единственное число экрана,
          которое превращается в действие — столько с человека спросят
          при закрытии смены. Тому, у кого доли нет, они уже стоят в
          строке выше, и полосы под ней нет. */}
      {takesShare && state !== 'off' && <CashRow cash={money(cash)} />}
    </div>
  );
}

/**
 * Приветствие по времени суток.
 *
 * Ночью «доброй ночи» звучит прощанием, поэтому там нейтральное.
 * Считается на сервере в зоне того, кто смотрит: разъехаться с часами
 * на экране оно не может, потому что и то и другое собирает один ответ.
 */
function hello(t: Awaited<ReturnType<typeof getDict>>): ReactNode {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t.work.greetingMorning;
  if (hour >= 12 && hour < 18) return t.work.greetingDay;
  if (hour >= 18) return t.work.greetingEvening;
  return t.work.greetingPlain;
}
