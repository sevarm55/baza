'use client';

import { RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { MEmpty, MRow, MRows, MSection, MTile } from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { staffCount } from '@/lib/i18n/terms';
import { hhmm } from '@/lib/time';
import { drop, retry } from '@/lib/offline';
import { paymentLabel, type Recent } from './order-model';
import type { Composer } from './use-composer';
import { RevokeOrder } from './revoke-order';

/**
 * Журнал смены на телефоне.
 *
 * Номер машины крупно, услуга и оплата под ним. Из сорока записей за
 * смену «Комплекс» встречается двадцать раз, а номер один: искать свою
 * ошибку по названию услуги — это читать список целиком.
 *
 * Каждая запись — своя плитка, а не строка таблицы: это предмет со
 * своей жизнью, его открывают, отменяют, повторяют.
 *
 * Отвергнутые записи стоят первыми и с разбором: молча выбросить работу
 * человека нельзя, а решить, повторить её или отменить, может только он
 * сам.
 */
export function ShiftJournalMobile({
  c,
  recent,
  timezone,
  shiftOpen,
  staffRole,
}: {
  c: Composer;
  recent: Recent[];
  timezone: string;
  shiftOpen: boolean;
  staffRole: string;
}) {
  const t = useT();
  const router = useRouter();

  const nothingYet = recent.length === 0 && c.queue.length === 0;

  /* Вне смены и без единой записи журнала нет вовсе: состояние уже
     названо фишкой под заработком и подписью под кнопкой. */
  if (!shiftOpen && nothingYet) return null;

  return (
    <MSection
      title={t.work.recent}
      count={nothingYet ? undefined : recent.length + c.queue.length}
    >
      {nothingYet ? (
        /* Пусто до смены и пусто на смене — разные ответы. Первый
           говорит, что делать; второй — что всё в порядке и первая
           машина просто ещё не приехала. */
        <MEmpty
          title={shiftOpen ? t.work.emptyOpen : t.work.emptyOff}
          note={shiftOpen ? t.work.emptyOpenNote : t.work.emptyOffNote}
        />
      ) : (
        <MRows>
          {c.stuck.map((q) => (
            <MTile key={q.ref} radius="row" className="gap-3">
              <div className="flex items-start gap-2.5">
                <TriangleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0 text-m-warn" />
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-[15.5px] font-bold text-m-ink">
                    {q.clientKey}
                  </div>
                  <div className="truncate text-[12.5px] text-m-muted">
                    {[q.serviceName, q.failure].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="num shrink-0 text-[15.5px] font-bold text-m-ink">
                  {c.money(q.price)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    retry(q.ref);
                    router.refresh();
                  }}
                  className="m-press h-10 flex-1 rounded-full bg-m-grape text-[14px] font-semibold text-white"
                >
                  {t.payroll.retry}
                </button>
                <button
                  type="button"
                  onClick={() => drop(q.ref)}
                  className="m-press h-10 flex-1 rounded-full bg-m-bg text-[14px] font-semibold text-m-muted"
                >
                  {t.expenses.remove}
                </button>
              </div>
            </MTile>
          ))}

          {c.queued.map((q) => (
            <MRow
              key={q.ref}
              lead={
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-m-bg text-m-muted">
                  <WifiOff aria-hidden className="size-[17px]" />
                </span>
              }
              title={<span className="num">{q.clientKey}</span>}
              note={[q.serviceName, t.work.pending].join(' · ')}
              value={c.money(q.price)}
              hint={hhmm(q.at, timezone)}
            />
          ))}

          {recent.map((o) => {
            const shared = o.crew > 1;
            return (
              <MRow
                key={o.id}
                title={<span className="num">{o.clientKey ?? o.serviceName}</span>}
                note={[o.clientKey ? o.serviceName : null, paymentLabel(o.payment, t)]
                  .filter(Boolean)
                  .join(' · ')}
                /* Время и состав — третьей строкой, самой тихой: на
                   вопрос «что было» они отвечают последними. Совместная
                   работа названа словом и числом людей, иначе строка
                   нечитаема: цена 12 000, а заработок 1 800, и почему,
                   неизвестно. */
                extra={[
                  hhmm(o.at, timezone),
                  shared ? `${t.crew.joint} · ${staffCount(o.crew, staffRole, t.locale)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={c.money(o.price)}
                /* Своя доля — только у совместной. У одиночной она и так
                   вся наверху экрана, и вторая строка под ценой
                   повторяла бы одно число дважды. */
                hint={shared ? c.money(o.earned) : undefined}
                trailing={
                  o.mine ? (
                    <RevokeOrder
                      orderId={o.id}
                      title={o.clientKey ?? o.serviceName}
                      detail={`${o.serviceName} · ${c.money(o.price)}`}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </MRows>
      )}
    </MSection>
  );
}

/** Признак того, что накопленное досылается. */
export function SyncMark({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-m-muted" role="status">
      <RefreshCw aria-hidden className="size-3.5 animate-spin" />
      {label}
    </span>
  );
}
