'use client';

import { useMemo, useState } from 'react';
import { Car } from 'lucide-react';

import { MAvatar, MChip, MChipRow, MEmpty, MRow, MRows, MSection } from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { unitCount } from '@/lib/i18n/terms';
import { OrderActions } from './order-actions';
import type { Op } from './model';

/**
 * Журнал записей на телефоне.
 *
 * Номер машины поднят в первую строку и набран крупнее всего
 * остального: это единственный опознавательный знак записи. Время стоит
 * в тихой строке под ним: на вопрос «что было» оно отвечает последним,
 * а колонка одинаковых «17:00» слева забирала бы вход в строку у того,
 * ради чего в неё смотрят.
 *
 * Кто помыл — лицом его цвета: на мойке два-три работника, и цвет
 * различает их быстрее, чем текст. Тот же цвет у этого человека в ленте
 * смены и в списке зарплат — цвет здесь имя, а не украшение.
 *
 * Таблицы тут нет и быть не может: шесть колонок на 375 точках либо
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
    <MSection
      title={title}
      count={ops.length > 0 ? unitCount(ops.length, unitOne, t.locale) : undefined}
    >
      {filterable && (
        <MChipRow className="pb-1">
          <MChip selected={method === null} onClick={() => setMethod(null)}>
            {t.today.all}
          </MChip>
          {methods.map((m) => (
            <MChip
              key={m.key}
              selected={method === m.key}
              /* Повторное нажатие снимает фильтр: иначе вернуться ко
                 «всем» можно только прицелившись в первую фишку,
                 которая на узком экране уже уехала влево. */
              onClick={() => setMethod((prev) => (prev === m.key ? null : m.key))}
            >
              {m.label}
            </MChip>
          ))}
        </MChipRow>
      )}

      {shown.length === 0 ? (
        <MEmpty icon={Car} title={empty.title} note={empty.note} />
      ) : (
        <>
          <MRows>
            {shown.map((op) => (
              <Row key={op.id} op={op} money={money} teamPercent={teamPercent} staff={staff} t={t} />
            ))}
          </MRows>
          <p className="px-1 pt-2 text-[12px] text-m-faint">{note}</p>
        </>
      )}
    </MSection>
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
  /* Лицо — по первому участнику. Совместную работу вносит один человек,
     а работают несколько; состав называется в тихой строке, а у
     одиночной записи его нет вовсе — там имя ровно одно. */
  const face = op.crew[0]?.name ?? op.authorName ?? '—';
  const color = op.crew[0]?.color ?? 'var(--m-tile-strong)';
  const shared = op.crew.length > 1;

  return (
    <MRow
      lead={<MAvatar name={face} color={color} size={38} />}
      title={<span className="num">{op.clientKey ?? '—'}</span>}
      /* Услуга — потому что без неё цена необъяснима: 2 500 и 12 000 в
         соседних строках выглядят ошибкой, пока не видно, что одно это
         кузов, а другое химчистка. */
      note={[op.serviceName, op.paymentLabel.toLocaleLowerCase(t.locale)]
        .filter(Boolean)
        .join(' · ')}
      /* Время и состав бригады — третьей строкой, самой тихой: на
         вопрос «что было» они отвечают последними. */
      extra={[
        op.time,
        shared ? op.crew.map((c) => c.name).filter(Boolean).join(', ') : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      value={
        <span className="flex items-baseline justify-end gap-1.5">
          {/* Скидка: зачёркнутый прайс рядом со взятым. Без него «6 500»
              не отличить от обычной цены, и о скидке владелец не узнаёт
              вовсе. */}
          {op.listPrice !== null && (
            <span className="num text-[12.5px] font-normal text-m-faint line-through">
              {money(op.listPrice)}
            </span>
          )}
          {money(op.price)}
        </span>
      }
      hint={`${t.today.toBusiness} ${money(op.yours)}`}
      trailing={
        <OrderActions
          orderId={op.id}
          clientKey={op.clientKey}
          crew={op.crew}
          staff={staff}
          teamPercent={teamPercent}
          detail={`${op.serviceName} · ${money(op.price)}`}
        />
      }
    />
  );
}
