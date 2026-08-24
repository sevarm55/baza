'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Percent, Plus, Ticket, X } from 'lucide-react';

import { useT } from '@/lib/i18n/client';
import { currencySymbol, formatMoney } from '@/lib/money';
import { drop, retry } from '@/lib/offline';
import { crewSplit as _crewSplit, MAX_CREW } from '@/lib/crew';
import { hhmm } from '@/lib/time';
import { staffCount } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import { LoadingButton, RefreshIndicator } from '@/components/loading';
import { MobileActionBar, MobileButton, MobileOnly, DesktopOnly } from '@/components/mobile';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { FormMessage } from '@/components/patterns/form';
import { MoneyValue } from '@/components/patterns/metric';
import { PersonDot } from '@/components/patterns/person';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { useIsMobile } from '@/hooks/use-mobile';
import { RevokeOrder } from './revoke-order';
import { ComposerMobile } from './composer-mobile';
import { ShiftJournalMobile } from './journal-mobile';
import { useComposer } from './use-composer';
import { agoLabel, paymentLabel, type OrderFlowProps } from './order-model';
import { PAYMENTS } from './payment-icons';


/* Выбранная фишка: рамка и заливка бренда, как у выбранной строки в
   кабинете. Одна и та же для класса, коллеги, услуги. */
const PICKED =
  'aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground aria-pressed:hover:bg-primary-soft';

/**
 * Экран записи — один контроллер, два представления.
 *
 * Состояние, правила и отправка живут в `useComposer` и считаются ровно
 * один раз: досылка накопленного без связи и поиск клиента при наборе —
 * это работа, а не отрисовка, и делать её дважды значит дважды отправить
 * одну машину.
 *
 * Журнал показан обоими представлениями сразу, а переключает их CSS:
 * страница приезжает с сервера, и выбор по ширине окна в браузере
 * означал бы вспышку чужой раскладки на первой отрисовке.
 *
 * Форма записи, наоборот, выбирается в браузере — и мигнуть не может:
 * до неё нельзя добраться иначе как нажатием, а нажатие бывает только
 * после того, как страница ожила.
 */
export function OrderFlow({
  canWrite,
  services,
  tiers,
  tierLabel,
  currency,
  clientIdLabel,
  clientIdType,
  unitOne,
  addLabel,
  recent,
  timezone,
  shiftOpen,
  mates,
  teamPercent,
  staffRole,
  highlightAdd = false,
}: OrderFlowProps) {
  const t = useT();
  const router = useRouter();
  const isMobile = useIsMobile();

  const c = useComposer({ canWrite, tiers, currency, clientIdType, mates, teamPercent });
  const {
    step,
    clientKey,
    chosen,
    tier,
    payment,
    showDiscount,
    discountText,
    known,
    error,
    saved,
    pending,
    syncing,
    queue,
    queued,
    stuck,
    resolvedClientKey,
    priceOf,
    listTotal,
    charged,
    discounted,
    canShare,
    working,
    crewIds,
    crewSize,
    split,
    ready,
    money,
    setStep,
    setClientKey,
    setChosen,
    setPicked,
    setPayment,
    setPassId,
    setShowDiscount,
    setDiscountText,
    setHelpers,
    setTogether,
    together,
    close,
    submit,
  } = c;

  /* Каретка встаёт в поле номера сама, как только форма открылась: это
     первое, что человек набирает, и лишнее касание здесь стоит сорок
     касаний за смену. Фокус живёт в представлении, а не в правилах: на
     экране их два, а поле — ровно одно, то, которое сейчас видно. */
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'compose' && !isMobile) inputRef.current?.focus();
  }, [step, isMobile]);

  /* ------------------------------ журнал ------------------------------ */

  /* Вне смены и без единой записи журнала нет вовсе: состояние уже
     названо строкой под заработком и подписью под кнопкой. Как только
     смену откроют или появится хоть одна запись, он возвращается. */
  const nothingYet = recent.length === 0 && queue.length === 0;
  /* Место под меню строки резервируется у всех строк, когда оно есть
     хотя бы у одной: иначе суммы в соседних строках разъезжаются. */
  const anyMine = recent.some((o) => o.mine);
  const journal = !shiftOpen && nothingYet ? null : (
    <Panel
      title={t.work.recent}
      count={nothingYet ? undefined : recent.length + queue.length}
      padded={false}
      actions={<RefreshIndicator active={syncing} label={t.common.refreshing} />}
    >
      {nothingYet ? (
        /* Пусто до смены и пусто на смене разные ответы. */
        <EmptyState
          compact
          title={shiftOpen ? t.work.emptyOpen : t.work.emptyOff}
          description={shiftOpen ? t.work.emptyOpenNote : t.work.emptyOffNote}
        />
      ) : (
        <ul className="divide-y divide-border">
          {/* Отвергнутые первыми и с разбором: названы тем, что есть,
              вместе с причиной, и решает человек. Сама очередь работу
              мойщика не выбрасывает. */}
          {stuck.map((q) => (
            <li key={q.ref} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="num truncate text-sm font-semibold">{q.clientKey}</div>
                <div className="truncate text-xs text-destructive">
                  {[q.serviceName, q.failure].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      retry(q.ref);
                      router.refresh();
                    }}
                  >
                    {t.payroll.retry}
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => drop(q.ref)}>
                    {t.expenses.remove}
                  </Button>
                </div>
              </div>
              <MoneyValue className="shrink-0 text-sm font-semibold">{money(q.price)}</MoneyValue>
              {anyMine && <span className="size-8 shrink-0" aria-hidden />}
            </li>
          ))}

          {queued.map((q) => (
            <li key={q.ref} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="num truncate text-sm font-semibold">{q.clientKey}</div>
                <div className="truncate text-xs text-warning">
                  {[q.serviceName, t.work.pending].join(' · ')}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <MoneyValue className="block text-sm font-semibold">{money(q.price)}</MoneyValue>
                <span className="num block text-xs text-muted-foreground">{hhmm(q.at, timezone)}</span>
              </div>
              {anyMine && <span className="size-8 shrink-0" aria-hidden />}
            </li>
          ))}

          {recent.map((o) => {
            /* Номер машины крупно, услуга и оплата под ним: искать свою
               ошибку по названию услуги значит читать список целиком. */
            const shared = o.crew > 1;
            const detail = [
              o.serviceName,
              paymentLabel(o.payment, t),
              hhmm(o.at, timezone),
              /* Совместная словом и числом людей: иначе цена 12 000 при
                 заработке 1 800 необъяснима. */
              shared ? `${t.crew.joint} · ${staffCount(o.crew, staffRole, t.locale)}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-sm font-semibold">
                    {o.clientKey ?? o.serviceName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.clientKey ? detail : `${paymentLabel(o.payment, t)} · ${hhmm(o.at, timezone)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <MoneyValue className="block text-sm font-semibold">{money(o.price)}</MoneyValue>
                  {/* Своя доля только у совместной: у одиночной она и
                      так вся сверху. */}
                  {shared && (
                    <MoneyValue className="block text-xs text-muted-foreground">
                      {money(o.earned)}
                    </MoneyValue>
                  )}
                </div>
                {/* Отменить можно только свою запись, см. `Recent.mine`. */}
                {o.mine ? (
                  <RevokeOrder
                    orderId={o.id}
                    title={o.clientKey ?? o.serviceName}
                    detail={`${o.serviceName} · ${money(o.price)}`}
                  />
                ) : (
                  anyMine && <span className="size-8 shrink-0" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  /* ------------------------------ главная ------------------------------ */
  /* Вне смены и без единой записи показывать нечего: пустая коробка
     добавила бы странице лишний отступ. */
  const nothingToShow = !canWrite && !saved && queued.length === 0 && journal === null;

  const desktopHome = nothingToShow ? null : (
      <div className="flex flex-col gap-4">
        {/* Кнопка есть только тогда, когда ею можно пользоваться: вне
            смены на её месте стоит начало смены, см. StartShift. */}
        {canWrite && (
          <Button
            type="button"
            size="lg"
            className={cn(
              'h-12 w-full text-[15px]',
              /* Подсветка сценария первого запуска: кольцо на той самой
                 кнопке, которую называет плашка над экраном. */
              highlightAdd && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
            )}
            onClick={() => setStep('compose')}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {addLabel}
          </Button>
        )}

        {/* «Записано» строкой, а не экраном: ничего не закрывает, а
            подтверждение, которому верят, машина в журнале ниже. */}
        {saved && <FormMessage tone="success">{t.work.saved}</FormMessage>}

        {/* Работа не потерялась, даже если связи нет прямо сейчас.
            Отвергнутые здесь не считаем: они ждут решения в журнале. */}
        {queued.length > 0 && (
          <FormMessage tone="info" className="text-warning">
            {t.work.waitingToSend(queued.length)}
          </FormMessage>
        )}

        {journal}
      </div>
  );

  /* ----------------------------- запись ------------------------------ */
  /* Абонемент покрывает ОДНУ услугу, поэтому предлагается только когда
     выбрана одна. */
  const single = chosen.length === 1 ? chosen[0] : null;
  const activePass = single
    ? known?.passes?.find((p) => p.serviceId === single.id)
    : undefined;
  /* Абонемент выбран, а клиент сменил услугу: списывать больше нечего. */
  const usingPass = payment === 'pass' && Boolean(activePass);
  const sum = usingPass ? t.payment.pass : formatMoney(charged, currency);

  const desktopCompose = (
    <div className="flex flex-col gap-4">
      <Panel
        title={t.work.newUnit(unitOne)}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.common.cancel}
            disabled={pending}
            onClick={close}
          >
            <X aria-hidden />
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {saved && <FormMessage tone="success">{t.work.saved}</FormMessage>}

          {/* Номер первым: сначала подъехала машина, потом решают, что с
              ней делают. Пробел и дефис не принимаем вовсе: номер
              выглядит одинаково везде с первой набранной буквы. */}
          <Field>
            <FieldLabel htmlFor="order-client-key">{clientIdLabel}</FieldLabel>
            <Input
              id="order-client-key"
              ref={inputRef}
              className="num h-11 text-lg uppercase md:text-lg"
              value={clientKey}
              onChange={(e) =>
                setClientKey(
                  clientIdType === 'phone'
                    ? e.target.value
                    : e.target.value.replace(/[\s-]+/g, '').toUpperCase(),
                )
              }
              onBlur={() => setClientKey(resolvedClientKey)}
              inputMode={clientIdType === 'phone' ? 'tel' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            {/* Узнавание постоянного прямо при наборе: мойщик видит, что
                машина уже была, до того как назовёт цену. */}
            {known && (
              <FormMessage tone="success" className="text-xs">
                {t.work.knownClient(
                  known.visits,
                  agoLabel(known.lastSeenAt, t),
                  money(known.total),
                )}
              </FormMessage>
            )}
          </Field>

          {/* Класс машины сразу под номером и ВЫШЕ услуг: класс
              принадлежит машине, выбирается один раз на заезд, и цены
              всех услуг ниже сразу пересчитываются. */}
          {tiers.length > 0 && (
            <div className="flex flex-col gap-2">
              <Caption>{tierLabel}</Caption>
              <div className="flex flex-wrap gap-2" role="group" aria-label={tierLabel}>
                {tiers.map((name, i) => (
                  <Toggle
                    key={name}
                    variant="outline"
                    size="lg"
                    className={cn('h-11 px-4 bg-card', PICKED)}
                    pressed={tier === i}
                    onPressedChange={() => setPicked(i)}
                  >
                    {name}
                  </Toggle>
                ))}
              </div>
            </div>
          )}

          {/* Услуги плитками с ценой, которую сейчас возьмут. Повторное
              нажатие снимает выбор; выбрать можно несколько. */}
          <div className="flex flex-col gap-2">
            <Caption>{t.work.stepService}</Caption>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={t.work.stepService}>
              {services.map((s) => {
                const on = chosen.some((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      'flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                      on
                        ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                        : 'border-border bg-card hover:bg-muted',
                    )}
                    onClick={() => {
                      setChosen((cur) =>
                        on ? cur.filter((x) => x.id !== s.id) : [...cur, s],
                      );
                      /* Набор услуг сменился, абонемент был от прежнего. */
                      if (payment === 'pass') {
                        setPayment(null);
                        setPassId(null);
                      }
                    }}
                  >
                    <span className="line-clamp-2 w-full text-sm leading-snug font-medium">{s.name}</span>
                    <span className={cn('num text-xs', on ? 'opacity-80' : 'text-muted-foreground')}>
                      {formatMoney(priceOf(s), currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Скидка свёрнута по умолчанию: исключение, и вводит её тот,
              кто её правда даёт. Больше прайса ввести нельзя. */}
          {chosen.length > 0 && !usingPass && (
            showDiscount ? (
              <Field>
                <FieldLabel htmlFor="order-discount">{t.work.discounted}</FieldLabel>
                <InputGroup className="h-11">
                  <InputGroupInput
                    id="order-discount"
                    className="num text-end text-base"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder={String(listTotal)}
                    autoComplete="off"
                    autoFocus
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-ml-2 text-muted-foreground"
                  onClick={() => setShowDiscount(true)}
                >
                  <Percent data-icon="inline-start" aria-hidden />
                  {t.work.giveDiscount}
                </Button>
              </div>
            )
          )}

          {/* Кто мыл: между услугами и оплатой, потому что меняет сумму
              зарплаты, а не счёта. «Только я» по умолчанию: девять
              записей из десяти одиночные. */}
          {canShare && (
            <div className="flex flex-col gap-2">
              <Caption>{t.crew.who}</Caption>
              {/* Две плитки, а не полоса вкладок: «вместе с коллегами»
                  по-армянски не помещается в половину ширины телефона
                  одной строкой, и подписи здесь разрешено переноситься. */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.crew.who}>
                <Toggle
                  variant="outline"
                  size="lg"
                  className={cn('h-auto min-h-11 bg-card px-3 py-2 whitespace-normal', PICKED)}
                  pressed={!together}
                  onPressedChange={() => {
                    setTogether(false);
                    /* Отметки снимаем сразу: свёрнутые они не видны, а
                       уходят на сервер и делят деньги молча. */
                    setHelpers([]);
                  }}
                >
                  {t.crew.onlyMe}
                </Toggle>
                <Toggle
                  variant="outline"
                  size="lg"
                  className={cn('h-auto min-h-11 bg-card px-3 py-2 whitespace-normal', PICKED)}
                  pressed={together}
                  onPressedChange={() => setTogether(true)}
                >
                  {t.crew.together}
                </Toggle>
              </div>

              {together &&
                (working.length === 0 ? (
                  /* Коллеги есть, но все вне смены: пустой список читался
                     бы поломкой, а причина рабочая и поправимая. */
                  <FormMessage tone="info" className="text-warning">
                    {t.crew.nobodyOnShift}
                  </FormMessage>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t.crew.together}>
                      {working.map((m) => {
                        const on = crewIds.includes(m.id);
                        return (
                          <Toggle
                            key={m.id}
                            variant="outline"
                            size="lg"
                            className={cn('h-11 gap-2 bg-card px-3.5', PICKED)}
                            pressed={on}
                            /* Потолок стоит и здесь, и на сервере: отказ
                               не должен прилетать после «добавить». */
                            disabled={!on && crewSize >= MAX_CREW}
                            onPressedChange={() =>
                              setHelpers((cur) =>
                                on ? cur.filter((id) => id !== m.id) : [...cur, m.id],
                              )
                            }
                          >
                            <PersonDot name={m.name} />
                            {m.name}
                          </Toggle>
                        );
                      })}
                    </div>

                    {/* Что получится, числами и до нажатия: мойщик видит
                        СВОЮ долю раньше, чем согласится. Числа те же, что
                        посчитает сервер. */}
                    {crewIds.length === 0 ? (
                      <FieldDescription className="text-xs">{t.crew.percentHint}</FieldDescription>
                    ) : (
                      <div className="flex flex-col gap-1.5 rounded-md bg-muted p-3 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium">{staffCount(crewSize, staffRole, t.locale)}</span>
                          <span className="num text-muted-foreground">
                            {t.crew.teamPercent} {split.percent}%
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                          <span>{t.crew.pool}</span>
                          <MoneyValue className="font-medium text-foreground">
                            {formatMoney(split.pool, currency)}
                          </MoneyValue>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                          <span>{t.crew.yours}</span>
                          <MoneyValue className="font-semibold text-foreground">
                            {formatMoney(split.shares[0] ?? 0, currency)}
                          </MoneyValue>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Итог и оплата низом, у большого пальца руки. Сумма появляется
              сразу после выбора услуги: считать в уме мойщик не должен. */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t.work.toPay}</span>
              <span className="flex items-baseline gap-2">
                {/* Зачёркнутый прайс рядом со взятой суммой: без него
                    скидку не видно ни мойщику, ни тому, кто смотрит
                    через плечо. */}
                {discounted && !usingPass && (
                  <MoneyValue className="text-sm text-muted-foreground line-through">
                    {formatMoney(listTotal, currency)}
                  </MoneyValue>
                )}
                <MoneyValue
                  tone={discounted && !usingPass ? 'warning' : 'default'}
                  className="text-2xl leading-none font-semibold tracking-[-0.02em]"
                >
                  {sum}
                </MoneyValue>
              </span>
            </div>

            <Caption>{t.work.stepPayment}</Caption>

            {/* Абонемент первым и во всю ширину: если он у клиента есть,
                брать деньги повторно прямая ошибка. */}
            {activePass && (
              <Button
                type="button"
                variant={usingPass ? 'default' : 'outline'}
                size="lg"
                className="h-11 w-full justify-between px-4"
                aria-pressed={usingPass}
                onClick={() => {
                  setPayment('pass');
                  setPassId(activePass.id);
                }}
              >
                <span className="flex items-center gap-2">
                  <Ticket className="size-[18px]" aria-hidden />
                  {t.payment.pass}
                </span>
                <span className="num font-normal">
                  {t.passes.remaining} {activePass.remaining}
                </span>
              </Button>
            )}

            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.work.stepPayment}>
              {PAYMENTS.map((p) => {
                const on = payment === p.key;
                return (
                  <Button
                    key={p.key}
                    type="button"
                    variant={on ? 'default' : 'outline'}
                    size="lg"
                    className="h-14 flex-col gap-1 px-2 text-xs sm:h-11 sm:flex-row sm:gap-2 sm:text-sm"
                    aria-pressed={on}
                    onClick={() => {
                      setPayment(p.key);
                      setPassId(null);
                    }}
                  >
                    <p.Icon className="size-[18px]" aria-hidden />
                    {t.payment[p.key]}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Последнее движение, и на нём написано, что произойдёт и за
              сколько. Пока номера, услуги или оплаты нет, кнопка погашена. */}
          <div className="flex flex-col gap-2">
            <LoadingButton
              type="button"
              size="lg"
              className="h-12 w-full text-[15px]"
              busy={pending}
              disabled={!ready}
              label={t.work.addFor(addLabel, sum)}
              busyLabel={t.work.recording}
              onClick={submit}
            />

            {error && <FormMessage tone="error">{error}</FormMessage>}

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
              disabled={pending}
              onClick={close}
            >
              {t.common.cancel}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Журнал остаётся на экране и во время записи: только что
          записанная машина появляется в нём сразу под формой. */}
      {journal}
    </div>
  );

  /* --------------------------- два экрана --------------------------- */

  return (
    <>
      {/* Телефон: журнал строками на полотне, кнопка записи прибита к
          низу — у большого пальца руки, которой держат телефон. Форма
          записи приезжает поверх экрана целиком, а не встраивается в
          страницу: на ней три вещи, которые должны быть видны
          одновременно, — номер, услуги и оплата. */}
      <MobileOnly className="flex flex-col gap-3">
        {saved && (
          <p className="px-1 text-[13px] font-semibold text-m-good" role="status">
            {t.work.saved}
          </p>
        )}
        {queued.length > 0 && (
          <p className="px-1 text-[13px] font-medium text-m-warn" role="status">
            {t.work.waitingToSend(queued.length)}
          </p>
        )}

        <ShiftJournalMobile
          c={c}
          recent={recent}
          timezone={timezone}
          shiftOpen={shiftOpen}
          staffRole={staffRole}
        />

        {/* Место под прибитую кнопку: без него последняя запись журнала
            навсегда осталась бы под ней. */}
        <div aria-hidden className="h-[76px]" />

        <MobileActionBar>
          {/* Вне смены записывать нельзя, и кнопка показывает это собой,
              а не окошком с отказом. Причина не в дисциплине: машина,
              записанная вне смены, не попадает в сдачу наличных при
              закрытии — деньги за неё работник уносит, ничего не
              нарушив, а владелец недосчитывается и не понимает почему. */}
          {!canWrite && (
            <p className="text-center text-[12.5px] text-m-muted">{t.work.needShift}</p>
          )}
          <MobileButton
            disabled={!canWrite}
            onClick={() => setStep('compose')}
            className={cn(
              highlightAdd && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-m-board',
            )}
          >
            <Plus aria-hidden className="size-[18px]" />
            {addLabel}
          </MobileButton>
        </MobileActionBar>
      </MobileOnly>

      {/* Форма выбирается в браузере, и мигнуть чужой раскладкой не
          может: до неё нельзя добраться иначе как нажатием. Два поля с
          одним `ref` на экране быть не должно — поэтому ровно одна. */}
      {step === 'compose' && isMobile && (
        <ComposerMobile
          c={c}
          services={services}
          tiers={tiers}
          tierLabel={tierLabel}
          currency={currency}
          clientIdLabel={clientIdLabel}
          clientIdType={clientIdType}
          addLabel={addLabel}
          unitOne={unitOne}
          staffRole={staffRole}
        />
      )}

      <DesktopOnly display="contents">
        {step === 'compose' && !isMobile ? desktopCompose : desktopHome}
      </DesktopOnly>
    </>
  );
}

/* ------------------------------ мелочи ------------------------------ */

/** Подпись группы внутри формы: тем же кеглем, что подпись поля. */
function Caption({ children }: { children: string }) {
  return <div className="text-sm font-medium">{children}</div>;
}
