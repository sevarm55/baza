'use client';

import { useState, useTransition } from 'react';
import { Car, Plus, X } from 'lucide-react';
import { Sheet } from '@/components/sheet';
import { Panel } from '@/components/board';
import { assignJobAction, cancelJobAction } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';
import type { OpenCar } from './model';

export type Assignee = { id: string; name: string };
export type Offer = { id: string; name: string };

/**
 * «Сейчас» — что происходит на площадке в эту минуту.
 *
 * Раньше это жило двумя разными приборами в разных местах экрана:
 * очередь стояла отдельной панелью, машины в работе — первыми строками
 * ленты, а открыта ли смена вообще, читалось по зелёным точкам в списке
 * людей. Три ответа на один вопрос, и ни одного места, куда посмотреть,
 * чтобы его задать.
 *
 * Здесь они собраны в один прибор и в том порядке, в каком спрашивают:
 * работает ли мойка вообще, что стоит во дворе, когда была последняя
 * запись.
 *
 * Счётчик в заголовке — машины во дворе целиком, а не только ждущие.
 * Разделение «ждёт / моют» никуда не делось, оно в самой строке: у
 * каждой машины написано её состояние. Прежний счётчик считал только
 * ждущих, и список под ним оказывался длиннее числа над ним.
 *
 * Имён людей здесь нет намеренно. Они стоят строкой ниже, в списке
 * работающих, с теми же точками состояния — а имя, повторённое дважды на
 * расстоянии сантиметра, заставляет сверять два списка вместо того,
 * чтобы прочитать один.
 */
export function NowPanel({
  className,
  cars,
  staff,
  services,
  unitOne,
  staffRole,
  clientIdLabel,
  onShift,
  since,
  lastRecord,
  recordsToday,
}: {
  className?: string;
  cars: OpenCar[];
  staff: Assignee[];
  services: Offer[];
  unitOne: string;
  staffRole: string;
  clientIdLabel: string;
  /** сколько человек стоит на смене прямо сейчас */
  onShift: number;
  /** когда открылась самая ранняя из открытых смен, «08:00» */
  since: string | null;
  /** время последней записи за сегодня, «14:00» */
  lastRecord: string | null;
  recordsToday: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Panel
      className={className}
      title={hy.today.now}
      count={cars.length > 0 ? cars.length : undefined}
      actions={
        /* Приём машины — единственное действие этого прибора, поэтому
           оно стоит в его заголовке, а не кнопкой под списком: там его
           пришлось бы искать под пустотой, когда двор пуст.

           Между 1024 и 1280 столбец узкий, и подпись в два слова в
           заголовок не помещается — там остаётся плюс, а название
           достаётся подсказке и читалке экрана. На телефоне столбец во
           всю ширину, и подпись возвращается. */
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={staff.length === 0}
          className="btn-inline"
          title={hy.jobs.assign}
          aria-label={hy.jobs.assign}
        >
          <Plus size={15} aria-hidden />
          <span className="lg:hidden xl:inline">{hy.jobs.assign}</span>
        </button>
      }
    >
      {/* Состояние смены — первой строкой и без карточки вокруг.
          Пустая смена не должна занимать прибор в полный рост: когда
          мойка ещё не открылась, это одна строка, а не пустое место
          размером с график. */}
      <div className="now-shift">
        <span
          className={`size-2.5 shrink-0 rounded-full ${onShift > 0 ? 'dot-live' : 'dot-idle'}`}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="now-shift-title">
            {onShift > 0 ? hy.today.shiftOn : hy.today.nobodyOnShift}
          </span>
          <span className="now-shift-note num">
            {onShift > 0
              ? [since ? hy.today.since(since) : null, `${onShift} ${staffRole.toLocaleLowerCase('hy')}`]
                  .filter(Boolean)
                  .join(' · ')
              : /* Смены нет, а записи есть — это не противоречие, а
                   обычный день: переключатель выключили, работа осталась.
                   Молчать об этом нельзя, иначе прибор читается как
                   «сегодня ничего не было». */
                recordsToday > 0
                ? hy.today.recordsWithoutShift(recordsToday)
                : hy.owner.emptyToday}
          </span>
        </span>
      </div>

      {/* Двор прокручивается внутри прибора, а не растягивает его.

          Машин во дворе может оказаться десять — в субботу так и
          бывает, — и десять карточек подряд делают правый столбец вдвое
          выше графика рядом. Три с половиной видимых карточки говорят,
          что список продолжается, а число во дворе стоит в заголовке и
          от прокрутки не зависит. */}
      {cars.length > 0 && (
        <>
          {/* Подпись стоит над самим списком, а не под заголовком
              прибора: заголовок относится и к строке смены над ней, а
              «принято, но ещё не записано» — только к машинам. */}
          <p className="now-note">{hy.today.nowNote}</p>
          <div className="now-cars">
            {cars.map((car) => (
              <CarRow key={car.id} car={car} />
            ))}
          </div>
        </>
      )}

      {/* Последняя запись — тихой строкой у нижнего края прибора: это
          отметка живости, а не показание. Пока записей нет, строки тоже
          нет: «последняя запись: —» сообщает ровно то же, что пустота,
          но занимает место. */}
      {lastRecord && (
        <div className="now-last num">
          {hy.today.lastRecord} · {lastRecord}
        </div>
      )}

      <AssignSheet
        open={open}
        onClose={() => setOpen(false)}
        staff={staff}
        services={services}
        unitOne={unitOne}
        clientIdLabel={clientIdLabel}
      />
    </Panel>
  );
}

/**
 * Машина во дворе.
 *
 * Три строки в столбик, а не две с состоянием у правого края. Правый
 * край хорош, пока прибор широкий; в столбце трети экрана «Լվացվում է»
 * и «22 րոպե առաջ» — это сто пикселей, которые не сжимаются ни при
 * какой ширине, и карточка переставала помещаться в собственную панель,
 * выталкивая правый край страницы за экран.
 *
 * В столбик каждая строка обрезается сама и ничего не ломает.
 */
function CarRow({ car }: { car: OpenCar }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="now-car">
      {/* Два состояния, два цвета, и оба читаются на светлом полотне.
          Лайм на восемнадцати процентах давал светло-жёлтый значок на
          светло-жёлтой плашке — знак был, а увидеть его было нельзя.
          Зелёный здесь тот же, что у точки «на смене»: работа идёт.
          Ждущая машина нейтральна — с ней пока ничего не происходит. */}
      <span
        className="now-car-mark"
        data-washing={car.washing ? '' : undefined}
        aria-hidden
      >
        <Car size={14} />
      </span>

      <span className="now-car-body">
        <span className="num now-car-key">{car.clientKey}</span>
        <span className="now-car-meta">
          {/* Имя цветом человека — тем же, что в списке работающих и в
              ленте: кто взял машину, читается до чтения слова. */}
          {car.staffName && (
            <span className="font-semibold" style={{ color: car.staffColor }}>
              {car.staffName}
            </span>
          )}
          {car.staffName && car.serviceName ? ' · ' : ''}
          {car.serviceName}
        </span>
        <span className="now-car-state" data-washing={car.washing ? '' : undefined}>
          {car.state} <span className="num">· {car.waited}</span>
        </span>
      </span>

      {/* Снять с очереди может только владелец: машина уехала, не
          дождавшись, — его решение, а не мойщика, которому просто не
          хочется её мыть. */}
      <button
        type="button"
        disabled={pending}
        title={hy.jobs.cancel}
        aria-label={`${hy.jobs.cancel} · ${car.clientKey}`}
        onClick={() => startTransition(async () => void (await cancelJobAction(car.id)))}
        className="flex size-7 shrink-0 items-center justify-center rounded-[6px] transition hover:bg-surface2 disabled:opacity-40"
        style={{ color: 'var(--board-muted)' }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function AssignSheet({
  open,
  onClose,
  staff,
  services,
  unitOne,
  clientIdLabel,
}: {
  open: boolean;
  onClose: () => void;
  staff: Assignee[];
  services: Offer[];
  unitOne: string;
  clientIdLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState('');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side
      title={hy.jobs.assignTitle}
      subtitle={unitOne}
      footer={
        <button form="job-assign" className="btn btn-auto" disabled={pending}>
          {pending ? hy.common.loading : hy.jobs.assign}
        </button>
      }
    >
      <form
        id="job-assign"
        className="grid gap-3"
        action={(data) =>
          startTransition(async () => {
            await assignJobAction(data);
            setKey('');
            onClose();
          })
        }
      >
        <label className="grid gap-1.5">
          <span className="label">{clientIdLabel}</span>
          {/* Поле управляемое нарочно. Пробелы и дефисы не принимаем на
              вводе — номер один и вид у него один, как на пластине; а
              править значение в обработчике неуправляемого поля нельзя:
              React его не перерисовывает, и набранное остаётся как
              набрали. */}
          <input
            className="field num"
            name="clientKey"
            required
            autoFocus
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/[\s-]+/g, '').toUpperCase())}
          />
        </label>

        {/* Мойщик — обязателен. Наряд без исполнителя это заметка, а
            заметки продукт не хранит: у любой машины во дворе есть тот,
            кого за неё спросят. */}
        <label className="grid gap-1.5">
          <span className="label">{hy.jobs.who}</span>
          <select className="field" name="staffId" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Услуга — намерение, а не факт, поэтому не обязательна:
            владелец принимает машину и часто ещё торгуется о цене.
            Окончательное слово остаётся за записью в конце. */}
        <label className="grid gap-1.5">
          <span className="label">{hy.work.stepService}</span>
          <select className="field" name="serviceId" defaultValue="">
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="label">{hy.jobs.note}</span>
          <input className="field" name="note" autoComplete="off" />
        </label>
      </form>
    </Sheet>
  );
}
