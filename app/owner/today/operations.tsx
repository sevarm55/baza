'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Panel } from '@/components/board';
import { OrderMenu } from '@/components/order-menu';
import { formatMoney } from '@/lib/money';
import type { Op } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';

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
                <span className="op-card-price num">{money(o.price)}</span>

                <span className="op-card-meta truncate">
                  {o.time} · {o.serviceName} · {o.paymentLabel}
                </span>

                <span className="op-card-who">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: o.staffColor }}
                    aria-hidden
                  />
                  <span className="truncate">{o.staffName ?? '—'}</span>
                </span>

                {/* Кому сколько досталось — прямо в карточке, а не под
                    раскрытием: на телефоне место есть, а лишнее нажатие
                    мокрыми руками стоит дороже строки текста. */}
                <span className="op-card-split num">
                  {t.owner.colShare} {money(o.share)}
                  {o.percent > 0 && ` · ${o.percent}%`}
                  {' · '}
                  {t.today.toBusiness} {money(o.yours)}
                </span>

                <span className="op-card-menu">
                  <OrderMenu orderId={o.id} clientKey={o.clientKey} />
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
  open,
  onToggle,
}: {
  op: Op;
  currency: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const cut = op.price > 0 ? Math.round((op.share / op.price) * 100) : 0;

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
          <span className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: op.staffColor }}
              aria-hidden
            />
            <span className="op-cut font-medium" title={op.staffName ?? undefined}>
              {op.staffName ?? '—'}
            </span>
          </span>
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
        <td className="num end font-semibold">{money(op.price)}</td>
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
            <OrderMenu orderId={op.id} clientKey={op.clientKey} />
          </span>
        </td>
      </tr>

      {open && (
        <tr className="op-detail">
          <td colSpan={9}>
            <div className="op-split">
              <span className="op-split-head">
                {t.today.clientPaid} <b className="num">{money(op.price)}</b>
              </span>

              <span className="op-split-bar" aria-hidden>
                <span style={{ width: `${cut}%`, background: op.staffColor }} />
                <span style={{ width: `${100 - cut}%`, background: 'var(--tone-violet-glow)' }} />
              </span>

              <span className="op-split-legend">
                <span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: op.staffColor }}
                    aria-hidden
                  />
                  {op.staffName ?? '—'}
                  <b className="num">{money(op.share)}</b>
                  {op.percent > 0 && <i className="num">{op.percent}%</i>}
                </span>
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
            </div>
          </td>
        </tr>
      )}
    </>
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
