'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { Segmented } from '@/components/segmented';
import { compactClientKey } from '@/lib/client-key';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { formatPhone } from '@/lib/phone';
import { ClientSheet } from './client-sheet';
import type { ClientGroup, ClientRow, ClientSort } from './model';

const SORTS: { key: ClientSort; label: string }[] = [
  { key: 'recent', label: hy.owner.sortRecent },
  { key: 'often', label: hy.owner.sortOften },
  { key: 'richest', label: hy.owner.sortRichest },
];

/**
 * Клиентская база: кто это, кто возвращается и что с этим делать.
 *
 * Клиентский компонент из-за поиска. Отбор через адрес перезагружал бы
 * страницу на каждой букве, а клиентов на мойке сотни, но не сотни
 * тысяч — они уже все здесь, и фильтровать их на месте и мгновенно
 * дешевле, чем спрашивать сервер.
 *
 * Отбор и порядок — две разные вещи, и раньше они были свалены в одну.
 * Порядок отвечает «кто наверху», отбор — «кого показывать»; смешанные в
 * одном ряду кнопок, они заставляют помнить, что из нажатого сейчас
 * действует. Здесь это два ряда: сверху группы, справа от поиска —
 * порядок.
 *
 * Группы не выдуманы: «новый» — один визит, «свой» — больше одного,
 * «пропал» — та же граница, по которой загорается колокольчик. Придумать
 * тут свой порог значило бы, что продукт спорит сам с собой: в
 * колокольчике повод есть, в списке тихо.
 */
export function ClientsWorkspace({
  rows,
  lostAfter,
  currency,
  initialGroup = 'all',
}: {
  rows: ClientRow[];
  lostAfter: number;
  /* Валюта строкой, а не готовые суммы: карточка тоже считает деньги, а
     передать ей функцию через границу сервер-клиент нельзя. */
  currency: string;
  /** группа, открытая сразу: сюда приводит колокольчик и полоса показаний */
  initialGroup?: ClientGroup;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ClientGroup>(initialGroup);
  const [sort, setSort] = useState<ClientSort>('recent');
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency);

  const counts = {
    all: rows.length,
    fresh: rows.filter((c) => c.visits === 1).length,
    loyal: rows.filter((c) => c.visits > 1).length,
    lost: rows.filter((c) => c.days > lostAfter).length,
  };

  /* Пробелы, дефисы и регистр не в счёт: номер диктуют вслух и
     записывают как придётся — «93LM227», «93 lm 227» и «93-LM-227» это
     одна машина.

     Приводим тем же `compactClientKey`, которым запись ложится в базу, а
     не своей строчкой рядом. Своя тут и стояла, и отличалась дважды:
     дефис не убирала, а русские буквы не переводила в латинские. Номер
     «22 OO 145», набранный в поиске с русскими О, не находился вовсе —
     карточка была в списке, на экране выглядела ровно так же, как
     запрос, и не открывалась. Правило одно, поэтому и функция одна:
     вторая копия расходится с первой молча.

     Ищем и по имени с телефоном: раз владелец их вписал, он будет искать
     человека так, как его помнит, а не по номеру машины. */
  const found = useMemo(() => {
    const q = compactClientKey(query);
    const base = rows.filter((r) => {
      if (group === 'fresh' && r.visits !== 1) return false;
      if (group === 'loyal' && r.visits < 2) return false;
      if (group === 'lost' && r.days <= lostAfter) return false;
      if (!q) return true;
      return [r.key, r.name ?? '', r.phone ?? ''].some((v) =>
        compactClientKey(v).includes(q),
      );
    });

    const sorted = [...base];
    if (sort === 'recent') sorted.sort((a, b) => a.days - b.days);
    if (sort === 'often') sorted.sort((a, b) => b.visits - a.visits);
    if (sort === 'richest') sorted.sort((a, b) => b.total - a.total);
    return sorted;
  }, [rows, query, sort, group, lostAfter]);

  return (
    <>
      <div className="mb-[var(--seam)] flex flex-wrap items-center gap-2">
        <Segmented
          id="client-group"
          current={group}
          onSelect={(key) => setGroup(key as ClientGroup)}
          scroll
          label={hy.owner.tabClients}
          items={[
            { key: 'all', label: hy.owner.allClients, count: counts.all },
            { key: 'loyal', label: hy.owner.clientsLoyal, count: counts.loyal },
            { key: 'fresh', label: hy.owner.clientsFresh, count: counts.fresh },
            { key: 'lost', label: hy.owner.clientsLost, count: counts.lost },
          ]}
        />
      </div>

      {/* У прибора нет заголовка: его называет выбранная группа строкой
          выше, и повторять её здесь значило бы написать одно и то же
          слово с одним и тем же числом дважды подряд. */}
      <Panel>
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <label className="op-search min-w-0 flex-1">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              className="num !w-full !max-w-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={hy.owner.clientsSearch}
              aria-label={hy.owner.clientsSearch}
              autoComplete="off"
            />
          </label>

          {/* Порядок — рядом с поиском, а не отдельной полосой: обе
              настройки относятся к одному списку и меняются вместе. */}
          <Segmented
            id="client-sort"
            current={sort}
            onSelect={(key) => setSort(key as ClientSort)}
            scroll
            label={hy.owner.sortRecent}
            items={SORTS}
          />
        </div>

        {found.length === 0 ? (
          <EmptyState
            title={query ? hy.owner.clientsNotFound : hy.owner.clientsEmpty}
            note={query ? undefined : hy.owner.clientsEmptyNote}
          />
        ) : (
          <>
            {/* Телефон: строками, а не таблицей.

                Пять колонок на экране в ладонь шириной делят его так, что
                «վերջինը՝ այսօր» переносится в два слова на строку, а номер
                машины — то единственное, что здесь ищут глазами, —
                оказывается зажат между ними. Таблица нужна там, где
                столбцы сравнивают; на телефоне сравнивать нечем, там
                читают строку за строкой. */}
            <div className="board-journal lg:hidden">
              {found.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpen(c.key)}
                  aria-label={`${c.key} · ${hy.owner.clientHistory}`}
                  className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="num flex items-center gap-2">
                      <span className="shrink-0 text-[14.5px] font-bold tracking-wide">
                        {c.key}
                      </span>
                      {c.visits > 1 && <span className="tag-good">{hy.owner.clientLoyal}</span>}
                      {c.name && (
                        <span
                          className="truncate text-[12.5px]"
                          style={{ color: 'var(--board-muted)' }}
                        >
                          {c.name}
                        </span>
                      )}
                    </span>

                    <span
                      className="num block truncate text-[12px]"
                      style={{
                        color: c.days > lostAfter ? 'var(--warn-on-board)' : 'var(--board-muted)',
                      }}
                    >
                      {c.visits} {hy.owner.visits} · {hy.owner.lastVisitPrefix} {c.last}
                    </span>
                  </span>

                  <span className="num shrink-0 text-[14px] font-semibold">{money(c.total)}</span>
                  <ChevronRight
                    className="size-3.5 shrink-0"
                    style={{ color: 'var(--board-muted)' }}
                    aria-hidden
                  />
                </button>
              ))}
            </div>

            <table className="tbl hidden lg:table">
              <thead>
                <tr>
                  <th>{hy.owner.tabClients}</th>
                  <th className="end">{hy.owner.visits}</th>
                  <th className="end">{hy.owner.clientAvg}</th>
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

                       Без `role` и `tabIndex` на `<tr>`, и это не
                       забывчивость. С ними React молча бросает гидратацию
                       поддерева, и таблица остаётся мёртвой разметкой:
                       не работают ни поиск, ни отбор. Клавиатуре служит
                       настоящая кнопка в конце строки. */
                    <tr key={c.id} className="row-click" onClick={() => setOpen(c.key)}>
                      <td>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="num shrink-0 text-[15px] font-bold tracking-wide"
                            style={{ color: 'var(--on-board)' }}
                          >
                            {c.key}
                          </span>
                          {c.visits > 1 && <span className="tag-good">{hy.owner.clientLoyal}</span>}
                          {contactLine(c.name, c.phone) && (
                            <span
                              className="num truncate text-[13px]"
                              style={{ color: 'var(--board-muted)' }}
                            >
                              {contactLine(c.name, c.phone)}
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="num end" style={{ color: 'var(--board-muted)' }}>
                        {c.visits}
                      </td>
                      <td className="num end" style={{ color: 'var(--board-muted)' }}>
                        {money(c.avg)}
                      </td>
                      <td className="num end font-semibold">{money(c.total)}</td>
                      <td
                        className="num end"
                        style={{
                          color: gone ? 'var(--warn-on-board)' : 'var(--board-muted)',
                          fontWeight: gone ? 600 : undefined,
                        }}
                      >
                        {/* «վերջինը՝» обязательно: без него «3 օր առաջ»
                            рядом с числом визитов читается чем угодно —
                            сроком, промежутком, давностью первого
                            приезда. */}
                        {hy.owner.lastVisitPrefix} {c.last}
                      </td>
                      <td className="end">
                        <button
                          type="button"
                          onClick={() => setOpen(c.key)}
                          aria-label={`${c.key} · ${hy.owner.clientHistory}`}
                          style={{ color: 'var(--board-muted)' }}
                        >
                          <ChevronRight className="size-3.5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <ClientSheet
        plate={open}
        onClose={() => setOpen(null)}
        money={money}
        lostAfter={lostAfter}
      />
    </>
  );
}

/**
 * «Արամ · +374 77 445 566» — то, что владелец вписал сам.
 *
 * При записи машины телефон не спрашивают: мойщик вводит номер, услугу и
 * оплату мокрыми руками. Контакты появляются позже, из карточки, — и раз
 * уж владелец их вписал, он этого человека так и ищет: имя помнится
 * лучше, чем шесть символов номера. Поэтому они и в строке, и в поиске,
 * а у машин без контактов не занимают места вовсе.
 */
function contactLine(name: string | null, phone: string | null): string {
  return [name, phone ? formatPhone(phone) : null].filter(Boolean).join(' · ');
}
