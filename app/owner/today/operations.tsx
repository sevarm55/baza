'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Panel } from '@/components/board';
import { OrderMenu } from '@/components/order-menu';
import { formatMoney } from '@/lib/money';
import type { Op, OpWorker } from './model';
import { useT } from '@/lib/i18n/client';
import { staffCount, unitCount } from '@/lib/i18n/terms';

/**
 * Сегодняшняя работа.
 *
 * Не «лента» и не «журнал»: владелец приходит смотреть не на строки
 * базы, а на то, что за день сделали. Поэтому одна строка обязана
 * отвечать целиком — когда, какая машина, кто мыл, что делали, чем
 * заплатили, сколько взяли и сколько из этого ушло человеку.
 *
 * Столбцов ровно столько, сколько глаз сравнивает по вертикали. Всё
 * остальное — ставка, с которой посчитана доля, и остаток бизнеса —
 * живёт в раскрытии строки: там оно не занимает ширину у сорока
 * записей, а показывается один раз для той, о которой спросили.
 *
 * На телефоне таблицы нет вовсе. Строка из восьми колонок в четыреста
 * точек превращается либо в горизонтальную прокрутку, где не видно
 * начала записи, либо в кашу; поэтому там карточка, и она показывает
 * всё сразу — раскрывать на телефоне нечего.
 *
 * Итог под столбцом считается по тем записям, которые ВИДНЫ. Отдельный
 * запрос считал бы период целиком и разошёлся бы со столбцом, как только
 * включат фильтр или лента упрётся в свой предел, — а сумма, не сходящаяся
 * с тем, что под ней, хуже отсутствующей.
 */
export function TodayOperations({
  ops,
  currency,
  unitOne,
  staffRole,
  clientIdLabel,
  title,
  note,
  empty,
  /** способы оплаты, которые в этих записях реально встретились */
  methods,
  staff,
  teamPercent,
}: {
  ops: Op[];
  currency: string;
  unitOne: string;
  staffRole: string;
  clientIdLabel: string;
  title: string;
  note: string;
  /** пусто: у сегодняшнего дня и у закрытого месяца это разные слова */
  empty: { title: string; note?: string };
  methods: { key: string; label: string }[];
  /**
   * Активные люди точки — для правки состава из меню записи.
   *
   * Пусто — правка не предлагается: выбирать не из кого.
   */
  staff: { id: string; name: string }[];
  /**
   * Общий процент команды. Null — совместная работа у бизнеса выключена,
   * и собрать из одиночной записи бригаду нечем.
   */
  teamPercent: number | null;
}) {
  const t = useT();
  const [method, setMethod] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Фильтры появляются, только когда есть что фильтровать: на дне из
     четырёх машин с одними наличными полоса кнопок — это управление,
     которое ничего не меняет, и его приходится прочитать, чтобы это
     понять. */
  const filterable = ops.length > 8 && methods.length > 1;
  const searchable = ops.length > 12;

  const shown = useMemo(() => {
    const needle = query.trim().replace(/[\s-]+/g, '').toUpperCase();
    return ops.filter(
      (o) =>
        (method === null || o.payment === method) &&
        (needle === '' || (o.clientKey ?? '').replace(/[\s-]+/g, '').toUpperCase().includes(needle)),
    );
  }, [ops, method, query]);

  const totals = shown.reduce(
    (acc, o) => ({
      price: acc.price + o.price,
      share: acc.share + o.share,
      yours: acc.yours + o.yours,
    }),
    { price: 0, share: 0, yours: 0 },
  );

  return (
    <Panel
      title={title}
      count={ops.length > 0 ? ops.length : undefined}
      className="lg:col-span-12 lg:self-start"
      actions={
        searchable ? (
          <label className="op-search">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              className="num"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.owner.clientsSearch}
              aria-label={t.owner.clientsSearch}
              autoComplete="off"
            />
          </label>
        ) : undefined
      }
    >
      <p className="-mt-2 mb-3 text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
        {note}
      </p>

      {filterable && (
        <div className="op-filters" role="group" aria-label={t.owner.colPayment}>
          <button type="button" data-on={method === null ? '' : undefined} onClick={() => setMethod(null)}>
            {t.today.all}
          </button>
          {methods.map((m) => (
            <button
              key={m.key}
              type="button"
              data-on={method === m.key ? '' : undefined}
              onClick={() => setMethod(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {ops.length === 0 ? (
        <Empty title={empty.title} note={empty.note} />
      ) : shown.length === 0 ? (
        <Empty title={t.owner.clientsNotFound} />
      ) : (
        <>
          {/* ─────────── телефон: строки ─────────── */}
          <div className="grid lg:hidden">
            {shown.map((o) => (
              <article key={o.id} className="op-card">
                <span className="op-card-key num">{o.clientKey ?? '—'}</span>
                {/* Скидка: зачёркнутый прайс рядом со взятым. Без него
                    «6 500» не отличить от обычной цены, и о скидке
                    владелец не узнаёт вовсе. */}
                <span className="op-card-price num">
                  {o.listPrice !== null && (
                    <span className="op-list-price">{money(o.listPrice)}</span>
                  )}
                  {money(o.price)}
                </span>

                <span className="op-card-meta truncate">
                  {o.time} · {o.serviceName} · {o.paymentLabel}
                </span>

                {/* Все, кто мыл. Раньше здесь стояло одно имя, и другого
                    быть не могло; теперь у машины бывает бригада, и
                    назвать одного из троих значило бы соврать про
                    двоих. */}
                <span className="op-card-who">
                  <Crew crew={o.crew} />
                </span>

                {/* Кому сколько досталось — прямо в карточке, а не под
                    раскрытием: на телефоне место есть, а лишнее нажатие
                    мокрыми руками стоит дороже строки текста.

                    У совместной работы сумма общая на всех, и рядом
                    сказано, на скольких: «5 400 ֏ · 45 % · 3 мойщика»
                    объясняет и число, и почему оно такое. */}
                <span className="op-card-split num">
                  {t.owner.colShare} {money(o.share)}
                  {o.percent > 0 && ` · ${o.percent}%`}
                  {o.crew.length > 1 && ` · ${staffCount(o.crew.length, staffRole, t.locale)}`}
                  {' · '}
                  {t.today.toBusiness} {money(o.yours)}
                </span>

                <span className="op-card-menu">
                  <OrderMenu
                    orderId={o.id}
                    clientKey={o.clientKey}
                    crew={o.crew}
                    staff={staff}
                    teamPercent={teamPercent}
                  />
                </span>
              </article>
            ))}

            <div className="op-total">
              <span>
                {t.owner.feedTotal}
                <b className="num">
                  {' '}
                  · {unitCount(shown.length, unitOne, t.locale)}
                </b>
              </span>
              <span className="num">
                {money(totals.price)}
                <span style={{ color: 'var(--board-muted)' }}> · {money(totals.share)}</span>
              </span>
            </div>
          </div>

          {/* ─────────── широкий экран: таблица ───────────

              Прокрутка на самой таблице, а не на странице. В обычный
              день столбцы помещаются целиком; но имя в двадцать семь
              знаков или сумма в миллион могут не поместиться, и тогда
              уезжать вбок должна таблица, а не всё полотно вместе с
              плитой итога. */}
          <div className="op-table hidden lg:block">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t.owner.colTime}</th>
                  <th>{clientIdLabel}</th>
                  <th>{staffRole}</th>
                  <th>{t.owner.colService}</th>
                  <th>{t.owner.colPayment}</th>
                  <th className="end">{t.owner.colPrice}</th>
                  <th className="end">{t.owner.colShare}</th>
                  <th className="end hidden xl:table-cell">{t.today.toBusiness}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <Line
                    key={o.id}
                    op={o}
                    currency={currency}
                    staffRole={staffRole}
                    staff={staff}
                    teamPercent={teamPercent}
                    open={open === o.id}
                    onToggle={() => setOpen((was) => (was === o.id ? null : o.id))}
                  />
                ))}
              </tbody>

              {/* Итог под столбцами. Лента отвечает «что было», но не
                  «сколько всего», и владелец складывал столбец глазами
                  или уходил на другой экран сверять. Суммы стоят ровно
                  под своими столбцами, поэтому читаются без подписи. */}
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    {t.owner.feedTotal} · {unitCount(shown.length, unitOne, t.locale)}
                  </td>
                  <td className="num end">{money(totals.price)}</td>
                  <td className="num end">{money(totals.share)}</td>
                  <td className="num end hidden xl:table-cell">{money(totals.yours)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * Строка записи и её раскрытие.
 *
 * Раскрытие — вторая строка таблицы, а не всплывающая панель: колонки
 * над ней остаются на месте, и видно, к какой именно записи относится
 * разбор. Внутри одно предложение про деньги: клиент заплатил столько,
 * человеку начислено столько по такой ставке, бизнесу осталось столько.
 * Полоса под ним показывает то же самое пропорцией — доля исполнителя
 * читается раньше, чем прочитаны числа.
 */
function Line({
  op,
  currency,
  staffRole,
  staff,
  teamPercent,
  open,
  onToggle,
}: {
  op: Op;
  currency: string;
  staffRole: string;
  staff: { id: string; name: string }[];
  teamPercent: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const cut = op.price > 0 ? Math.round((op.share / op.price) * 100) : 0;
  const shared = op.crew.length > 1;

  return (
    <>
      {/* Открывается вся строка, кроме нажимаемого в ней.

          Не через `stopPropagation` на каждой кнопке: гасить всплытие
          означает отбирать событие и у тех, кто слушает его на
          документе, — а на документе его слушает выпадающее меню, чтобы
          знать, когда закрыться. Строка просто не реагирует на клик,
          который начался внутри кнопки. */}
      <tr
        className="op-row"
        data-open={open ? '' : undefined}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a')) onToggle();
        }}
      >
        <td className="num" style={{ color: 'var(--board-muted)' }}>
          {op.time}
        </td>
        <td className="num font-semibold">{op.clientKey ?? '—'}</td>
        {/* Точка перед именем — тот же цвет человека, что в списке
            работающих и во дворе. В таблице из сорока строк по ней видно,
            кто мыл, до чтения имени: цвет читается раньше слова.

            Имя и услуга обрезаются по своему пределу, а не по ширине
            ячейки: в таблице с автоматической раскладкой длинное имя
            растягивает столбец, отбирая место у чисел справа, — и
            «Հովհաննես Մկրտչյան-Սարգսյան» ломал строку целиком. Полное
            имя остаётся подсказкой. */}
        <td>
          <Crew crew={op.crew} />
        </td>
        <td style={{ color: 'var(--board-muted)' }}>
          <span className="op-cut" title={op.serviceName}>
            {op.serviceName}
          </span>
        </td>
        {/* Способ оплаты меткой, а не словом в ряду с остальными:
            наличные и карта — это не описание услуги, а признак записи,
            и раздельно они пересчитываются глазами быстрее. */}
        <td>
          <span className="tag">{op.paymentLabel}</span>
        </td>
        <td className="num end font-semibold">
          {op.listPrice !== null && (
            <span className="op-list-price">{money(op.listPrice)}</span>
          )}
          {money(op.price)}
        </td>
        <td className="num end" style={{ color: 'var(--board-muted)' }}>
          {op.share > 0 ? money(op.share) : '—'}
        </td>
        <td className="num end hidden xl:table-cell">{money(op.yours)}</td>
        <td className="end">
          <span className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="chev"
              data-open={open ? '' : undefined}
              aria-expanded={open}
              aria-label={`${op.clientKey ?? ''} · ${money(op.price)}`}
              onClick={onToggle}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <OrderMenu
              orderId={op.id}
              clientKey={op.clientKey}
              crew={op.crew}
              staff={staff}
              teamPercent={teamPercent}
            />
          </span>
        </td>
      </tr>

      {open && (
        <tr className="op-detail">
          <td colSpan={9}>
            <div className="op-split">
              <span className="op-split-head">
                {t.today.clientPaid} <b className="num">{money(op.price)}</b>
                {/* Совместная работа названа словом и разобрана числами:
                    процент команды и общий фонд стоят над списком, а
                    доли — под ним. Без этой строки «45 %» рядом с
                    «1 800 ֏» читается как ошибка расчёта. */}
                {shared && (
                  <>
                    {' · '}
                    {t.crew.title} · {staffCount(op.crew.length, staffRole, t.locale)} ·{' '}
                    {t.crew.pool} <b className="num">{money(op.share)}</b>
                  </>
                )}
              </span>

              {/* Полоса: доля каждого участника и остаток бизнеса.
                  Сегментов столько, сколько людей, а не два: у бригады из
                  троих один общий кусок ничего не объясняет. */}
              <span className="op-split-bar" aria-hidden>
                {op.crew.map((p, i) => (
                  <span
                    key={p.staffId ?? `noname-${i}`}
                    style={{
                      width: `${op.price > 0 ? (p.earned / op.price) * 100 : 0}%`,
                      background: p.color,
                    }}
                  />
                ))}
                <span style={{ width: `${100 - cut}%`, background: 'var(--tone-violet-glow)' }} />
              </span>

              <span className="op-split-legend">
                {op.crew.map((p, i) => (
                  <span key={p.staffId ?? `noname-${i}`}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    {p.name ?? '—'}
                    <b className="num">{money(p.earned)}</b>
                    {/* Ставку показываем только у одиночной записи: у
                        совместной она общая на всех и уже названа над
                        списком, а повторённая у каждого имени читается
                        как «столько получил каждый». */}
                    {!shared && op.percent > 0 && <i className="num">{op.percent}%</i>}
                  </span>
                ))}
                <span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: 'var(--tone-violet-glow)' }}
                    aria-hidden
                  />
                  {t.today.toBusiness}
                  <b className="num">{money(op.yours)}</b>
                </span>
              </span>

              {/* Кто внёс запись — последней строкой и тише всего.
                  Спрашивают редко, но когда спрашивают, других способов
                  узнать нет. У одиночной мойки строки нет: автор и
                  исполнитель там один человек, и повторять его имя
                  третий раз незачем. */}
              {shared && op.authorName && (
                <span className="op-split-head" style={{ color: 'var(--board-muted)' }}>
                  {t.crew.author} {op.authorName}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Кто мыл — одной строкой в ширину столбца.
 *
 * Точка перед именем — тот же цвет человека, что в списке работающих и во
 * дворе: в таблице из сорока строк по ней видно, кто мыл, до чтения
 * имени. У бригады точек несколько, и это читается раньше всех слов —
 * «здесь работали несколько».
 *
 * Имена обрезаются по своему пределу, а не по ширине ячейки: в таблице с
 * автоматической раскладкой длинное имя растягивает столбец, отбирая
 * место у чисел справа.
 */
function Crew({ crew }: { crew: OpWorker[] }) {
  if (crew.length === 0) return <span style={{ color: 'var(--board-muted)' }}>—</span>;

  const names = crew.map((p) => p.name ?? '—');
  return (
    <span className="flex items-center gap-2">
      <span className="flex shrink-0 items-center gap-[3px]">
        {crew.map((p, i) => (
          <span
            key={p.staffId ?? `noname-${i}`}
            className="size-2 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
        ))}
      </span>
      <span className="op-cut font-medium" title={names.join(' · ')}>
        {names.join(' · ')}
      </span>
    </span>
  );
}

function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <div className="grid justify-items-center gap-1.5 py-10 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      {note && (
        <p className="max-w-[38ch] text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
}
