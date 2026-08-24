import type { ReactNode } from 'react';
import { Banknote, Car, Coins } from 'lucide-react';

import { MGrid, MReading, MStatTile } from '@/components/mobile';
import { getDict } from '@/lib/i18n/server';
import { formatMoney } from '@/lib/money';
import { unitWord } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { ShiftClock } from './shift-clock';

/**
 * Экран смены на телефоне.
 *
 * Экран открывают сорок раз за смену мокрыми руками, и он отвечает на
 * три вопроса в этом порядке: сколько я заработал → иду ли я сейчас →
 * сколько машин и денег. Всё остальное отсюда убрано.
 *
 * Главное число стоит прямо на белом листе, без коробки вокруг: коробка
 * сделала бы его одним из предметов экрана, а без неё оно и есть экран.
 *
 * Число — то, которое принадлежит смотрящему. У мойщика это его доля, у
 * владельца доли обычно нет вовсе: он получает всё, и главным
 * становится выручка смены. Показывать ему «твой заработок: 0 ֏» самым
 * крупным числом экрана значит показывать пустоту.
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
    <div className="flex flex-col gap-3">
      {/* Приветствие по времени суток — единственное место, где продукт
          обращается к человеку по имени. Стоит одну строку, а экран
          перестаёт быть казённым: мойщик открывает его сорок раз за
          смену, и каждый раз его встречала таблица. */}
      <p className="truncate px-1 text-[15px] font-semibold text-m-muted">
        {hello(t)}
        {greetingName ? `, ${greetingName}` : ''}
      </p>

      <MReading
        label={takesShare ? t.work.earnedToday : t.work.shiftRevenue}
        value={money(value)}
        under={
          <ShiftPill
            state={state}
            openedAt={openedAt}
            sinceLabel={sinceLabel}
            rangeLabel={rangeLabel}
            onLabel={t.work.onShift}
            offLabel={t.work.shiftNotStarted}
            doneLabel={t.work.shiftDone}
          />
        }
      />

      {/* Числа плитками, а не строкой на полотне: подпись называет, ЧЬИ
          это деньги. «Выручка смены» стояло и здесь, и в кабинете
          владельца, а рядом — заработок мойщика, и какое из двух похожих
          чисел твоё, приходилось решать.

          У кого доли нет — а это владелец, который моет сам, — вместо
          суммы работ стоят наличные: сумма работ у него уже написана
          главным числом выше, и повторять её второй раз значит показать
          одни и те же деньги дважды. */}
      <MGrid>
        <MStatTile
          icon={Car}
          label={unitWord(count, unitOne, t.locale)}
          value={String(count)}
        />
        {takesShare ? (
          <MStatTile icon={Coins} label={t.work.worksTotal} value={money(revenue)} />
        ) : (
          <MStatTile icon={Banknote} label={t.payment.cash} value={money(cash)} />
        )}
      </MGrid>

      {/* Наличные отдельной плиткой и грейпом: это единственное число
          экрана, которое превращается в действие — столько с человека
          спросят при закрытии смены. Тому, у кого доли нет, они уже
          стоят в плитке выше. */}
      {takesShare && state !== 'off' && (
        <MStatTile
          tone="grape"
          icon={Banknote}
          label={t.payment.cash}
          value={money(cash)}
          note={t.work.toHandOver}
        />
      )}
    </div>
  );
}

/**
 * Состояние смены — живой фишкой под числом.
 *
 * Три состояния, а не два: «ещё не вставал» и «отработал и закрылся» —
 * это утро и вечер одного дня. Идущая смена лаймовая и с дышащей
 * точкой: это ровно тот случай, ради которого в системе есть лайм —
 * «происходит прямо сейчас». Остальные два тихие.
 */
function ShiftPill({
  state,
  openedAt,
  sinceLabel,
  rangeLabel,
  onLabel,
  offLabel,
  doneLabel,
}: {
  state: 'on' | 'done' | 'off';
  openedAt: string | null;
  sinceLabel: string | null;
  rangeLabel: string | null;
  onLabel: string;
  offLabel: string;
  doneLabel: string;
}) {
  const live = state === 'on' && openedAt;

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-full py-2 pr-4 pl-3',
        live ? 'bg-m-lime text-[#170b2b]' : 'bg-m-tile text-m-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          live ? 'm-live bg-[#170b2b]' : 'border-[1.5px] border-current',
        )}
      />
      <span className="num truncate text-[13.5px] font-bold">
        {live ? (
          <>
            {onLabel} · {sinceLabel}
            <ShiftClock openedAt={openedAt} />
          </>
        ) : state === 'done' ? (
          `${doneLabel}${rangeLabel ? ` · ${rangeLabel}` : ''}`
        ) : (
          offLabel
        )}
      </span>
    </span>
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
