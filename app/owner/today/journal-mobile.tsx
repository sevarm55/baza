'use client';

import { useMemo, useState } from 'react';

import {
  MobileChip,
  MobileDataList,
  MobileDataRow,
  MobileEmpty,
  MobileSection,
} from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { unitCount } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { OrderActions } from './order-actions';
import type { Op } from './model';

/**
 * Журнал записей на телефоне — строками прямо на полотне, без карточки.
 *
 * Номер машины поднят в первую строку и набран крупнее всего
 * остального: это единственный опознавательный знак записи. Время
 * стоит внизу, в самом тихом месте строки: на вопрос «что было» оно
 * отвечает последним, а колонка одинаковых «17:00» слева забирала бы
 * вход в строку у того, ради чего в неё смотрят.
 *
 * Кто помыл — кружком его цвета: на мойке два-три работника, и цвет
 * различает их быстрее, чем текст. Тот же цвет у этого человека в ленте
 * смены и в списке зарплат — цвет здесь имя, а не украшение.
 *
 * Таблицы тут нет и быть не может: шесть колонок на 360 точках либо
 * едут вбок, либо сжимаются до нечитаемого. Поэтому те же данные
 * разложены двумя колонками — что было слева, деньги справа.
 */
export function JournalMobile({
  ops,
  methods,
  currency,
  unitOne,
  staffRole: _staffRole,
  clientIdLabel: _clientIdLabel,
  teamPercent,
  staff,
  title,
  note,
  empty,
}: {
  ops: Op[];
  methods: { key: string; label: string }[];
  currency: string;
  unitOne: string;
  staffRole: string;
  clientIdLabel: string;
  teamPercent: number | null;
  staff: { id: string; name: string }[];
  title: string;
  note: string;
  empty: { title: string; note?: string };
}) {
  const t = useT();
  const [method, setMethod] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Полоса появляется, только когда есть что фильтровать: на дне из
     четырёх машин с одними наличными это управление, которое ничего не
     меняет, и прочитать его приходится, чтобы это понять. Тот же порог,
     что в приложении и в кабинете. */
  const filterable = ops.length > 8 && methods.length > 1;
  const shown = useMemo(
    () => (filterable && method ? ops.filter((o) => o.payment === method) : ops),
    [ops, method, filterable],
  );

  return (
    <MobileSection
      title={title}
      count={ops.length > 0 ? unitCount(ops.length, unitOne, t.locale) : undefined}
    >
      {filterable && (
        <div className="-mx-4 mb-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            <MobileChip tone="ink" selected={method === null} onClick={() => setMethod(null)}>
              {t.today.all}
            </MobileChip>
            {methods.map((m) => (
              <MobileChip
                key={m.key}
                tone="ink"
                selected={method === m.key}
                /* Повторное нажатие снимает фильтр: иначе вернуться ко
                   «всем» можно только прицелившись в первую кнопку,
                   которая на узком экране уже уехала влево. */
                onClick={() => setMethod((prev) => (prev === m.key ? null : m.key))}
              >
                {m.label}
              </MobileChip>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <MobileEmpty compact title={empty.title} note={empty.note} />
      ) : (
        <>
          <MobileDataList>
            {shown.map((op) => (
              <Row key={op.id} op={op} money={money} teamPercent={teamPercent} staff={staff} t={t} />
            ))}
          </MobileDataList>
          <p className="px-1 pt-3 text-[11.5px] text-m-muted">{note}</p>
        </>
      )}
    </MobileSection>
  );
}

function Row({
  op,
  money,
  teamPercent,
  staff,
  t,
}: {
  op: Op;
  money: (n: number) => string;
  teamPercent: number | null;
  staff: { id: string; name: string }[];
  t: ReturnType<typeof useT>;
}) {
  /* Кружок с буквой — по первому участнику. Совместную работу вносит
     один человек, а работают несколько; состав называется отдельной
     строкой, а у одиночной записи его нет вовсе — там имя ровно одно. */
  const face = op.crew[0]?.name ?? op.authorName ?? '—';
  const color = op.crew[0]?.color ?? 'var(--m-muted)';
  const shared = op.crew.length > 1;

  return (
    <MobileDataRow
      lead={
        <span
          aria-hidden
          className="flex size-[34px] items-center justify-center rounded-full text-[14px] font-bold text-white"
          style={{ background: color }}
        >
          {face.slice(0, 1).toUpperCase()}
        </span>
      }
      title={
        <span className="num truncate text-[16px] leading-tight font-semibold text-m-ink">
          {op.clientKey ?? '—'}
        </span>
      }
      /* Услуга — потому что без неё цена необъяснима: 2 500 и 12 000 в
         соседних строках выглядят ошибкой, пока не видно, что одно это
         кузов, а другое химчистка. */
      note={`${op.serviceName} · ${op.paymentLabel.toLocaleLowerCase(t.locale)}`}
      extra={
        <>
          {op.time}
          {shared && ` · ${op.crew.map((c) => c.name).filter(Boolean).join(', ')}`}
        </>
      }
      value={
        <span className="flex items-baseline justify-end gap-1.5">
          {/* Скидка: зачёркнутый прайс рядом со взятым. Без него «6 500»
              не отличить от обычной цены, и о скидке владелец не узнаёт
              вовсе. */}
          {op.listPrice !== null && (
            <span className="num text-[12px] font-normal text-m-muted line-through">
              {money(op.listPrice)}
            </span>
          )}
          {money(op.price)}
        </span>
      }
      sub={`${t.today.toBusiness} ${money(op.yours)}`}
      /* При нулевой ставке строки долей нет вовсе: у владельца, который
         записывает сам, процента нет, и «ему 0 ֏» в каждой записи — шум. */
      subQuiet={op.percent > 0 ? `${t.owner.earned} ${money(op.share)}` : undefined}
      action={
        <OrderActions
          orderId={op.id}
          clientKey={op.clientKey}
          crew={op.crew}
          staff={staff}
          teamPercent={teamPercent}
          detail={`${op.serviceName} · ${money(op.price)}`}
        />
      }
      className={cn('min-h-[62px]')}
    />
  );
}
