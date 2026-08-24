'use client';

import { useEffect, useRef } from 'react';
import { Percent, Ticket } from 'lucide-react';

import { MButton, MChip, MCover, MField, MInput, MPlateInput } from '@/components/mobile';
import { useT } from '@/lib/i18n/client';
import { currencySymbol, formatMoney } from '@/lib/money';
import { staffCount } from '@/lib/i18n/terms';
import { personColor } from '@/lib/person-color';
import { cn } from '@/lib/utils';
import type { Composer } from './use-composer';
import { agoLabel, type OrderFlowProps } from './order-model';
import { PAYMENTS } from './payment-icons';

/**
 * Запись машины на телефоне — одним экраном поверх смены.
 *
 * Мастера из трёх шагов нет. Он стоил тех же трёх касаний, но между ними
 * были три смены страницы: человек не видел, что уже выбрал, не мог
 * поправить номер, не вернувшись назад, и не знал суммы, пока не доходил
 * до оплаты. Здесь все три вещи на виду сразу — номер, услуги, оплата.
 *
 * Порядок сверху вниз повторяет порядок работы: сначала подъехала
 * машина, потом решили, что с ней делают, потом взяли деньги. Итог и
 * оплата прибиты к низу, у большого пальца руки, которой держат телефон.
 *
 * Клавиатура не перекрывает ни поле, ни кнопку: лист живёт в `100dvh` —
 * единице, которая на телефоне уменьшается вместе с появлением
 * клавиатуры, — а его середина прокручивается сама.
 */
export function ComposerMobile({
  c,
  services,
  tiers,
  tierLabel,
  currency,
  clientIdLabel,
  clientIdType,
  addLabel,
  unitOne,
  staffRole,
}: {
  c: Composer;
} & Pick<
  OrderFlowProps,
  | 'services'
  | 'tiers'
  | 'tierLabel'
  | 'currency'
  | 'clientIdLabel'
  | 'clientIdType'
  | 'addLabel'
  | 'unitOne'
  | 'staffRole'
>) {
  const t = useT();

  /* Каретка встаёт в поле номера, как только лист открылся: номер —
     первое, что набирают, и клавиатура должна подняться вместе с
     формой, а не по второму касанию. */
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (c.step === 'compose') inputRef.current?.focus();
  }, [c.step]);

  /* Абонемент покрывает ОДНУ услугу, поэтому предлагается только когда
     выбрана одна. */
  const single = c.chosen.length === 1 ? c.chosen[0] : null;
  const activePass = single ? c.known?.passes?.find((p) => p.serviceId === single.id) : undefined;
  const usingPass = c.payment === 'pass' && Boolean(activePass);
  const sum = usingPass ? t.payment.pass : formatMoney(c.charged, currency, t.locale);

  return (
    <MCover
      open={c.step === 'compose'}
      onOpenChange={(next) => {
        if (!next && !c.pending) c.close();
      }}
      title={t.work.newUnit(unitOne)}
      closeLabel={t.common.close}
      footer={
        <div className="flex flex-col gap-3">
          {/* Сумма появляется сразу после выбора услуги: считать в уме
              мойщик не должен. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-medium text-m-muted">{t.work.toPay}</span>
            <span className="flex items-baseline gap-2">
              {c.discounted && !usingPass && (
                <span className="num text-[15px] text-m-faint line-through">
                  {formatMoney(c.listTotal, currency, t.locale)}
                </span>
              )}
              <span
                className={cn(
                  'num text-[30px] leading-none font-bold tracking-[-0.03em]',
                  c.discounted && !usingPass ? 'text-m-warn' : 'text-m-ink',
                )}
              >
                {sum}
              </span>
            </span>
          </div>

          {/* Абонемент первым и во всю ширину: если он у клиента есть,
              брать деньги повторно — прямая ошибка. */}
          {activePass && (
            <button
              type="button"
              aria-pressed={usingPass}
              onClick={() => {
                c.setPayment('pass');
                c.setPassId(activePass.id);
              }}
              className={cn(
                'm-press flex min-h-[54px] w-full items-center justify-between gap-2 rounded-m-row px-4',
                usingPass ? 'bg-m-grape text-white' : 'bg-m-tile text-m-ink',
              )}
            >
              <span className="flex items-center gap-2 text-[15.5px] font-semibold">
                <Ticket aria-hidden className="size-[19px]" />
                {t.payment.pass}
              </span>
              <span className="num text-[13.5px] opacity-80">
                {t.passes.remaining} {activePass.remaining}
              </span>
            </button>
          )}

          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.work.stepPayment}>
            {PAYMENTS.map((p) => {
              const on = c.payment === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    c.setPayment(p.key);
                    c.setPassId(null);
                  }}
                  className={cn(
                    'm-press flex min-h-[66px] flex-col items-center justify-center gap-1.5 rounded-m-row px-2',
                    on ? 'bg-m-grape text-white' : 'bg-m-tile text-m-ink',
                  )}
                >
                  <p.Icon aria-hidden className="size-[18px]" />
                  <span className="w-full truncate text-[12.5px] font-semibold">
                    {t.payment[p.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {c.error && (
            <p role="alert" className="text-[13.5px] font-semibold text-m-bad">
              {c.error}
            </p>
          )}

          {/* Последнее движение, и на нём написано, что произойдёт и за
              сколько. Лаймовое: это то самое действие, ради которого
              экран открыли. Пока номера, услуги или оплаты нет, кнопка
              бледнеет. */}
          <MButton tone="lime" block onClick={c.submit} disabled={!c.ready || c.pending}>
            {c.pending ? t.work.recording : t.work.addFor(addLabel, sum)}
          </MButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {/* Номер первым: сначала подъехала машина, потом решают, что с
            ней делают. Набор огромный — это опознавательный знак записи,
            и его перечитывают, прежде чем нажать «записать». */}
        <MField label={clientIdLabel} htmlFor="m-order-key">
          <MPlateInput
            id="m-order-key"
            ref={inputRef}
            value={c.clientKey}
            onChange={(e) =>
              c.setClientKey(
                clientIdType === 'phone'
                  ? e.target.value
                  : e.target.value.replace(/[\s-]+/g, '').toUpperCase(),
              )
            }
            onBlur={() => c.setClientKey(c.resolvedClientKey)}
            inputMode={clientIdType === 'phone' ? 'tel' : 'text'}
          />
        </MField>

        {/* Узнавание постоянного прямо при наборе — то, ради чего экран и
            существует: мойщик видит, что машина уже была, до того как
            назовёт цену. */}
        {c.known && (
          <p className="-mt-3 px-1 text-[13px] font-semibold text-m-grape">
            {t.work.knownClient(
              c.known.visits,
              agoLabel(c.known.lastSeenAt, t),
              c.money(c.known.total),
            )}
          </p>
        )}

        {/* Класс машины сразу под номером и ВЫШЕ услуг: класс принадлежит
            машине, выбирается один раз на заезд, и цены всех услуг ниже
            сразу пересчитываются. */}
        {tiers.length > 0 && (
          <Group label={tierLabel}>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tierLabel}>
              {tiers.map((name, i) => (
                <MChip key={name} selected={c.tier === i} onClick={() => c.setPicked(i)}>
                  {name}
                </MChip>
              ))}
            </div>
          </Group>
        )}

        {/* Услуги крупными плитками по две в ряд: список во всю ширину
            показывал четыре услуги на экран и заставлял прокручивать.
            Повторное касание снимает выбор. */}
        <Group label={t.work.stepService}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.work.stepService}>
            {services.map((s) => {
              const on = c.chosen.some((x) => x.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    c.setChosen((cur) => (on ? cur.filter((x) => x.id !== s.id) : [...cur, s]));
                    /* Набор услуг сменился, абонемент был от прежнего. */
                    if (c.payment === 'pass') {
                      c.setPayment(null);
                      c.setPassId(null);
                    }
                  }}
                  className={cn(
                    'm-press flex min-h-[74px] min-w-0 flex-col items-start justify-center gap-1 rounded-m-tile px-4 py-3 text-left',
                    on ? 'bg-m-grape text-white' : 'bg-m-tile text-m-ink',
                  )}
                >
                  <span className="w-full text-[15px] leading-snug font-semibold">{s.name}</span>
                  <span className={cn('num text-[13px]', on ? 'text-white/75' : 'text-m-muted')}>
                    {formatMoney(c.priceOf(s), currency, t.locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </Group>

        {/* Скидка свёрнута по умолчанию и стоит под услугами: это
            исключение, и вводит её тот, кто её правда даёт. Больше
            прайса ввести нельзя — сервер откажет, и поле это повторяет. */}
        {c.chosen.length > 0 &&
          !usingPass &&
          (c.showDiscount ? (
            <MField label={t.work.discounted} htmlFor="m-order-discount">
              <div className="relative">
                <MInput
                  id="m-order-discount"
                  className="num pr-11 text-right"
                  value={c.discountText}
                  onChange={(e) => c.setDiscountText(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder={String(c.listTotal)}
                  autoComplete="off"
                  autoFocus
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[15px] text-m-muted">
                  {currencySymbol(currency)}
                </span>
              </div>
            </MField>
          ) : (
            <button
              type="button"
              onClick={() => c.setShowDiscount(true)}
              className="m-press flex h-11 items-center gap-2 self-start rounded-full bg-m-tile px-4 text-[14.5px] font-semibold text-m-grape"
            >
              <Percent aria-hidden className="size-[17px]" strokeWidth={2.2} />
              {t.work.giveDiscount}
            </button>
          ))}

        {/* Кто мыл: между услугами и оплатой, потому что меняет сумму
            зарплаты, а не счёта. «Только я» по умолчанию — девять
            записей из десяти одиночные, и лишнее касание на них стоило
            бы сорока касаний за смену ради одного случая. */}
        {c.canShare && (
          <Group label={t.crew.who}>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.crew.who}>
              <Choice
                on={!c.together}
                onClick={() => {
                  c.setTogether(false);
                  /* Отметки снимаем сразу: свёрнутые они не видны, а
                     уходят на сервер и делят деньги молча. */
                  c.setHelpers([]);
                }}
              >
                {t.crew.onlyMe}
              </Choice>
              <Choice on={c.together} onClick={() => c.setTogether(true)}>
                {t.crew.together}
              </Choice>
            </div>

            {c.together &&
              (c.working.length === 0 ? (
                /* Коллеги есть, но все вне смены: пустой список читался
                   бы поломкой, а причина рабочая и поправимая. */
                <p className="px-1 pt-2.5 text-[13px] font-semibold text-m-warn">
                  {t.crew.nobodyOnShift}
                </p>
              ) : (
                <div className="flex flex-col gap-3 pt-2.5">
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t.crew.together}>
                    {c.working.map((m) => {
                      const on = c.crewIds.includes(m.id);
                      const full = !on && c.crewSize >= c.maxCrew;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          /* Потолок стоит и здесь, и на сервере: отказ не
                             должен прилетать после «добавить». */
                          disabled={full}
                          onClick={() =>
                            c.setHelpers((cur) =>
                              on ? cur.filter((id) => id !== m.id) : [...cur, m.id],
                            )
                          }
                          className={cn(
                            'm-press flex h-11 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold',
                            on ? 'bg-m-grape text-white' : 'bg-m-tile text-m-ink',
                            full && 'opacity-45',
                          )}
                        >
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: personColor(m.name) }}
                          />
                          {m.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Что получится — числами и до нажатия. Мойщик должен
                      увидеть СВОЮ долю раньше, чем согласится на
                      совместную запись, иначе вечером он узнает её из
                      ведомости и решит, что его обсчитали. */}
                  {c.crewIds.length === 0 ? (
                    <p className="px-1 text-[13px] text-m-muted">{t.crew.percentHint}</p>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-m-tile bg-m-tile p-4 text-[14px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-m-ink">
                          {staffCount(c.crewSize, staffRole, t.locale)}
                        </span>
                        <span className="num text-m-muted">
                          {t.crew.teamPercent} {c.split.percent}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-m-muted">
                        <span>{t.crew.pool}</span>
                        <span className="num font-semibold text-m-ink">
                          {formatMoney(c.split.pool, currency, t.locale)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-m-muted">
                        <span>{t.crew.yours}</span>
                        <span className="num text-[16px] font-bold text-m-ink">
                          {formatMoney(c.split.shares[0] ?? 0, currency, t.locale)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </Group>
        )}
      </div>
    </MCover>
  );
}

/** Подпись группы внутри формы — тем же кеглем, что подпись поля. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-[13px] font-semibold text-m-muted">{label}</span>
      {children}
    </div>
  );
}

/** Один из двух равноправных выходов: разница только в заливке. */
function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'm-press flex min-h-[52px] items-center justify-center rounded-m-row px-3 py-2 text-center text-[15px] font-semibold',
        on ? 'bg-m-grape text-white' : 'bg-m-tile text-m-ink',
      )}
    >
      {children}
    </button>
  );
}
