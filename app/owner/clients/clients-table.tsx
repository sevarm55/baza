'use client';

import { useMemo, useState } from 'react';
import { ClientDrawer } from '@/components/client-drawer';
import { GroupDrawer, type Group } from '@/components/group-drawer';
import { FlowStrip } from '@/components/flow-strip';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

export type ClientRow = {
  id: string;
  key: string;
  visits: number;
  total: number;
  days: number;
};

type Sort = 'recent' | 'often' | 'richest';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: hy.owner.sortRecent },
  { key: 'often', label: hy.owner.sortOften },
  { key: 'richest', label: hy.owner.sortRichest },
];

/**
 * Список клиентов: поиск, порядок, переход в историю машины.
 *
 * Клиентский компонент из-за поиска. Отбор через адрес перезагружал бы
 * страницу на каждой букве, а клиентов на мойке сотни, но не сотни
 * тысяч — они уже все здесь, и фильтровать их на месте и мгновенно
 * дешевле, чем спрашивать сервер.
 *
 * Порядок — это порядок, а не отбор: ни один клиент не пропадает,
 * меняется только кто наверху. Отбор здесь был бы вреден — владелец
 * ищет конкретную машину, а не подмножество.
 */
export function ClientsTable({
  rows,
  lostAfter,
  currency,
  unit,
}: {
  rows: ClientRow[];
  lostAfter: number;
  /* Валюта строкой, а не готовые суммы таблицей: панель тоже считает
     деньги, а передать ей функцию через границу сервер-клиент нельзя. */
  currency: string;
  unit: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [open, setOpen] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);

  const money = (n: number) => formatMoney(n, currency);

  const loyal = rows.filter((c) => c.visits > 1);
  const lost = rows.filter((c) => c.days > lostAfter);
  const avg = rows.length ? Math.round(rows.reduce((s, c) => s + c.total, 0) / rows.length) : 0;

  /* Пробелы и регистр не в счёт: номер диктуют вслух и записывают как
     придётся — «93LM227» и «93 lm 227» это одна машина. */
  const found = useMemo(() => {
    const q = query.replace(/\s/g, '').toUpperCase();
    const base = q
      ? rows.filter((r) => r.key.replace(/\s/g, '').toUpperCase().includes(q))
      : rows;

    const sorted = [...base];
    if (sort === 'recent') sorted.sort((a, b) => a.days - b.days);
    if (sort === 'often') sorted.sort((a, b) => b.visits - a.visits);
    if (sort === 'richest') sorted.sort((a, b) => b.total - a.total);
    return sorted;
  }, [rows, query, sort]);

  return (
    <>
      {/* Полоса живёт здесь, а не на серверной странице: по её плиткам
          нажимают, а нажатие — это состояние. Каждая открывает свой
          список тем же приёмом, что и карточка машины: панелью справа,
          не уводя со страницы и не теряя набранный поиск.

          «Средний чек» не нажимается: за ним нет списка, это одно число
          про всех сразу. Кнопка, которая ничего не открывает, хуже
          обычного текста — по ней жмут и не понимают, сломалось или так
          задумано. */}
      <div className="mb-[var(--seam)]">
        <FlowStrip
          links={[
            { label: hy.owner.clientsTotal, value: String(rows.length), onOpen: () => setGroup('all') },
            { label: hy.owner.clientsLoyal, value: String(loyal.length), onOpen: () => setGroup('loyal') },
            { label: hy.owner.clientsAvg, value: money(avg) },
            {
              label: hy.owner.clientsLost,
              value: String(lost.length),
              strong: lost.length > 0,
              note: lost.length > 0 ? hy.owner.comeBack : undefined,
              onOpen: lost.length > 0 ? () => setGroup('lost') : undefined,
            },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              style={{ color: 'var(--board-muted)' }}
              aria-hidden
            >
              <circle cx="7.2" cy="7.2" r="4.4" />
              <path d="m10.6 10.6 2.6 2.6" />
            </svg>
          </span>
          <input
            className="field !ps-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hy.owner.clientsSearch}
            aria-label={hy.owner.clientsSearch}
            autoComplete="off"
          />
        </label>

        {/* Порядок — жёлобом, как период на сводке. */}
        <div
          className="flex gap-0.5 rounded-[8px] p-[3px]"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
        >
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className="rounded-[6px] px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors"
              style={
                sort === s.key
                  ? { background: 'var(--on-board)', color: 'var(--board)', fontWeight: 600 }
                  : { color: 'var(--board-muted)' }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {found.length === 0 ? (
        <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {query ? hy.owner.clientsNotFound : hy.common.empty}
        </p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>{hy.owner.tabClients}</th>
              <th className="end">{hy.owner.visits}</th>
              <th className="end">{hy.owner.clientsTotalSpent}</th>
              <th className="end">{hy.owner.lastVisit}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {found.map((c) => {
              const gone = c.days > lostAfter;
              return (
                /* Нажимается вся строка: целиться в шесть символов
                   номера незачем, открыть надо строку целиком.

                   Без `role` и `tabIndex` на `<tr>`, и это не забывчивость.
                   С ними страница переставала оживать целиком: React
                   бросал гидратацию этого поддерева, молча, без ошибки в
                   консоли — таблица оставалась серверной разметкой, и не
                   работали ни поиск, ни сортировка. Клавиатуре служит
                   настоящая кнопка в конце строки, у неё и фокус, и имя
                   для читалки экрана. */
                <tr key={c.id} className="row-click" onClick={() => setOpen(c.key)}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span
                        className="num text-[15px] font-bold tracking-wide"
                        style={{ color: 'var(--on-board)' }}
                      >
                        {c.key}
                      </span>
                      {/* Метка постоянного прямо в строке: до неё это
                          читалось только счётчиком визитов, а «сколько
                          раз был» и «свой ли это человек» — разные
                          вопросы, и второй решается взглядом. */}
                      {c.visits > 1 && <span className="tag-good">{hy.owner.clientLoyal}</span>}
                    </span>
                  </td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {c.visits}
                  </td>
                  <td className="num end font-semibold">{money(c.total)}</td>
                  <td
                    className="num end"
                    style={{
                      color: gone ? 'var(--warn-on-board)' : 'var(--board-muted)',
                      fontWeight: gone ? 600 : undefined,
                    }}
                  >
                    {/* «վերջինը՝» обязательно: без него «3 օր առաջ» рядом
                        с числом визитов читается чем угодно — сроком,
                        промежутком, давностью первого приезда. */}
                    {hy.owner.lastVisitPrefix}{' '}
                    {c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
                  </td>
                  <td className="end">
                    <button
                      type="button"
                      onClick={() => setOpen(c.key)}
                      aria-label={`${c.key} · ${hy.owner.clientHistory}`}
                      style={{ color: 'var(--board-muted)' }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m6.5 4 4 4-4 4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-[12px]" style={{ color: 'var(--board-muted)' }}>
        {found.length} / {rows.length} · {unit}
      </p>

      <GroupDrawer
        group={group}
        rows={rows}
        lostAfter={lostAfter}
        money={money}
        onClose={() => setGroup(null)}
        /* Из списка группы — сразу в карточку машины: группа отвечает
           «кто это», карточка «что он у меня брал», и второй вопрос
           всегда следует за первым. */
        onPick={(key) => {
          setGroup(null);
          setOpen(key);
        }}
      />

      <ClientDrawer
        plate={open}
        onClose={() => setOpen(null)}
        money={money}
        lostAfter={lostAfter}
      />
    </>
  );
}
