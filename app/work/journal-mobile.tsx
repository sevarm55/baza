'use client';

import { Banknote, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';

import {
  MobileCard,
  MobileDataList,
  MobileDataRow,
  MobileEmpty,
  MobileQuietButton,
  MobileSection,
} from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { staffCount } from '@/lib/i18n/terms';
import { hhmm } from '@/lib/time';
import { drop, retry } from '@/lib/offline';
import { useRouter } from 'next/navigation';
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
     названо строкой под заработком и подписью под кнопкой. */
  if (!shiftOpen && nothingYet) return null;

  return (
    <MobileSection
      title={t.work.recent}
      count={nothingYet ? undefined : recent.length + c.queue.length}
    >
      {nothingYet ? (
        /* Пусто до смены и пусто на смене — разные ответы. Первый
           говорит, что делать; второй — что всё в порядке и первая
           машина просто ещё не приехала. */
        <MobileEmpty
          compact
          title={shiftOpen ? t.work.emptyOpen : t.work.emptyOff}
          note={shiftOpen ? t.work.emptyOpenNote : t.work.emptyOffNote}
        />
      ) : (
        <MobileDataList>
          {c.stuck.map((q) => (
            <div key={q.ref} className="flex flex-col gap-3 py-3">
              <div className="flex items-start gap-2.5">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-m-warn" />
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-[14px] font-semibold text-m-ink">
                    {q.clientKey}
                  </div>
                  <div className="truncate text-[11.5px] text-m-muted">
                    {[q.serviceName, q.failure].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="num shrink-0 text-[14px] font-semibold text-m-ink">
                  {c.money(q.price)}
                </span>
              </div>
              <div className="flex gap-2">
                <MobileQuietButton
                  className="rounded-m-pill bg-m-inset px-3"
                  onClick={() => {
                    retry(q.ref);
                    router.refresh();
                  }}
                >
                  {t.payroll.retry}
                </MobileQuietButton>
                <MobileQuietButton
                  tone="muted"
                  className="rounded-m-pill bg-m-inset px-3"
                  onClick={() => drop(q.ref)}
                >
                  {t.expenses.remove}
                </MobileQuietButton>
              </div>
            </div>
          ))}

          {c.queued.map((q) => (
            <MobileDataRow
              key={q.ref}
              lead={
                <span className="flex size-[34px] items-center justify-center rounded-full bg-m-inset text-m-muted">
                  <WifiOff aria-hidden className="size-4" />
                </span>
              }
              title={
                <span className="num truncate text-[15px] font-semibold text-m-ink">
                  {q.clientKey}
                </span>
              }
              note={[q.serviceName, t.work.pending].join(' · ')}
              value={c.money(q.price)}
              sub={hhmm(q.at, timezone)}
            />
          ))}

          {recent.map((o) => {
            const shared = o.crew > 1;
            return (
              <MobileDataRow
                key={o.id}
                title={
                  <span className="num truncate text-[15.5px] font-semibold text-m-ink">
                    {o.clientKey ?? o.serviceName}
                  </span>
                }
                note={[
                  o.clientKey ? o.serviceName : null,
                  paymentLabel(o.payment, t),
                  hhmm(o.at, timezone),
                  /* Совместная работа названа словом и числом людей: без
                     них строка нечитаема — цена 12 000, а заработок
                     1 800, и почему, неизвестно. */
                  shared ? `${t.crew.joint} · ${staffCount(o.crew, staffRole, t.locale)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={c.money(o.price)}
                /* Своя доля — только у совместной. У одиночной она и так
                   вся наверху экрана, и вторая строка под ценой
                   повторяла бы одно число дважды. */
                sub={shared ? c.money(o.earned) : undefined}
                action={
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
        </MobileDataList>
      )}
    </MobileSection>
  );
}

/**
 * Сколько наличных на руках и что с ними будет.
 *
 * Графит, а не бумага: это единственное число экрана, которое
 * превращается в действие — столько с человека спросят при закрытии
 * смены. И только на тёмном в этом продукте можно пустить лайм: по
 * светлому он даёт контраст 1.06 и не виден вовсе. Сумма лаймом,
 * поэтому её видно раньше подписи.
 */
export function CashRow({ cash }: { cash: string }) {
  const t = useT();
  return (
    <MobileCard tone="slate" radius="box" padded={false} className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-m-chip bg-white/10">
          <Banknote aria-hidden className="size-4 text-lime" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14.5px] leading-tight font-semibold text-white">
            {t.payment.cash}
          </span>
          <span className="truncate text-[11.5px] leading-tight text-white/60">
            {t.work.toHandOver}
          </span>
        </span>
        <span className="num shrink-0 text-[20px] font-bold text-lime">{cash}</span>
      </div>
    </MobileCard>
  );
}

/** Признак того, что накопленное досылается. */
export function SyncMark({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-m-muted" role="status">
      <RefreshCw aria-hidden className="size-3.5 animate-spin" />
      {label}
    </span>
  );
}
